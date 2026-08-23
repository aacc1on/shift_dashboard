'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const store = require('../data-store');
const { requireAuth } = require('../middleware/auth');
const { autoGenerate } = require('../schedule-generator');

const AUDIT_LOG_PATH = path.join(__dirname, '..', 'audit.log');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

router.use(requireAuth);

router.get('/', async (req, res) => {
  const data = await store.load();
  res.json({
    system: data.system,
    people: data.people,
    dates: data.dates,
    schedule: data.schedule,
    shiftTimes: store.SHIFT_TIMES
  });
});

router.post('/', async (req, res) => {
  const payload = req.body;
  if (!payload || !Array.isArray(payload.people) || !Array.isArray(payload.dates) || typeof payload.schedule !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const people = payload.people.map((item) => String(item || '').trim()).filter(Boolean);
  const dates = payload.dates.map((item) => String(item || '').trim()).filter(Boolean);

  if (!people.length || !dates.length) {
    return res.status(400).json({ error: 'At least one operator and one date are required.' });
  }

  if (new Set(dates).size !== dates.length) {
    return res.status(400).json({ error: 'Duplicate dates are not allowed.' });
  }

  if (!dates.every((date) => ISO_DATE.test(date))) {
    return res.status(400).json({ error: 'Dates must be ISO format YYYY-MM-DD.' });
  }

  try {
    const saved = await store.save({ people, dates, schedule: payload.schedule });
    const who = req.authUser || 'admin';
    await fs.appendFile(AUDIT_LOG_PATH, `[${new Date().toISOString()}] ${who} saved schedule — ${people.length} operators, ${dates.length} dates\n`);
    res.json({ ok: true, system: saved.system });
  } catch (error) {
    res.status(500).json({ error: 'Unable to save admin changes.' });
  }
});

router.post('/autogenerate', async (req, res) => {
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
    const result = await autoGenerate(people, dates, { useAi: payload.useAi !== false });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Auto-generate failed: ' + error.message });
  }
});

module.exports = router;