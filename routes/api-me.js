'use strict';

const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const { requireAuth } = require('../middleware/auth');

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

module.exports = router;
