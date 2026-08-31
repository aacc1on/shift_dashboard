'use strict';

const express = require('express');
const router = express.Router();
const announcementsModel = require('../models/announcements');
const { requireAuth, requireLead } = require('../middleware/auth');

router.get('/latest', requireAuth, async (req, res) => {
  res.json(await announcementsModel.getLatest());
});

router.post('/', requireLead, async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Announcement cannot be empty.' });
  if (content.length > 300) return res.status(400).json({ error: 'Keep it under 300 characters — this is a banner, not a document.' });
  res.json(await announcementsModel.createAnnouncement({ authorId: req.authUserId, content }));
});

module.exports = router;
