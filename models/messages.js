'use strict';

const db = require('../db');

const MESSAGE_SELECT = `
  SELECT m.id, m.content, m.created_at, m.author_id, m.recipient_id,
         u.display_name AS author_name, u.avatar_emoji AS author_avatar
  FROM messages m
  JOIN users u ON u.id = m.author_id
`;

// ---- Team channel (recipient_id IS NULL, visible to everyone) ----

function listTeamMessages(limit = 100) {
  const rows = db.prepare(`${MESSAGE_SELECT} WHERE m.recipient_id IS NULL ORDER BY m.id DESC LIMIT ?`).all(limit);
  return rows.reverse();
}

function listTeamSince(sinceId) {
  return db.prepare(`${MESSAGE_SELECT} WHERE m.recipient_id IS NULL AND m.id > ? ORDER BY m.id ASC`).all(sinceId);
}

function createTeamMessage({ authorId, content }) {
  const info = db.prepare('INSERT INTO messages (author_id, recipient_id, content) VALUES (?, NULL, ?)').run(authorId, content);
  return db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(info.lastInsertRowid);
}

// ---- Direct messages (private, only the two participants) ----

function listConversation(userA, userB, limit = 100) {
  const rows = db.prepare(`
    ${MESSAGE_SELECT}
    WHERE (m.author_id = ? AND m.recipient_id = ?) OR (m.author_id = ? AND m.recipient_id = ?)
    ORDER BY m.id DESC LIMIT ?
  `).all(userA, userB, userB, userA, limit);
  return rows.reverse();
}

function listConversationSince(userA, userB, sinceId) {
  return db.prepare(`
    ${MESSAGE_SELECT}
    WHERE ((m.author_id = ? AND m.recipient_id = ?) OR (m.author_id = ? AND m.recipient_id = ?)) AND m.id > ?
    ORDER BY m.id ASC
  `).all(userA, userB, userB, userA, sinceId);
}

function createDirectMessage({ authorId, recipientId, content }) {
  const info = db.prepare('INSERT INTO messages (author_id, recipient_id, content) VALUES (?, ?, ?)').run(authorId, recipientId, content);
  return db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(info.lastInsertRowid);
}

// Everyone `userId` has exchanged a DM with, most-recent-conversation-first,
// each with a preview of the last message — for the chat sidebar.
function listConversationsFor(userId) {
  const rows = db.prepare(`
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
  `).all(userId, userId, userId);

  if (!rows.length) return [];
  const otherIds = rows.map((r) => r.other_id);
  const placeholders = otherIds.map(() => '?').join(',');
  const users = db.prepare(`SELECT id, display_name, avatar_emoji, role FROM users WHERE id IN (${placeholders})`).all(...otherIds);
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
