'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const { hashPassword, generateTempPassword } = require('./password');

const USERS_JSON_PATH = path.join(__dirname, '..', 'users.json');
const DATA_JSON_PATH = path.join(__dirname, '..', 'data.json');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Runs once, only if the users table is empty. Imports legacy users.json
// accounts as leads (their existing scrypt hashes carry over unchanged),
// then creates a member account with a generated temp password for every
// schedule "operator" name in data.json that has no matching account, and
// finally expands data.json's date x person grid into shift rows.
// Returns the list of generated { username, displayName, tempPassword }
// for accounts created this run, or [] if migration didn't run (already done,
// or no legacy files present).
function migrateFromJsonIfNeeded() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return [];

  const generated = [];
  const legacyUsers = readJsonSafe(USERS_JSON_PATH);
  const legacyData = readJsonSafe(DATA_JSON_PATH);

  if (Array.isArray(legacyUsers)) {
    legacyUsers.forEach((u) => {
      if (!u || typeof u.username !== 'string' || typeof u.password !== 'string') return;
      const username = u.username.trim().toLowerCase();
      if (!username || usersModel.usernameExists(username)) return;
      const passwordHash = u.password.startsWith('scrypt:') ? u.password : hashPassword(u.password);
      usersModel.createUser({
        username,
        passwordHash,
        displayName: u.username.trim(),
        role: 'lead',
        active: 1
      });
    });
  }

  if (legacyData && Array.isArray(legacyData.people)) {
    const byDisplayName = new Map(
      usersModel.listUsers().map((u) => [u.display_name.toLowerCase(), u])
    );

    legacyData.people.forEach((name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return;
      if (byDisplayName.has(trimmed.toLowerCase())) return;

      const username = usersModel.suggestUsername(trimmed);
      const tempPassword = generateTempPassword();
      const user = usersModel.createUser({
        username,
        passwordHash: hashPassword(tempPassword),
        displayName: trimmed,
        role: 'member',
        active: 1
      });
      byDisplayName.set(trimmed.toLowerCase(), user);
      generated.push({ username, displayName: trimmed, tempPassword });
    });

    if (legacyData.schedule && typeof legacyData.schedule === 'object') {
      for (const [dateStr, row] of Object.entries(legacyData.schedule)) {
        if (!row || typeof row !== 'object') continue;
        for (const [name, code] of Object.entries(row)) {
          if (code === 'X' || !code) continue;
          const user = byDisplayName.get(String(name).trim().toLowerCase());
          if (!user) continue;
          shiftsModel.upsertShiftForUserOnDate(user.id, dateStr, code);
        }
      }
    }
  }

  return generated;
}

module.exports = { migrateFromJsonIfNeeded };
