'use strict';

const db = require('../db');

function listUsers({ activeOnly = false, role = null } = {}) {
  const clauses = [];
  const params = [];
  if (activeOnly) clauses.push('active = 1');
  if (role) { clauses.push('role = ?'); params.push(role); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM users ${where} ORDER BY display_name`).all(...params);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser({ username, passwordHash, displayName, role = 'member', active = 1 }) {
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, display_name, role, active) VALUES (?, ?, ?, ?, ?)'
  ).run(String(username).trim().toLowerCase(), passwordHash, String(displayName).trim(), role, active ? 1 : 0);
  return getUserById(info.lastInsertRowid);
}

function updateUser(id, fields) {
  const allowed = ['display_name', 'role', 'active', 'password_hash', 'avatar_emoji', 'bio'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return getUserById(id);
  values.push(id);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getUserById(id);
}

// What deleting this user would cascade-delete (shifts, swaps, reports,
// documents, chat) — used to refuse a hard delete once there's real history
// to lose, steering toward deactivate instead. Zero across the board (a
// never-used account) is the only case a hard delete is offered for.
function getOwnedDataCounts(id) {
  return {
    shifts: db.prepare('SELECT COUNT(*) n FROM shifts WHERE user_id = ?').get(id).n,
    swaps: db.prepare('SELECT COUNT(*) n FROM swaps WHERE requester_id = ? OR target_id = ?').get(id, id).n,
    reports: db.prepare('SELECT COUNT(*) n FROM reports WHERE author_id = ?').get(id).n,
    documents: db.prepare('SELECT COUNT(*) n FROM documents WHERE author_id = ?').get(id).n,
    messages: db.prepare('SELECT COUNT(*) n FROM messages WHERE author_id = ? OR recipient_id = ?').get(id, id).n
  };
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function usernameExists(username) {
  return !!getUserByUsername(username);
}

// Derives a unique lowercase username from a display name (e.g. "Areg" -> "areg",
// falling back to "areg2", "areg3", ... on collision).
function suggestUsername(displayName) {
  const base = String(displayName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
  let candidate = base;
  let n = 2;
  while (usernameExists(candidate)) {
    candidate = `${base}${n}`;
    n++;
  }
  return candidate;
}

module.exports = {
  listUsers,
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getOwnedDataCounts,
  usernameExists,
  suggestUsername
};
