'use strict';

const { get, all, run } = require('../db');

async function listUsers({ activeOnly = false, role = null } = {}) {
  const clauses = [];
  const params = [];
  if (activeOnly) clauses.push('active = 1');
  if (role) { clauses.push('role = ?'); params.push(role); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(`SELECT * FROM users ${where} ORDER BY display_name`, ...params);
}

async function getUserByUsername(username) {
  return get('SELECT * FROM users WHERE username = ?', String(username || '').trim().toLowerCase());
}

async function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', id);
}

async function createUser({ username, passwordHash, displayName, role = 'member', active = 1 }) {
  const info = await run(
    'INSERT INTO users (username, password_hash, display_name, role, active) VALUES (?, ?, ?, ?, ?)',
    String(username).trim().toLowerCase(), passwordHash, String(displayName).trim(), role, active ? 1 : 0
  );
  return getUserById(info.lastInsertRowid);
}

async function updateUser(id, fields) {
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
  await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...values);
  return getUserById(id);
}

// What deleting this user would cascade-delete (shifts, swaps, reports,
// documents, chat) — used to refuse a hard delete once there's real history
// to lose, steering toward deactivate instead. Zero across the board (a
// never-used account) is the only case a hard delete is offered for.
async function getOwnedDataCounts(id) {
  const [shifts, swaps, reports, documents, messages] = await Promise.all([
    get('SELECT COUNT(*) n FROM shifts WHERE user_id = ?', id),
    get('SELECT COUNT(*) n FROM swaps WHERE requester_id = ? OR target_id = ?', id, id),
    get('SELECT COUNT(*) n FROM reports WHERE author_id = ?', id),
    get('SELECT COUNT(*) n FROM documents WHERE author_id = ?', id),
    get('SELECT COUNT(*) n FROM messages WHERE author_id = ? OR recipient_id = ?', id, id)
  ]);
  return {
    shifts: shifts.n,
    swaps: swaps.n,
    reports: reports.n,
    documents: documents.n,
    messages: messages.n
  };
}

async function deleteUser(id) {
  await run('DELETE FROM users WHERE id = ?', id);
}

async function usernameExists(username) {
  return !!(await getUserByUsername(username));
}

// Derives a unique lowercase username from a display name (e.g. "Areg" -> "areg",
// falling back to "areg2", "areg3", ... on collision).
async function suggestUsername(displayName) {
  const base = String(displayName).trim().toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
  let candidate = base;
  let n = 2;
  while (await usernameExists(candidate)) {
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
