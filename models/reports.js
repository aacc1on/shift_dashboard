'use strict';

const db = require('../db');
const shiftsModel = require('./shifts');

const REPORT_SELECT = `
  SELECT
    r.id, r.shift_id, r.what_done, r.unfinished, r.open_items, r.created_at,
    r.author_id, u.display_name AS author_name,
    s.start_at, s.end_at, s.type AS shift_type, s.user_id AS shift_user_id
  FROM reports r
  JOIN users u ON u.id = r.author_id
  JOIN shifts s ON s.id = r.shift_id
`;

function parseRow(row) {
  if (!row) return row;
  return { ...row, open_items: JSON.parse(row.open_items || '[]') };
}

function getReportForShift(shiftId) {
  return parseRow(db.prepare(`${REPORT_SELECT} WHERE r.shift_id = ?`).get(shiftId));
}

function getReportById(id) {
  return parseRow(db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id));
}

// The gate: this is the only place a shift's status is ever set to 'closed',
// and it can only happen by filing the report. One report per shift.
function createReport({ shiftId, authorId, whatDone, unfinished, openItems }) {
  const existing = db.prepare('SELECT id FROM reports WHERE shift_id = ?').get(shiftId);
  if (existing) throw new Error('A report has already been filed for this shift.');

  db.prepare(
    'INSERT INTO reports (shift_id, author_id, what_done, unfinished, open_items) VALUES (?, ?, ?, ?, ?)'
  ).run(shiftId, authorId, whatDone || '', unfinished || '', JSON.stringify(openItems || []));

  shiftsModel.setShiftStatus(shiftId, 'closed');
  return getReportForShift(shiftId);
}

function listReports({ authorId = null, q = null, from = null, to = null, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (authorId) { clauses.push('r.author_id = ?'); params.push(authorId); }
  if (from) { clauses.push('s.start_at >= ?'); params.push(from); }
  if (to) { clauses.push('s.start_at <= ?'); params.push(to); }
  if (q) {
    clauses.push('(r.what_done LIKE ? OR r.unfinished LIKE ? OR r.open_items LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  return db.prepare(`${REPORT_SELECT} ${where} ORDER BY s.start_at DESC LIMIT ?`).all(...params).map(parseRow);
}

// Is this shift within the reminder window (or already past end) and still
// missing its mandatory report?
function isReportDue(shift, nowIso, windowMinutes) {
  if (shift.status !== 'open') return false;
  const endMs = new Date(shift.end_at).getTime();
  const nowMs = new Date(nowIso).getTime();
  return endMs - nowMs <= windowMinutes * 60000;
}

module.exports = {
  getReportForShift,
  getReportById,
  createReport,
  listReports,
  isReportDue
};
