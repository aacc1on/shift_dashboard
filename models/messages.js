'use strict';

const { get, all, run } = require('../db');

const MESSAGE_SELECT = `
  SELECT m.id, m.content, m.created_at, m.author_id, m.recipient_id,
         u.display_name AS author_name, u.avatar_emoji AS author_avatar
  FROM messages m
  JOIN users u ON u.id = m.author_id
`;

// ---- Team channel (recipient_id IS NULL, visible to everyone) ----

async function listTeamMessages(limit = 100) {
  const rows = await all(`${MESSAGE_SELECT} WHERE m.recipient_id IS NULL ORDER BY m.id DESC LIMIT ?`, limit);
  return rows.reverse();
}

async function listTeamSince(sinceId) {
  return all(`${MESSAGE_SELECT} WHERE m.recipient_id IS NULL AND m.id > ? ORDER BY m.id ASC`, sinceId);
}

async function createTeamMessage({ authorId, content }) {
  const info = await run('INSERT INTO messages (author_id, recipient_id, content) VALUES (?, NULL, ?)', authorId, content);
  return get(`${MESSAGE_SELECT} WHERE m.id = ?`, info.lastInsertRowid);
}

// ---- Direct messages (private, only the two participants) ----

async function listConversation(userA, userB, limit = 100) {
  const rows = await all(`
    ${MESSAGE_SELECT}
    WHERE (m.author_id = ? AND m.recipient_id = ?) OR (m.author_id = ? AND m.recipient_id = ?)
    ORDER BY m.id DESC LIMIT ?
  `, userA, userB, userB, userA, limit);
  return rows.reverse();
}

async function listConversationSince(userA, userB, sinceId) {
  return all(`
    ${MESSAGE_SELECT}
    WHERE ((m.author_id = ? AND m.recipient_id = ?) OR (m.author_id = ? AND m.recipient_id = ?)) AND m.id > ?
    ORDER BY m.id ASC
  `, userA, userB, userB, userA, sinceId);
}

async function createDirectMessage({ authorId, recipientId, content }) {
  const info = await run('INSERT INTO messages (author_id, recipient_id, content) VALUES (?, ?, ?)', authorId, recipientId, content);
  return get(`${MESSAGE_SELECT} WHERE m.id = ?`, info.lastInsertRowid);
}

// Everyone `userId` has exchanged a DM with, most-recent-conversation-first,
// each with a preview of the last message — for the chat sidebar.
async function listConversationsFor(userId) {
  const rows = await all(`
    SELECT
      CASE WHEN m.author_id = ? THEN m.recipient_id ELSE m.author_id END AS other_id,
      m.content AS last_content,
      m.created_at AS last_at,
      m.author_id AS last_author_id,
      MAX(m.id) AS last_id
    FROM messages m
    WHERE m.recipient_id IS NOT NULL AND (m.author_id = ? OR m.recipient_id = ?)
    GROUP BY other_id
    ORDER BY last_id DESC
  `, userId, userId, userId);

  if (!rows.length) return [];
  const otherIds = rows.map((r) => r.other_id);
  const placeholders = otherIds.map(() => '?').join(',');
  const users = await all(`SELECT id, display_name, avatar_emoji, role FROM users WHERE id IN (${placeholders})`, ...otherIds);
  const userMap = new Map(users.map((u) => [u.id, u]));

  return rows
    .filter((r) => userMap.has(r.other_id))
    .map((r) => ({
      user: userMap.get(r.other_id),
      lastContent: r.last_content,
      lastAt: r.last_at,
      lastAuthorId: r.last_author_id
    }));
}

module.exports = {
  listTeamMessages,
  listTeamSince,
  createTeamMessage,
  listConversation,
  listConversationSince,
  createDirectMessage,
  listConversationsFor
};
