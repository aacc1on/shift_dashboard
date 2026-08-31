'use strict';

const { get, all, run } = require('../db');

async function listDiagrams() {
  return all(`
    SELECT nd.id, nd.title, nd.created_at, nd.updated_at,
           a.display_name AS author_name, u.display_name AS updated_by_name
    FROM network_diagrams nd
    JOIN users a ON a.id = nd.author_id
    LEFT JOIN users u ON u.id = nd.updated_by
    ORDER BY nd.updated_at DESC
  `);
}

async function getDiagram(id) {
  return get('SELECT * FROM network_diagrams WHERE id = ?', id);
}

async function createDiagram({ title, authorId }) {
  const info = await run(
    'INSERT INTO network_diagrams (title, author_id, updated_by) VALUES (?, ?, ?)',
    title, authorId, authorId
  );
  return getDiagram(info.lastInsertRowid);
}

async function updateDiagramData(id, data, updatedBy) {
  await run(
    "UPDATE network_diagrams SET data = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
    data, updatedBy, id
  );
}

async function renameDiagram(id, title, updatedBy) {
  await run(
    "UPDATE network_diagrams SET title = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
    title, updatedBy, id
  );
}

async function deleteDiagram(id) {
  await run('DELETE FROM network_diagrams WHERE id = ?', id);
}

module.exports = { listDiagrams, getDiagram, createDiagram, updateDiagramData, renameDiagram, deleteDiagram };
