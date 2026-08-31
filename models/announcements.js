'use strict';

const { get, run } = require('../db');

const SELECT = `
  SELECT a.id, a.content, a.created_at, a.author_id, u.display_name AS author_name
  FROM announcements a
  JOIN users u ON u.id = a.author_id
`;

async function getLatest() {
  return (await get(`${SELECT} ORDER BY a.id DESC LIMIT 1`)) || null;
}

async function createAnnouncement({ authorId, content }) {
  const info = await run('INSERT INTO announcements (author_id, content) VALUES (?, ?)', authorId, content);
  return get(`${SELECT} WHERE a.id = ?`, info.lastInsertRowid);
}

module.exports = { getLatest, createAnnouncement };
