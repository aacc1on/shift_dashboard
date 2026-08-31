'use strict';

const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const { nowIso } = require('../lib/shift-times');
const { SHIFT_META } = require('../lib/shift-times');
const { requireAuth } = require('../middleware/auth');

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekRange(weekOffset) {
  const now = new Date(nowIso());
  const yerevanNow = new Date(now.getTime() + 4 * 3600000); // for weekday math only
  const day = yerevanNow.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(
    yerevanNow.getUTCFullYear(), yerevanNow.getUTCMonth(), yerevanNow.getUTCDate() + mondayOffset + (weekOffset * 7)
  ));
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));

  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { mondayStr: fmt(monday), sundayStr: fmt(sunday) };
}

function datesBetween(startStr, endStr) {
  const dates = [];
  let cursor = startStr;
  while (cursor <= endStr) {
    dates.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    cursor = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  return dates;
}

router.get('/', requireAuth, async (req, res) => {
  const parsed = Number.parseInt(req.query.week, 10);
  const week = Number.isFinite(parsed) ? parsed : 0;
  const { mondayStr, sundayStr } = getWeekRange(week);
  const weekDates = datesBetween(mondayStr, sundayStr);

  const users = await usersModel.listUsers({ activeOnly: true, role: 'member' });
  const gridByUserId = await shiftsModel.getGridForDates(weekDates);

  // Re-key by display name to match the existing view's expectations.
  const schedule = {};
  weekDates.forEach((d) => {
    schedule[d] = {};
    users.forEach((u) => {
      const code = gridByUserId[d]?.[u.id];
      if (code) schedule[d][u.display_name] = code;
    });
  });

  res.render('index', {
    system: 'SOCGrid',
    people: users.map((u) => u.display_name),
    dates: weekDates,
    schedule,
    shiftTimes: SHIFT_META,
    week,
    weekLabel: `${mondayStr} → ${sundayStr}`,
    authUserId: req.authUserId
  });
});

module.exports = router;
