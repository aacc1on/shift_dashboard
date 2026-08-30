'use strict';

const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const { requireAuth } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../lib/password');

router.use(requireAuth);

function publicSelf(u) {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    avatar_emoji: u.avatar_emoji,
    bio: u.bio,
    created_at: u.created_at
  };
}

router.get('/', (req, res) => {
  const user = usersModel.getUserById(req.authUserId);
  res.json(publicSelf(user));
});

// Self-service: anyone can set their own avatar/bio/display name — not role,
// username, or active status, those stay lead-controlled (User Management).
router.put('/', (req, res) => {
  const { avatarEmoji, bio, displayName } = req.body || {};
  const fields = {};

  if (avatarEmoji !== undefined) {
    const trimmed = String(avatarEmoji || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'Pick an emoji for your avatar.' });
    if ([...trimmed].length > 4) return res.status(400).json({ error: 'That doesn\'t look like a single emoji.' });
    fields.avatar_emoji = trimmed;
  }
  if (bio !== undefined) {
    fields.bio = String(bio).slice(0, 200);
  }
  if (displayName !== undefined) {
    const trimmed = String(displayName).trim();
    if (!trimmed) return res.status(400).json({ error: 'Display name cannot be empty.' });
    fields.display_name = trimmed;
  }

  const updated = usersModel.updateUser(req.authUserId, fields);
  res.json(publicSelf(updated));
});

// Type-your-own-password self-service — distinct from the admin-side
// "reset to a random temp password" flow. Requires the current password so
// a hijacked-but-not-fully-compromised session can't silently lock the
// real owner out.
router.put('/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = usersModel.getUserById(req.authUserId);

  if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  usersModel.updateUser(req.authUserId, { password_hash: hashPassword(String(newPassword)) });
  res.json({ ok: true });
});

module.exports = router;
