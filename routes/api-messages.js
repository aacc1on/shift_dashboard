'use strict';

const express = require('express');
const router = express.Router();
const messagesModel = require('../models/messages');
const usersModel = require('../models/users');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// ---- Team channel ----

router.get('/', async (req, res) => {
  const since = req.query.since ? Number(req.query.since) : null;
  res.json(since ? await messagesModel.listTeamSince(since) : await messagesModel.listTeamMessages());
});

router.post('/', async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (content.length > 2000) return res.status(400).json({ error: 'Message is too long (2000 char max).' });
  res.json(await messagesModel.createTeamMessage({ authorId: req.authUserId, content }));
});

// ---- Direct messages ----

router.get('/conversations', async (req, res) => {
  res.json(await messagesModel.listConversationsFor(req.authUserId));
});

async function validRecipient(req, res, next) {
  const recipientId = Number(req.params.userId);
  if (recipientId === req.authUserId) return res.status(400).json({ error: "You can't message yourself." });
  const recipient = await usersModel.getUserById(recipientId);
  if (!recipient || !recipient.active) return res.status(404).json({ error: 'User not found.' });
  req.recipient = recipient;
  next();
}

router.get('/dm/:userId', validRecipient, async (req, res) => {
  const since = req.query.since ? Number(req.query.since) : null;
  const messages = since
    ? await messagesModel.listConversationSince(req.authUserId, req.recipient.id, since)
    : await messagesModel.listConversation(req.authUserId, req.recipient.id);
  res.json({ recipient: { id: req.recipient.id, display_name: req.recipient.display_name, avatar_emoji: req.recipient.avatar_emoji }, messages });
});

router.post('/dm/:userId', validRecipient, async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Message cannot be empty.' });
  if (content.length > 2000) return res.status(400).json({ error: 'Message is too long (2000 char max).' });
  res.json(await messagesModel.createDirectMessage({ authorId: req.authUserId, recipientId: req.recipient.id, content }));
});

module.exports = router;
