'use strict';

const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const { nowIso } = require('../lib/shift-times');
const { requireAuth } = require('../middleware/auth');

// Which shift type SHOULD be running right now, purely by time of day
// (D 09-17, E 17-01, N 01-09 Yerevan). Used so "uncovered" only fires for
// the window actually happening now — not for an evening shift that simply
// hasn't started yet, or a night shift that already finished this morning.
function currentExpectedType(iso) {
  const yerevanHour = new Date(new Date(iso).getTime() + 4 * 3600000).getUTCHours();
  if (yerevanHour >= 9 && yerevanHour < 17) return 'D';
  if (yerevanHour >= 17 || yerevanHour < 1) return 'E';
  return 'N';
}

function buildPersonStatus(user, now) {
  const current = shiftsModel.getCurrentShiftForUser(user.id, now);
  const next = shiftsModel.getNextShiftForUser(user.id, now);
  const nowMs = new Date(now).getTime();

  let currentOut = null;
  if (current) {
    const startMs = new Date(current.start_at).getTime();
    const endMs = new Date(current.end_at).getTime();
    currentOut = {
      code: current.type,
      start: current.start_at,
      end: current.end_at,
      elapsed: nowMs - startMs,
      remaining: endMs - nowMs,
      total: endMs - startMs,
      progress: Math.floor(((nowMs - startMs) / (endMs - startMs)) * 100)
    };
  }

  let nextOut = null;
  if (next) {
    nextOut = {
      code: next.type,
      start: next.start_at,
      end: next.end_at,
      startsIn: new Date(next.start_at).getTime() - nowMs
    };
  }

  return {
    todayCode: currentOut ? currentOut.code : 'X',
    current: currentOut,
    next: nextOut
  };
}

router.get('/status', requireAuth, (req, res) => {
  const now = nowIso();
  const users = usersModel.listUsers({ activeOnly: true, role: 'member' });

  const responseData = {
    system: 'SOCGrid',
    serverTime: now,
    data: {},
    warnings: []
  };

  const coverage = { D: 0, E: 0, N: 0 };

  users.forEach((user) => {
    const status = buildPersonStatus(user, now);
    responseData.data[user.display_name] = status;
    if (status.current && coverage[status.current.code] !== undefined) {
      coverage[status.current.code] += 1;
    }
  });

  // Only the shift type actually happening right now can be "uncovered" —
  // checking every type someone happened to be assigned sometime today
  // produced false alarms for shifts that hadn't started yet or already ended.
  const warningText = { D: 'DAY SHIFT UNCOVERED', E: 'EVENING SHIFT UNCOVERED', N: 'NIGHT SHIFT UNCOVERED' };
  const expected = currentExpectedType(now);
  if (coverage[expected] === 0) {
    responseData.warnings.push({ shift: expected, message: warningText[expected] });
  }

  res.json(responseData);
});

// Powers the swap-request form: shifts the logged-in user could offer, and
// the colleagues they could offer them to.
router.get('/my-shifts', requireAuth, (req, res) => {
  const shifts = shiftsModel.getUpcomingShiftsForUser(req.authUserId, nowIso());
  res.json(shifts.map((s) => ({ id: s.id, type: s.type, start: s.start_at, end: s.end_at })));
});

router.get('/colleagues', requireAuth, (req, res) => {
  const colleagues = usersModel.listUsers({ activeOnly: true, role: 'member' })
    .filter((u) => u.id !== req.authUserId)
    .map((u) => ({ id: u.id, name: u.display_name }));
  res.json(colleagues);
});

module.exports = router;
