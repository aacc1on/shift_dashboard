'use strict';

// Armenia (Asia/Yerevan) has been a fixed UTC+4 offset with no DST since 2011,
// so shift windows can be computed with plain arithmetic instead of Intl calls.
const YEREVAN_OFFSET_HOURS = 4;

const SHIFT_META = {
  D: { start: '09:00', end: '17:00', label: 'Day Shift', color: '#00ff88', bg: '#002a18' },
  E: { start: '17:00', end: '01:00', label: 'Evening Shift', color: '#ffcc00', bg: '#2a2200' },
  N: { start: '01:00', end: '09:00', label: 'Night Shift', color: '#ff6b35', bg: '#2a1200' },
  X: { start: null, end: null, label: 'Day Off', color: '#4a9eff', bg: '#001a2a' }
};

// N is a special case: the grid label "July 2" for an N shift means the
// shift actually runs 01:00-09:00 on July 3 — picking up exactly where that
// day's E shift ends, and immediately before July 3's D shift starts. That's
// also why N->D and N->E are forbidden rotations (zero rest) and E->D is
// forbidden too (8h) — those gaps are real once N's date is offset correctly.
const SHIFT_WINDOWS = {
  D: { startH: 9, startM: 0, endH: 17, endM: 0, startDayOffset: 0, endDayOffset: 0 },
  E: { startH: 17, startM: 0, endH: 1, endM: 0, startDayOffset: 0, endDayOffset: 1 },
  N: { startH: 1, startM: 0, endH: 9, endM: 0, startDayOffset: 1, endDayOffset: 1 }
};

function localToUtcIso(dateStr, hh, mm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - YEREVAN_OFFSET_HOURS, mm, 0)).toISOString();
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// dateStr is the Yerevan calendar date the shift is assigned to (its grid
// label, not necessarily its real start date — see N above); returns
// { startAt, endAt } as UTC ISO instants.
function computeShiftWindow(dateStr, code) {
  const win = SHIFT_WINDOWS[code];
  if (!win) return null;
  const startDateStr = win.startDayOffset ? addDays(dateStr, win.startDayOffset) : dateStr;
  const endDateStr = win.endDayOffset ? addDays(dateStr, win.endDayOffset) : dateStr;
  const startAt = localToUtcIso(startDateStr, win.startH, win.startM);
  const endAt = localToUtcIso(endDateStr, win.endH, win.endM);
  return { startAt, endAt };
}

// Inverse: given a UTC ISO instant, the Yerevan calendar date it falls on.
function utcIsoToLocalDate(iso) {
  const utcMs = new Date(iso).getTime() + YEREVAN_OFFSET_HOURS * 3600000;
  return new Date(utcMs).toISOString().slice(0, 10);
}

// The grid label a shift row belongs to — the inverse of computeShiftWindow's
// date offsetting. For N, that's one day *before* its real start date.
function gridDateOf(startAtIso, type) {
  const startDate = utcIsoToLocalDate(startAtIso);
  return type === 'N' ? addDays(startDate, -1) : startDate;
}

function nowIso() {
  return new Date().toISOString();
}

// A bounded default window (1 week back through 4 weeks forward) shared by
// every route that needs "a reasonable slice of the schedule to work with" —
// the admin UI's own week-nav/Fill Week/Add Date controls extend past it.
function defaultAdminDateRange() {
  const yerevanNow = new Date(Date.now() + YEREVAN_OFFSET_HOURS * 3600000);
  const day = yerevanNow.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(
    yerevanNow.getUTCFullYear(), yerevanNow.getUTCMonth(), yerevanNow.getUTCDate() + mondayOffset - 7
  ));
  const dates = [];
  for (let i = 0; i < 42; i++) {
    dates.push(addDays(start.toISOString().slice(0, 10), i));
  }
  return dates;
}

module.exports = {
  SHIFT_META,
  computeShiftWindow,
  utcIsoToLocalDate,
  gridDateOf,
  addDays,
  nowIso,
  defaultAdminDateRange
};
