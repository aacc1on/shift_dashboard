'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const documentsModel = require('../models/documents');
const { requireAuth } = require('../middleware/auth');
const { renderMarkdown } = require('../lib/markdown');

const AUDIT_LOG_PATH = path.join(__dirname, '..', 'audit.log');

router.use(requireAuth);

function viewerOf(req) {
  return { id: req.authUserId, role: req.authRole };
}

function withRendered(doc) {
  return { ...doc, content_html: renderMarkdown(doc.content) };
}

router.get('/', (req, res) => {
  const { type, q, from, to, templates } = req.query;
  const docs = documentsModel.listDocuments({
    viewer: viewerOf(req),
    type: type || null,
    q: q || null,
    from: from || null,
    to: to || null,
    templatesOnly: templates === '1'
  });
  res.json(docs.map(withRendered));
});

router.get('/:id', (req, res) => {
  const doc = documentsModel.getDocumentById(Number(req.params.id), viewerOf(req));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.json(withRendered(doc));
});

const VISIBILITIES = ['shift', 'team', 'published', 'restricted'];

router.post('/', (req, res) => {
  const { type, title, tags, content, visibility, shiftId, isTemplate, restrictedTo } = req.body || {};
  if (!type || !String(type).trim()) return res.status(400).json({ error: 'type is required.' });
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required.' });

  const requestedVisibility = VISIBILITIES.includes(visibility) ? visibility : 'team';
  if (requestedVisibility === 'published' && req.authRole !== 'lead') {
    return res.status(403).json({ error: 'Only a lead can publish a document directly — save as team-visible, then publish.' });
  }

  const doc = documentsModel.createDocument({
    type: String(type).trim(),
    title: String(title).trim(),
    tags: String(tags || '').trim(),
    content: String(content || ''),
    visibility: requestedVisibility,
    shiftId: shiftId ? Number(shiftId) : null,
    authorId: req.authUserId,
    isTemplate: !!isTemplate,
    restrictedTo: Array.isArray(restrictedTo) ? restrictedTo : []
  });
  res.json(withRendered(documentsModel.getDocumentById(doc.id, viewerOf(req))));
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const doc = documentsModel.getDocumentById(id, viewerOf(req));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (doc.author_id !== req.authUserId && req.authRole !== 'lead') {
    return res.status(403).json({ error: 'Only the author or a lead can edit this document.' });
  }

  const { type, title, tags, content, visibility, restrictedTo } = req.body || {};
  if (visibility === 'published' && req.authRole !== 'lead') {
    return res.status(403).json({ error: 'Only a lead can publish a document.' });
  }

  try {
    documentsModel.updateDocument(id, {
      ...(type !== undefined ? { type: String(type).trim() } : {}),
      ...(title !== undefined ? { title: String(title).trim() } : {}),
      ...(tags !== undefined ? { tags: String(tags).trim() } : {}),
      ...(content !== undefined ? { content: String(content) } : {}),
      ...(visibility !== undefined && VISIBILITIES.includes(visibility) ? { visibility } : {}),
      ...(Array.isArray(restrictedTo) ? { restrictedTo } : {})
    });
    res.json(withRendered(documentsModel.getDocumentById(id, viewerOf(req))));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const doc = documentsModel.getDocumentById(id, viewerOf(req));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (doc.author_id !== req.authUserId && req.authRole !== 'lead') {
    return res.status(403).json({ error: 'Only the author or a lead can delete this document.' });
  }

  documentsModel.deleteDocument(id);
  await fs.appendFile(AUDIT_LOG_PATH, `[${new Date().toISOString()}] ${req.authUser} deleted document #${id} ("${doc.title}")\n`);
  res.json({ ok: true });
});

router.post('/:id/publish', (req, res) => {
  if (req.authRole !== 'lead') return res.status(403).json({ error: 'Only a lead can publish a document.' });
  const doc = documentsModel.getDocumentById(Number(req.params.id), viewerOf(req));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.json(withRendered(documentsModel.setVisibility(doc.id, 'published')));
});

router.post('/:id/unpublish', (req, res) => {
  if (req.authRole !== 'lead') return res.status(403).json({ error: 'Only a lead can unpublish a document.' });
  const doc = documentsModel.getDocumentById(Number(req.params.id), viewerOf(req));
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  res.json(withRendered(documentsModel.setVisibility(doc.id, 'team')));
});

router.post('/:id/use-template', (req, res) => {
  try {
    const doc = documentsModel.createFromTemplate(Number(req.params.id), req.authUserId);
    res.json(withRendered(doc));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
