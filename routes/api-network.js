'use strict';

const express = require('express');
const router = express.Router();
const networkModel = require('../models/network');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(networkModel.listDiagrams());
});

router.get('/:id', (req, res) => {
  const diagram = networkModel.getDiagram(req.params.id);
  if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
  res.json(diagram);
});

router.post('/', (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const diagram = networkModel.createDiagram({ title, authorId: req.authUserId });
  res.json(diagram);
});

router.put('/:id', (req, res) => {
  const diagram = networkModel.getDiagram(req.params.id);
  if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });

  if (req.body?.title != null) {
    const title = String(req.body.title).trim();
    if (!title) return res.status(400).json({ error: 'Title cannot be empty.' });
    networkModel.renameDiagram(diagram.id, title, req.authUserId);
  }
  if (req.body?.data != null) {
    const data = typeof req.body.data === 'string' ? req.body.data : JSON.stringify(req.body.data);
    networkModel.updateDiagramData(diagram.id, data, req.authUserId);
  }
  res.json(networkModel.getDiagram(diagram.id));
});

router.delete('/:id', (req, res) => {
  const diagram = networkModel.getDiagram(req.params.id);
  if (!diagram) return res.status(404).json({ error: 'Diagram not found.' });
  if (req.authRole !== 'lead' && diagram.author_id !== req.authUserId) {
    return res.status(403).json({ error: 'Only the author or a lead can delete this diagram.' });
  }
  networkModel.deleteDiagram(diagram.id);
  res.json({ ok: true });
});

module.exports = router;
