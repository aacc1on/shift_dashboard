'use strict';

const { get, all, run } = require('../db');
const shiftsModel = require('./shifts');

const DOC_SELECT = `
  SELECT d.*, u.display_name AS author_name
  FROM documents d
  JOIN users u ON u.id = d.author_id
`;

async function getAccessList(documentId) {
  const rows = await all('SELECT user_id FROM document_access WHERE document_id = ?', documentId);
  return rows.map((r) => r.user_id);
}

async function setAccessList(documentId, userIds) {
  await run('DELETE FROM document_access WHERE document_id = ?', documentId);
  const ids = [...new Set(userIds.map(Number))];
  for (const uid of ids) {
    await run('INSERT OR IGNORE INTO document_access (document_id, user_id) VALUES (?, ?)', documentId, uid);
  }
}

// Can this viewer see a 'shift'-visibility document? Team-wide/published docs
// are always visible; 'shift' docs are visible to their author, any lead, and
// whoever holds the shift immediately after the one the doc is attached to
// (the person actually being handed off to).
async function canViewShiftDoc(doc, viewer) {
  if (viewer.role === 'lead') return true;
  if (doc.author_id === viewer.id) return true;
  if (!doc.shift_id) return false;
  const shift = await shiftsModel.getShiftById(doc.shift_id);
  if (!shift) return false;
  const next = await shiftsModel.getNextShiftAfter(shift);
  return !!next && next.user_id === viewer.id;
}

// 'restricted' documents: author and leads always see them; everyone else
// needs to be on the explicit per-document allow-list.
async function canViewRestrictedDoc(doc, viewer) {
  if (viewer.role === 'lead') return true;
  if (doc.author_id === viewer.id) return true;
  return (await getAccessList(doc.id)).includes(viewer.id);
}

async function canView(doc, viewer) {
  if (doc.visibility === 'shift') return canViewShiftDoc(doc, viewer);
  if (doc.visibility === 'restricted') return canViewRestrictedDoc(doc, viewer);
  return true;
}

// Attaches the access list only for people who can manage it (author/lead) —
// a restricted-viewer who's just on the list doesn't need to see who else is.
async function withAccessInfo(doc, viewer) {
  if (doc.visibility !== 'restricted') return doc;
  const canManage = viewer && (viewer.role === 'lead' || doc.author_id === viewer.id);
  return canManage ? { ...doc, access_user_ids: await getAccessList(doc.id) } : doc;
}

async function getDocumentById(id, viewer) {
  const doc = await get(`${DOC_SELECT} WHERE d.id = ?`, id);
  if (!doc) return null;
  if (viewer && !(await canView(doc, viewer))) return null;
  return withAccessInfo(doc, viewer);
}

async function listDocuments({ viewer, type = null, q = null, from = null, to = null, templatesOnly = false } = {}) {
  const clauses = ['d.is_template = ?'];
  const params = [templatesOnly ? 1 : 0];
  if (type) { clauses.push('d.type = ?'); params.push(type); }
  if (from) { clauses.push('d.created_at >= ?'); params.push(from); }
  if (to) { clauses.push('d.created_at <= ?'); params.push(to); }
  if (q) {
    clauses.push('(d.title LIKE ? OR d.content LIKE ? OR d.tags LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = await all(`${DOC_SELECT} ${where} ORDER BY d.created_at DESC`, ...params);

  let visible;
  if (viewer) {
    const flags = await Promise.all(rows.map((d) => canView(d, viewer)));
    visible = rows.filter((_, i) => flags[i]);
  } else {
    visible = rows.filter((d) => d.visibility === 'team' || d.visibility === 'published');
  }
  return Promise.all(visible.map((d) => withAccessInfo(d, viewer)));
}

async function createDocument({ type, title, tags, content, visibility, shiftId, authorId, isTemplate, restrictedTo }) {
  const info = await run(
    'INSERT INTO documents (type, title, tags, content, visibility, is_template, shift_id, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    type, title, tags || '', content || '', visibility || 'team', isTemplate ? 1 : 0, shiftId || null, authorId
  );
  const id = info.lastInsertRowid;
  if (visibility === 'restricted' && Array.isArray(restrictedTo)) {
    await setAccessList(id, restrictedTo);
  }
  return get(`${DOC_SELECT} WHERE d.id = ?`, id);
}

async function updateDocument(id, fields) {
  const doc = await get('SELECT * FROM documents WHERE id = ?', id);
  if (!doc) throw new Error('Document not found.');
  if (doc.visibility === 'published') throw new Error('Published documents are locked — unpublish first to edit.');

  const allowed = ['type', 'title', 'tags', 'content', 'visibility'];
  const sets = [];
  const values = [];
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  });
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    values.push(id);
    await run(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`, ...values);
  }

  const finalVisibility = fields.visibility !== undefined ? fields.visibility : doc.visibility;
  if (finalVisibility === 'restricted' && Array.isArray(fields.restrictedTo)) {
    await setAccessList(id, fields.restrictedTo);
  } else if (finalVisibility !== 'restricted') {
    await setAccessList(id, []); // no longer restricted — clear any stale allow-list
  }

  return get(`${DOC_SELECT} WHERE d.id = ?`, id);
}

async function deleteDocument(id) {
  await run('DELETE FROM documents WHERE id = ?', id);
}

async function setVisibility(id, visibility) {
  await run("UPDATE documents SET visibility = ?, updated_at = datetime('now') WHERE id = ?", visibility, id);
  return get(`${DOC_SELECT} WHERE d.id = ?`, id);
}

async function createFromTemplate(templateId, authorId) {
  const tpl = await get('SELECT * FROM documents WHERE id = ? AND is_template = 1', templateId);
  if (!tpl) throw new Error('Template not found.');
  const todayStr = new Date().toISOString().slice(0, 10);
  return createDocument({
    type: tpl.type,
    title: `${tpl.title} — ${todayStr}`,
    tags: tpl.tags,
    content: tpl.content,
    visibility: 'team',
    shiftId: null,
    authorId,
    isTemplate: false
  });
}

module.exports = {
  getDocumentById,
  listDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  setVisibility,
  createFromTemplate,
  canView,
  getAccessList
};
