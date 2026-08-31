'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const usersModel = require('../models/users');
const shiftsModel = require('../models/shifts');
const swapsModel = require('../models/swaps');
const { requireAuth } = require('../middleware/auth');
const { nowIso } = require('../lib/shift-times');

const AUDIT_LOG_PATH = path.join(__dirname, '..', 'audit.log');

async function audit(line) {
  await fs.appendFile(AUDIT_LOG_PATH, `[${new Date().toISOString()}] ${line}\n`);
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const swaps = await swapsModel.listSwapsForUser(req.authUserId, { isLead: req.authRole === 'lead' });
  res.json(swaps);
});

router.post('/', async (req, res) => {
  const shiftId = Number(req.body?.shiftId);
  const targetId = Number(req.body?.targetId);
  if (!shiftId || !targetId) {
    return res.status(400).json({ error: 'shiftId and targetId are required.' });
  }

  const shift = await shiftsModel.getShiftById(shiftId);
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });
  if (shift.user_id !== req.authUserId) {
    return res.status(403).json({ error: 'You can only offer a swap for your own shift.' });
  }
  if (shift.status !== 'open') {
    return res.status(400).json({ error: 'This shift is closed and can no longer be swapped.' });
  }
  if (shift.start_at <= nowIso()) {
    return res.status(400).json({ error: 'This shift has already started.' });
  }

  const target = await usersModel.getUserById(targetId);
  if (!target || !target.active || target.role !== 'member') {
    return res.status(404).json({ error: 'Target operator not found.' });
  }
  if (target.id === req.authUserId) {
    return res.status(400).json({ error: "You can't request a swap with yourself." });
  }

  const swap = await swapsModel.createSwapRequest({ shiftId, requesterId: req.authUserId, targetId });
  await audit(`${req.authUser} requested a swap of shift #${shiftId} (${shift.type} ${shift.start_at}) with ${target.username}`);
  res.json(swap);
});

router.post('/:id/accept', async (req, res) => {
  const swap = await swapsModel.getSwapById(Number(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Swap not found.' });
  if (swap.target_id !== req.authUserId) return res.status(403).json({ error: 'Only the requested colleague can accept this swap.' });
  if (swap.status !== 'pending') return res.status(400).json({ error: 'This swap has already been resolved.' });

  const shift = await shiftsModel.getShiftById(swap.shift_id);
  if (!shift || shift.user_id !== swap.requester_id) {
    await swapsModel.resolveSwap(swap.id, 'cancelled');
    return res.status(409).json({ error: 'This shift changed since the request was made; the swap has been cancelled.' });
  }

  await shiftsModel.reassignShift(swap.shift_id, swap.target_id);
  await swapsModel.cancelOtherPendingSwapsForShift(swap.shift_id, swap.id);
  const resolved = await swapsModel.resolveSwap(swap.id, 'accepted');

  await audit(`${req.authUser} accepted swap #${swap.id}: shift #${swap.shift_id} (${shift.type} ${shift.start_at}) moved from ${swap.requester_name} to ${swap.target_name}`);
  res.json(resolved);
});

router.post('/:id/reject', async (req, res) => {
  const swap = await swapsModel.getSwapById(Number(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Swap not found.' });
  if (swap.target_id !== req.authUserId) return res.status(403).json({ error: 'Only the requested colleague can reject this swap.' });
  if (swap.status !== 'pending') return res.status(400).json({ error: 'This swap has already been resolved.' });

  const resolved = await swapsModel.resolveSwap(swap.id, 'rejected');
  await audit(`${req.authUser} rejected swap #${swap.id} from ${swap.requester_name}`);
  res.json(resolved);
});

router.post('/:id/cancel', async (req, res) => {
  const swap = await swapsModel.getSwapById(Number(req.params.id));
  if (!swap) return res.status(404).json({ error: 'Swap not found.' });
  if (swap.requester_id !== req.authUserId) return res.status(403).json({ error: 'Only the requester can cancel this swap.' });
  if (swap.status !== 'pending') return res.status(400).json({ error: 'This swap has already been resolved.' });

  const resolved = await swapsModel.resolveSwap(swap.id, 'cancelled');
  await audit(`${req.authUser} cancelled swap #${swap.id} with ${swap.target_name}`);
  res.json(resolved);
});

module.exports = router;
