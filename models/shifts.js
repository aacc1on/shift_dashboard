'use strict';

const { get, all, run } = require('../db');
const { computeShiftWindow, gridDateOf } = require('../lib/shift-times');

// Returns { [dateStr]: { [userId]: 'D'|'E'|'N' } } for the given list of
// Yerevan calendar dates. Only rows whose window overlaps the requested
// dates are fetched, then bucketed by the date the shift is assigned to
// (its grid label, which for N is one day before its real start — see
// lib/shift-times.js). The range is deliberately generous (D's start is
// the earliest a labeled date's shift can begin, N's end the latest) and
// then filtered exactly by dateSet below.
async function getGridForDates(dates) {
  if (!dates.length) return {};
  const sorted = [...dates].sort();
  const rangeStart = computeShiftWindow(sorted[0], 'D').startAt;
  const rangeEnd = computeShiftWindow(sorted[sorted.length - 1], 'N').endAt;

  const rows = await all(
    'SELECT id, user_id, start_at, end_at, type, status FROM shifts WHERE start_at >= ? AND start_at <= ? ORDER BY start_at',
    rangeStart, rangeEnd
  );

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

async function getShiftRowsForDates(dates) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const rangeStart = computeShiftWindow(sorted[0], 'D').startAt;
  const rangeEnd = computeShiftWindow(sorted[sorted.length - 1], 'N').endAt;
  return all('SELECT * FROM shifts WHERE start_at >= ? AND start_at <= ? ORDER BY start_at', rangeStart, rangeEnd);
}

// Sets (or clears, if type is null/'X') the shift for one user on one date.
async function upsertShiftForUserOnDate(userId, dateStr, type) {
  // N rows are stored one real day later than their grid label, so the
  // lookup has to unwind that offset per-row (can't do it in the WHERE
  // clause without knowing each row's type first) — fetch a generous
  // 2-day candidate window and filter exactly by grid date in JS.
  const rangeStart = computeShiftWindow(dateStr, 'D').startAt;
  const rangeEnd = new Date(new Date(rangeStart).getTime() + 2 * 86400000).toISOString();
  const candidates = await all(
    'SELECT id, start_at, type FROM shifts WHERE user_id = ? AND start_at >= ? AND start_at < ?',
    userId, rangeStart, rangeEnd
  );
  const existing = candidates.find((row) => gridDateOf(row.start_at, row.type) === dateStr);

  if (!type || type === 'X') {
    if (existing) await run('DELETE FROM shifts WHERE id = ?', existing.id);
    return;
  }

  const window = computeShiftWindow(dateStr, type);
  if (!window) throw new Error(`Invalid shift type: ${type}`);

  if (existing) {
    await run(
      "UPDATE shifts SET type = ?, start_at = ?, end_at = ?, updated_at = datetime('now') WHERE id = ?",
      type, window.startAt, window.endAt, existing.id
    );
  } else {
    await run(
      'INSERT INTO shifts (user_id, start_at, end_at, type) VALUES (?, ?, ?, ?)',
      userId, window.startAt, window.endAt, type
    );
  }
}

async function getCurrentShiftForUser(userId, nowIso) {
  return get(
    'SELECT * FROM shifts WHERE user_id = ? AND start_at <= ? AND end_at > ? ORDER BY start_at DESC LIMIT 1',
    userId, nowIso, nowIso
  );
}

async function getNextShiftForUser(userId, nowIso) {
  return get('SELECT * FROM shifts WHERE user_id = ? AND start_at > ? ORDER BY start_at ASC LIMIT 1', userId, nowIso);
}

async function getShiftById(id) {
  return get('SELECT * FROM shifts WHERE id = ?', id);
}

// Shifts a user could reasonably offer for swap: not yet started, still open.
async function getUpcomingShiftsForUser(userId, nowIso, limit = 30) {
  return all(
    "SELECT * FROM shifts WHERE user_id = ? AND start_at > ? AND status = 'open' ORDER BY start_at ASC LIMIT ?",
    userId, nowIso, limit
  );
}

async function reassignShift(shiftId, newUserId) {
  await run("UPDATE shifts SET user_id = ?, updated_at = datetime('now') WHERE id = ?", newUserId, shiftId);
}

async function setShiftStatus(shiftId, status) {
  await run("UPDATE shifts SET status = ?, updated_at = datetime('now') WHERE id = ?", status, shiftId);
}

// The shift (any operator) that started immediately before this one —
// who's handing off to whoever's on this shift.
async function getPreviousShift(shift) {
  return get('SELECT * FROM shifts WHERE start_at < ? AND id != ? ORDER BY start_at DESC LIMIT 1', shift.start_at, shift.id);
}

// The shift (any operator) that starts immediately after this one — who this
// shift would be handing off to.
async function getNextShiftAfter(shift) {
  return get('SELECT * FROM shifts WHERE start_at > ? AND id != ? ORDER BY start_at ASC LIMIT 1', shift.start_at, shift.id);
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
