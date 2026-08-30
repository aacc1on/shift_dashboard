'use strict';

const db = require('../db');
const { computeShiftWindow, gridDateOf } = require('../lib/shift-times');

// Returns { [dateStr]: { [userId]: 'D'|'E'|'N' } } for the given list of
// Yerevan calendar dates. Only rows whose window overlaps the requested
// dates are fetched, then bucketed by the date the shift is assigned to
// (its grid label, which for N is one day before its real start — see
// lib/shift-times.js). The range is deliberately generous (D's start is
// the earliest a labeled date's shift can begin, N's end the latest) and
// then filtered exactly by dateSet below.
function getGridForDates(dates) {
  if (!dates.length) return {};
  const sorted = [...dates].sort();
  const rangeStart = computeShiftWindow(sorted[0], 'D').startAt;
  const rangeEnd = computeShiftWindow(sorted[sorted.length - 1], 'N').endAt;

  const rows = db.prepare(
    'SELECT id, user_id, start_at, end_at, type, status FROM shifts WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
  ).all(rangeStart, rangeEnd);

  const dateSet = new Set(dates);
  const grid = {};
  dates.forEach((d) => { grid[d] = {}; });

  rows.forEach((row) => {
    const dateStr = gridDateOf(row.start_at, row.type);
    if (!dateSet.has(dateStr)) return;
    grid[dateStr][row.user_id] = row.type;
  });

  return grid;
}

function getShiftRowsForDates(dates) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const rangeStart = computeShiftWindow(sorted[0], 'D').startAt;
  const rangeEnd = computeShiftWindow(sorted[sorted.length - 1], 'N').endAt;
  return db.prepare(
    'SELECT * FROM shifts WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
  ).all(rangeStart, rangeEnd);
}

// Sets (or clears, if type is null/'X') the shift for one user on one date.
function upsertShiftForUserOnDate(userId, dateStr, type) {
  // N rows are stored one real day later than their grid label, so the
  // lookup has to unwind that offset per-row (can't do it in the WHERE
  // clause without knowing each row's type first) — fetch a generous
  // 2-day candidate window and filter exactly by grid date in JS.
  const rangeStart = computeShiftWindow(dateStr, 'D').startAt;
  const rangeEnd = new Date(new Date(rangeStart).getTime() + 2 * 86400000).toISOString();
  const candidates = db.prepare(
    'SELECT id, start_at, type FROM shifts WHERE user_id = ? AND start_at >= ? AND start_at < ?'
  ).all(userId, rangeStart, rangeEnd);
  const existing = candidates.find((row) => gridDateOf(row.start_at, row.type) === dateStr);

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
