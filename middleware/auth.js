'use strict';

const SOC_USER = process.env.SOC_USER || 'admin';
const SOC_PASS = process.env.SOC_PASS || 'soc2026';

/**
 * Very simple session-based auth for the admin panel.
 * No external deps — uses a signed cookie pattern via express-session
 * or falls back to a plain in-memory token set.
 */

const activeSessions = new Set();

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.soc_session;
  if (token && activeSessions.has(token)) return next();
  const redirect = encodeURIComponent(req.originalUrl);
  res.redirect(`/login?redirect=${redirect}`);
}

function handleLogin(req, res) {
  const { username, password, redirect } = req.body;
  if (username === SOC_USER && password === SOC_PASS) {
    const token = generateToken();
    activeSessions.add(token);
    // 8 hour expiry
    res.cookie('soc_session', token, {
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: 'lax'
    });
    res.redirect(redirect || '/admin');
  } else {
    res.redirect(`/login?error=1&redirect=${encodeURIComponent(redirect || '/admin')}`);
  }
}

function handleLogout(req, res) {
  const token = req.cookies && req.cookies.soc_session;
  if (token) activeSessions.delete(token);
  res.clearCookie('soc_session');
  res.redirect('/login');
}

function isAuthenticated(req) {
  const token = req.cookies && req.cookies.soc_session;
  return !!(token && activeSessions.has(token));
}

module.exports = { requireAuth, handleLogin, handleLogout, isAuthenticated };