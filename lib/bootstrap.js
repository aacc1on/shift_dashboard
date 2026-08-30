'use strict';

const db = require('../db');
const usersModel = require('../models/users');
const { hashPassword } = require('./password');

// Runs once, only if the users table is completely empty (a fresh install).
// Creates exactly one lead account and nothing else — no demo operators, no
// sample schedule. SOC_USER/SOC_PASS override the default admin/soc2026 for
// a scripted first deploy; either way, change the password via the profile
// menu immediately after logging in.
function ensureDefaultAdmin() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) return null;

  const username = (process.env.SOC_USER || 'admin').trim().toLowerCase();
  const password = process.env.SOC_PASS || 'soc2026';

  usersModel.createUser({
    username,
    passwordHash: hashPassword(password),
    displayName: username,
    role: 'lead',
    active: 1
  });

  return { username, password };
}

module.exports = { ensureDefaultAdmin };
