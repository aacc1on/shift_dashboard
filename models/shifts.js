'use strict';

const db = require('../db');
const { computeShiftWindow, utcIsoToLocalDate } = require('../lib/shift-times');

// Returns { [dateStr]: { [userId]: 'D'|'E'|'N' } } for the given list of
// Yerevan calendar dates. Only rows whose window overlaps the requested
// dates are fetched, then bucketed by the date the shift is assigned to.
function getGridForDates(dates) {
  if (!dates.length) return {};
  const sorted = [...dates].sort();
  const rangeStart = computeShiftWindow(sorted[0], 'N').startAt; // earliest possible start that day
  const rangeEnd = computeShiftWindow(sorted[sorted.length - 1], 'E').endAt; // latest possible end that day

  const rows = db.prepare(
    'SELECT id, user_id, start_at, end_at, type, status FROM shifts WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
  ).all(rangeStart, rangeEnd);

  const dateSet = new Set(dates);
  const grid = {};
  dates.forEach((d) => { grid[d] = {}; });

  rows.forEach((row) => {
    const dateStr = utcIsoToLocalDate(row.start_at);
    if (!dateSet.has(dateStr)) return;
    grid[dateStr][row.user_id] = row.type;
  });

  return grid;
}

function getShiftRowsForDates(dates) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const rangeStart = computeShiftWindow(sorted[0], 'N').startAt;
  const rangeEnd = computeShiftWindow(sorted[sorted.length - 1], 'E').endAt;
  return db.prepare(
    'SELECT * FROM shifts WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
  ).all(rangeStart, rangeEnd);
}

// Sets (or clears, if type is null/'X') the shift for one user on one date.
function upsertShiftForUserOnDate(userId, dateStr, type) {
  const existing = db.prepare(`
    SELECT s.id FROM shifts s
    WHERE s.user_id = ? AND date(s.start_at, '+4 hours') = ?
  `).get(userId, dateStr);

  if (!type || type === 'X') {
    if (existing) db.prepare('DELETE FROM shifts WHERE id = ?').run(existing.id);
    return;
  }

  const window = computeShiftWindow(dateStr, type);
  if (!window) throw new Error(`Invalid shift type: ${type}`);

  if (existing) {
    db.prepare(
      "UPDATE shifts SET type = ?, start_at = ?, end_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(type, window.startAt, window.endAt, existing.id);
  } else {
    db.prepare(
      'INSERT INTO shifts (user_id, start_at, end_at, type) VALUES (?, ?, ?, ?)'
    ).run(userId, window.startAt, window.endAt, type);
  }
}

function getCurrentShiftForUser(userId, nowIso) {
  return db.prepare(
    'SELECT * FROM shifts WHERE user_id = ? AND start_at <= ? AND end_at > ? ORDER BY start_at DESC LIMIT 1'
  ).get(userId, nowIso, nowIso);
}

function getNextShiftForUser(userId, nowIso) {
  return db.prepare(
    'SELECT * FROM shifts WHERE user_id = ? AND start_at > ? ORDER BY start_at ASC LIMIT 1'
  ).get(userId, nowIso);
}

function getShiftById(id) {
  return db.prepare('SELECT * FROM shifts WHERE id = ?').get(id);
}

// Shifts a user could reasonably offer for swap: not yet started, still open.
function getUpcomingShiftsForUser(userId, nowIso, limit = 30) {
  return db.prepare(
    "SELECT * FROM shifts WHERE user_id = ? AND start_at > ? AND status = 'open' ORDER BY start_at ASC LIMIT ?"
  ).all(userId, nowIso, limit);
}

function reassignShift(shiftId, newUserId) {
  db.prepare(
    "UPDATE shifts SET user_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(newUserId, shiftId);
}

function setShiftStatus(shiftId, status) {
  db.prepare(
    "UPDATE shifts SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, shiftId);
}

// The shift (any operator) that started immediately before this one —
// who's handing off to whoever's on this shift.
function getPreviousShift(shift) {
  return db.prepare(
    'SELECT * FROM shifts WHERE start_at < ? AND id != ? ORDER BY start_at DESC LIMIT 1'
  ).get(shift.start_at, shift.id);
}

// The shift (any operator) that starts immediately after this one — who this
// shift would be handing off to.
function getNextShiftAfter(shift) {
  return db.prepare(
    'SELECT * FROM shifts WHERE start_at > ? AND id != ? ORDER BY start_at ASC LIMIT 1'
  ).get(shift.start_at, shift.id);
}

module.exports = {
  getGridForDates,
  getShiftRowsForDates,
  upsertShiftForUserOnDate,
  getCurrentShiftForUser,
  getNextShiftForUser,
  getShiftById,
  getUpcomingShiftsForUser,
  reassignShift,
  setShiftStatus,
  getPreviousShift,
  getNextShiftAfter
};
