'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const USERS_PATH = path.join(__dirname, '..', 'users.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

let users = [];
let usersLoaded = false;

function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(inputPassword, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;

  const salt = parts[1];
  const expectedHex = parts[2];
  const actual = crypto.scryptSync(String(inputPassword), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function signSession(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function createSessionCookie(username) {
  const ts = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${username}.${ts}.${nonce}`;
  const sig = signSession(payload);
  return `${payload}.${sig}`;
}

function parseAndVerifySession(rawCookie) {
  if (!rawCookie || typeof rawCookie !== 'string') return null;
  const parts = rawCookie.split('.');
  if (parts.length !== 4) return null;

  const [username, tsRaw, nonce, signature] = parts;
  if (!username || !tsRaw || !nonce || !signature) return null;

  const payload = `${username}.${tsRaw}.${nonce}`;
  const expectedSig = signSession(payload);

  const sigA = Buffer.from(signature, 'hex');
  const sigB = Buffer.from(expectedSig, 'hex');
  if (!sigA.length || sigA.length !== sigB.length) return null;
  if (!crypto.timingSafeEqual(sigA, sigB)) return null;

  const ts = Number(tsRaw);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > SESSION_TTL_MS) return null;

  return { username };
}

async function ensureUsersLoaded() {
  if (usersLoaded) return;

  try {
    const raw = await fs.readFile(USERS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    users = Array.isArray(parsed) ? parsed : [];
  } catch {
    users = [{ username: process.env.SOC_USER || 'admin', password: process.env.SOC_PASS || 'soc2026' }];
  }

  let changed = false;
  users = users
    .filter((u) => u && typeof u.username === 'string' && typeof u.password === 'string')
    .map((u) => {
      const username = u.username.trim();
      if (!username) return null;
      if (!u.password.startsWith('scrypt:')) {
        changed = true;
        return { username, password: hashPassword(u.password) };
      }
      return { username, password: u.password };
    })
    .filter(Boolean);

  if (!users.length) {
    users = [{ username: 'admin', password: hashPassword('soc2026') }];
    changed = true;
  }

  if (changed) {
    await fs.writeFile(USERS_PATH, JSON.stringify(users, null, 2));
  }

  usersLoaded = true;
}

function requireAuth(req, res, next) {
  const parsed = parseAndVerifySession(req.cookies && req.cookies.soc_session);
  if (parsed) {
    req.authUser = parsed.username;
    return next();
  }
  const redirect = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?redirect=${redirect}`);
}

async function handleLogin(req, res) {
  await ensureUsersLoaded();
  const { username, password, redirect } = req.body;
  const user = users.find((u) => u.username === String(username || '').trim());

  if (user && verifyPassword(password, user.password)) {
    const token = createSessionCookie(user.username);
    res.cookie('soc_session', token, {
      httpOnly: true,
      maxAge: SESSION_TTL_MS,
      sameSite: 'lax'
    });
    return res.redirect(redirect || '/admin');
  }

  res.redirect(`/login?error=1&redirect=${encodeURIComponent(redirect || '/admin')}`);
}

function handleLogout(req, res) {
  res.clearCookie('soc_session');
  res.redirect('/login');
}

function isAuthenticated(req) {
  return !!parseAndVerifySession(req.cookies && req.cookies.soc_session);
}

module.exports = { requireAuth, handleLogin, handleLogout, isAuthenticated, ensureUsersLoaded };
