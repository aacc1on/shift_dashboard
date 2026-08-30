'use strict';

const db = require('../db');

const SELECT = `
  SELECT a.id, a.content, a.created_at, a.author_id, u.display_name AS author_name
  FROM announcements a
  JOIN users u ON u.id = a.author_id
`;

function getLatest() {
  return db.prepare(`${SELECT} ORDER BY a.id DESC LIMIT 1`).get() || null;
}

function createAnnouncement({ authorId, content }) {
  const info = db.prepare('INSERT INTO announcements (author_id, content) VALUES (?, ?)').run(authorId, content);
  return db.prepare(`${SELECT} WHERE a.id = ?`).get(info.lastInsertRowid);
}

module.exports = { getLatest, createAnnouncement };
