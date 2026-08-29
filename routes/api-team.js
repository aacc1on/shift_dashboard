'use strict';

const express = require('express');
const router = express.Router();
const usersModel = require('../models/users');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

function publicProfile(u) {
  return {
    id: u.id,
    display_name: u.display_name,
    role: u.role,
    avatar_emoji: u.avatar_emoji,
    bio: u.bio
  };
}

// Team directory — every active account, public-safe fields only (no
// username/password/created_at). Anyone logged in can browse it; this is
// distinct from /api/users, which is lead-only and exposes account-management
// fields for password resets and deactivation.
router.get('/', (req, res) => {
  res.json(usersModel.listUsers({ activeOnly: true }).map(publicProfile));
});

router.get('/:id', (req, res) => {
  const user = usersModel.getUserById(Number(req.params.id));
  if (!user || !user.active) return res.status(404).json({ error: 'User not found.' });
  res.json(publicProfile(user));
});

module.exports = router;
