'use strict';

const crypto = require('crypto');
const usersModel = require('../models/users');
const { verifyPassword } = require('../lib/password');

const SESSION_SECRET = process.env.SESSION_SECRET || 'changeme';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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

// Loads the full user record for a verified session, rejecting sessions for
// accounts that were deactivated after the cookie was issued.
function loadSessionUser(req) {
  const parsed = parseAndVerifySession(req.cookies && req.cookies.soc_session);
  if (!parsed) return null;
  const user = usersModel.getUserByUsername(parsed.username);
  if (!user || !user.active) return null;
  return user;
}

function requireAuth(req, res, next) {
  const user = loadSessionUser(req);
  if (user) {
    req.authUser = user.username;
    req.authRole = user.role;
    req.authUserId = user.id;
    return next();
  }
  const redirect = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?redirect=${redirect}`);
}

function requireLead(req, res, next) {
  requireAuth(req, res, () => {
    if (req.authRole !== 'lead') {
      return res.status(403).json({ error: 'Lead role required.' });
    }
    next();
  });
}

function handleLogin(req, res) {
  const { username, password, redirect } = req.body;
  const user = usersModel.getUserByUsername(username);

  if (user && user.active && verifyPassword(password, user.password_hash)) {
    const token = createSessionCookie(user.username);
    res.cookie('soc_session', token, {
      httpOnly: true,
      maxAge: SESSION_TTL_MS,
      sameSite: 'lax'
    });
    // No explicit redirect (e.g. logging in from /login directly, not bounced
    // off a protected page): leads land on the management panel, everyone
    // else just gets the dashboard.
    const defaultLanding = user.role === 'lead' ? '/admin' : '/';
    return res.redirect(redirect || defaultLanding);
  }

  res.redirect(`/login?error=1&redirect=${encodeURIComponent(redirect || '')}`);
}

function handleLogout(req, res) {
  res.clearCookie('soc_session');
  res.redirect('/login');
}

function isAuthenticated(req) {
  return !!loadSessionUser(req);
}

module.exports = { requireAuth, requireLead, handleLogin, handleLogout, isAuthenticated };
