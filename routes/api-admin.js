'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const { hashPassword, generateTempPassword } = require('../lib/password');
const { requireAuth, requireLead } = require('../middleware/auth');
const { autoGenerate } = require('../schedule-generator');
const { defaultAdminDateRange } = require('../lib/shift-times');

const AUDIT_LOG_PATH = path.join(__dirname, '..', 'audit.log');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', requireAuth, async (req, res) => {
  const users = await usersModel.listUsers({ activeOnly: true, role: 'member' });
  const dates = defaultAdminDateRange();
  const gridByUserId = await shiftsModel.getGridForDates(dates);

  const schedule = {};
  dates.forEach((d) => {
    schedule[d] = {};
    users.forEach((u) => {
      const code = gridByUserId[d]?.[u.id];
      if (code) schedule[d][u.display_name] = code;
    });
  });

  res.json({
    system: 'SOCGrid',
    people: users.map((u) => ({ id: u.id, name: u.display_name })),
    dates,
    schedule
  });
});

router.post('/', requireLead, async (req, res) => {
  const payload = req.body;
  if (!payload || !Array.isArray(payload.people) || !Array.isArray(payload.dates) || typeof payload.schedule !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const peopleInput = payload.people
    .map((item) => ({ id: item && item.id != null ? Number(item.id) : null, name: String(item?.name || '').trim() }))
    .filter((p) => p.name);
  const dates = payload.dates.map((item) => String(item || '').trim()).filter(Boolean);

  if (!peopleInput.length || !dates.length) {
    return res.status(400).json({ error: 'At least one operator and one date are required.' });
  }
  const names = peopleInput.map((p) => p.name);
  if (new Set(names).size !== names.length) {
    return res.status(400).json({ error: 'Operator names must be unique.' });
  }
  if (new Set(dates).size !== dates.length) {
    return res.status(400).json({ error: 'Duplicate dates are not allowed.' });
  }
  if (!dates.every((date) => ISO_DATE.test(date))) {
    return res.status(400).json({ error: 'Dates must be ISO format YYYY-MM-DD.' });
  }

  try {
    const createdAccounts = [];
    const resolved = []; // [{ id, name }] final, in the same order as peopleInput

    for (const p of peopleInput) {
      if (p.id != null) {
        const existing = await usersModel.getUserById(p.id);
        if (!existing) throw new Error(`Operator id ${p.id} no longer exists — reload and try again.`);
        // The schedule roster only ever manages member accounts — leads are
        // account/permission holders, not something a schedule save can touch.
        if (existing.role !== 'member') throw new Error(`"${existing.display_name}" is a lead account and can't be edited from the schedule roster.`);
        if (existing.display_name !== p.name || !existing.active) {
          await usersModel.updateUser(p.id, { display_name: p.name, active: 1 });
        }
        resolved.push({ id: p.id, name: p.name });
      } else {
        const username = await usersModel.suggestUsername(p.name);
        const tempPassword = generateTempPassword();
        const user = await usersModel.createUser({
          username,
          passwordHash: hashPassword(tempPassword),
          displayName: p.name,
          role: 'member',
          active: 1
        });
        createdAccounts.push({ username, tempPassword, displayName: p.name });
        resolved.push({ id: user.id, name: p.name });
      }
    }

    // Deactivate members previously active who are no longer in the submitted
    // roster. Scoped to role='member' so this can never touch a lead account
    // (including the currently logged-in lead saving this very request).
    const keepIds = new Set(resolved.map((r) => r.id));
    const activeMembers = await usersModel.listUsers({ activeOnly: true, role: 'member' });
    for (const u of activeMembers) {
      if (!keepIds.has(u.id)) await usersModel.updateUser(u.id, { active: 0 });
    }

    // Upsert exactly the submitted (date, person) cells — never touches shifts
    // for dates outside this payload.
    for (const date of dates) {
      const row = payload.schedule[date] || {};
      for (const r of resolved) {
        const code = row[r.name] || 'X';
        await shiftsModel.upsertShiftForUserOnDate(r.id, date, code);
      }
    }

    const who = req.authUser || 'admin';
    await fs.appendFile(
      AUDIT_LOG_PATH,
      `[${new Date().toISOString()}] ${who} saved schedule — ${resolved.length} operators, ${dates.length} dates${createdAccounts.length ? `, ${createdAccounts.length} new account(s)` : ''}\n`
    );

    res.json({ ok: true, people: resolved, createdAccounts });
  } catch (error) {
    res.status(500).json({ error: 'Unable to save admin changes: ' + error.message });
  }
});

router.post('/autogenerate', requireLead, async (req, res) => {
  const payload = req.body || {};
  const people = Array.isArray(payload.people) ? payload.people.map((item) => String(item || '').trim()).filter(Boolean) : [];
  const dates = Array.isArray(payload.dates) ? payload.dates.map((item) => String(item || '').trim()).filter(Boolean) : [];

  if (!people.length || !dates.length) {
    return res.status(400).json({ error: 'At least one operator and one date are required.' });
  }
  if (!dates.every((date) => ISO_DATE.test(date))) {
    return res.status(400).json({ error: 'Dates must be ISO format YYYY-MM-DD.' });
  }

  try {
    // A person counts as "already fixed" for this range if they have even one
    // existing shift somewhere in it — manual/picture-matched schedules stay
    // completely untouched. Only people with zero data in range get generated;
    // everyone else's real values are echoed back unchanged so the client's
    // merge (schedule[date] = result) never wipes anything out.
    const nameToUser = {};
    (await usersModel.listUsers({ role: 'member' })).forEach((u) => { nameToUser[u.display_name] = u; });

    const existingRows = await shiftsModel.getShiftRowsForDates(dates);
    const userIdsWithData = new Set(existingRows.map((r) => r.user_id));

    const openNames = people.filter((name) => {
      const u = nameToUser[name];
      return u && !userIdsWithData.has(u.id);
    });
    const fixedNames = people.filter((name) => !openNames.includes(name));

    const gridByUserId = await shiftsModel.getGridForDates(dates);
    const buildFixedRow = (date) => {
      const row = {};
      fixedNames.forEach((name) => {
        const u = nameToUser[name];
        row[name] = (u && gridByUserId[date]?.[u.id]) || 'X';
      });
      return row;
    };

    if (!openNames.length) {
      const schedule = {};
      dates.forEach((date) => { schedule[date] = buildFixedRow(date); });
      return res.json({
        schedule,
        source: 'none',
        note: 'Everyone in this range already has a schedule — nothing open to fill.',
        repairs: [],
        stats: {}
      });
    }

    const result = await autoGenerate(openNames, dates, { useAi: payload.useAi !== false });

    const schedule = {};
    dates.forEach((date) => {
      schedule[date] = { ...buildFixedRow(date), ...(result.schedule[date] || {}) };
    });

    const notes = [];
    if (fixedNames.length) notes.push(`${fixedNames.length} operator(s) already scheduled in this range were left unchanged: ${fixedNames.join(', ')}.`);
    if (result.note) notes.push(result.note);

    res.json({ schedule, source: result.source, note: notes.join(' ') || null, repairs: result.repairs, stats: result.stats });
  } catch (error) {
    res.status(500).json({ error: 'Auto-generate failed: ' + error.message });
  }
});

module.exports = router;
