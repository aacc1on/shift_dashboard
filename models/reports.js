'use strict';

const { get, all, run } = require('../db');
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

async function getReportForShift(shiftId) {
  return parseRow(await get(`${REPORT_SELECT} WHERE r.shift_id = ?`, shiftId));
}

async function getReportById(id) {
  return parseRow(await get(`${REPORT_SELECT} WHERE r.id = ?`, id));
}

// The gate: this is the only place a shift's status is ever set to 'closed',
// and it can only happen by filing the report. One report per shift.
async function createReport({ shiftId, authorId, whatDone, unfinished, openItems }) {
  const existing = await get('SELECT id FROM reports WHERE shift_id = ?', shiftId);
  if (existing) throw new Error('A report has already been filed for this shift.');

  await run(
    'INSERT INTO reports (shift_id, author_id, what_done, unfinished, open_items) VALUES (?, ?, ?, ?, ?)',
    shiftId, authorId, whatDone || '', unfinished || '', JSON.stringify(openItems || [])
  );

  await shiftsModel.setShiftStatus(shiftId, 'closed');
  return getReportForShift(shiftId);
}

async function listReports({ authorId = null, q = null, from = null, to = null, limit = 100 } = {}) {
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
  const rows = await all(`${REPORT_SELECT} ${where} ORDER BY s.start_at DESC LIMIT ?`, ...params);
  return rows.map(parseRow);
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
