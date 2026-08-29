'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const usersModel = require('../models/users');
const { hashPassword, generateTempPassword } = require('../lib/password');
const { requireLead } = require('../middleware/auth');

const AUDIT_LOG_PATH = path.join(__dirname, '..', 'audit.log');

// User management (including password resets) is lead-only, full stop —
// every route in this file requires the lead role, not just a valid login.
router.use(requireLead);

function publicUser(u) {
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, active: u.active, created_at: u.created_at };
}

router.get('/', (req, res) => {
  res.json(usersModel.listUsers().map(publicUser));
});

router.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const user = usersModel.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const tempPassword = generateTempPassword();
  usersModel.updateUser(id, { password_hash: hashPassword(tempPassword) });

  await fs.appendFile(
    AUDIT_LOG_PATH,
    `[${new Date().toISOString()}] ${req.authUser} reset the password for ${user.username}\n`
  );

  res.json({ username: user.username, tempPassword });
});

router.post('/:id/deactivate', async (req, res) => {
  const id = Number(req.params.id);
  const user = usersModel.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (!user.active) return res.json(publicUser(user));

  if (user.role === 'lead') {
    const activeLeads = usersModel.listUsers({ activeOnly: true, role: 'lead' });
    if (activeLeads.length <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate the only remaining lead account.' });
    }
  }

  const updated = usersModel.updateUser(id, { active: 0 });
  await fs.appendFile(AUDIT_LOG_PATH, `[${new Date().toISOString()}] ${req.authUser} deactivated ${user.username}\n`);
  res.json(publicUser(updated));
});

router.post('/:id/activate', async (req, res) => {
  const id = Number(req.params.id);
  const user = usersModel.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const updated = usersModel.updateUser(id, { active: 1 });
  await fs.appendFile(AUDIT_LOG_PATH, `[${new Date().toISOString()}] ${req.authUser} reactivated ${user.username}\n`);
  res.json(publicUser(updated));
});

// Permanent removal — only offered when the account has zero history to
// lose (no shifts/swaps/reports/documents/messages). Anything with real
// history should be deactivated instead, to keep the audit trail intact.
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const user = usersModel.getUserById(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.role === 'lead') {
    const activeLeads = usersModel.listUsers({ activeOnly: true, role: 'lead' });
    if (user.active && activeLeads.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only remaining lead account.' });
    }
  }

  const counts = usersModel.getOwnedDataCounts(id);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > 0) {
    return res.status(400).json({
      error: `${user.display_name} has history attached (${Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ')}) — deactivate instead of deleting, to keep that record intact.`
    });
  }

  usersModel.deleteUser(id);
  await fs.appendFile(AUDIT_LOG_PATH, `[${new Date().toISOString()}] ${req.authUser} permanently deleted ${user.username} (no history attached)\n`);
  res.json({ ok: true });
});

module.exports = router;
