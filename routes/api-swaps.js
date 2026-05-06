'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const store = require('../data-store');
const { requireAuth } = require('../middleware/auth');

const SWAPS_PATH = path.join(__dirname, '..', 'data-swaps.json');

async function loadSwaps() {
  try {
    const raw = await fs.readFile(SWAPS_PATH, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function saveSwaps(swaps) {
  await fs.writeFile(SWAPS_PATH, JSON.stringify(swaps, null, 2));
}

router.post('/', async (req, res) => {
  const { requester, date, fromCode, wantCode } = req.body || {};
  if (!requester || !date || !fromCode || !wantCode) return res.status(400).json({ error: 'Missing fields' });
  const swaps = await loadSwaps();
  swaps.push({
    id: Date.now().toString(36), requester: String(requester).trim(), date,
    fromCode: String(fromCode).toUpperCase(), wantCode: String(wantCode).toUpperCase(),
    status: 'pending', createdAt: new Date().toISOString()
  });
  await saveSwaps(swaps);
  res.json({ ok: true });
});

router.get('/', requireAuth, async (_req, res) => {
  const swaps = await loadSwaps();
  res.json(swaps);
});

router.post('/:id/:action', requireAuth, async (req, res) => {
  const { id, action } = req.params;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const swaps = await loadSwaps();
  const swap = swaps.find((s) => s.id === id);
  if (!swap) return res.status(404).json({ error: 'Swap not found' });
  if (swap.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

  swap.status = action === 'approve' ? 'approved' : 'rejected';

  if (action === 'approve') {
    const data = await store.load();
    if (!data.schedule[swap.date]) data.schedule[swap.date] = {};
    data.schedule[swap.date][swap.requester] = swap.wantCode;
    await store.save({ people: data.people, dates: data.dates, schedule: data.schedule });
  }

  await saveSwaps(swaps);
  res.json({ ok: true, swap });
});

module.exports = router;
