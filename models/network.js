'use strict';

const db = require('../db');

function listDiagrams() {
  return db.prepare(`
    SELECT nd.id, nd.title, nd.created_at, nd.updated_at,
           a.display_name AS author_name, u.display_name AS updated_by_name
    FROM network_diagrams nd
    JOIN users a ON a.id = nd.author_id
    LEFT JOIN users u ON u.id = nd.updated_by
    ORDER BY nd.updated_at DESC
  `).all();
}

function getDiagram(id) {
  return db.prepare('SELECT * FROM network_diagrams WHERE id = ?').get(id);
}

function createDiagram({ title, authorId }) {
  const info = db.prepare(
    'INSERT INTO network_diagrams (title, author_id, updated_by) VALUES (?, ?, ?)'
  ).run(title, authorId, authorId);
  return getDiagram(info.lastInsertRowid);
}

function updateDiagramData(id, data, updatedBy) {
  db.prepare(
    "UPDATE network_diagrams SET data = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(data, updatedBy, id);
}

function renameDiagram(id, title, updatedBy) {
  db.prepare(
    "UPDATE network_diagrams SET title = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, updatedBy, id);
}

function deleteDiagram(id) {
  db.prepare('DELETE FROM network_diagrams WHERE id = ?').run(id);
}

module.exports = { listDiagrams, getDiagram, createDiagram, updateDiagramData, renameDiagram, deleteDiagram };
