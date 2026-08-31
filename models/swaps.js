'use strict';

const { get, all, run } = require('../db');

async function createSwapRequest({ shiftId, requesterId, targetId }) {
  const info = await run(
    'INSERT INTO swaps (shift_id, requester_id, target_id) VALUES (?, ?, ?)',
    shiftId, requesterId, targetId
  );
  return getSwapById(info.lastInsertRowid);
}

const SWAP_SELECT = `
  SELECT
    s.id, s.status, s.created_at, s.resolved_at,
    s.shift_id, sh.start_at, sh.end_at, sh.type AS shift_type, sh.user_id AS shift_user_id,
    s.requester_id, ru.display_name AS requester_name,
    s.target_id, tu.display_name AS target_name
  FROM swaps s
  JOIN shifts sh ON sh.id = s.shift_id
  JOIN users ru ON ru.id = s.requester_id
  JOIN users tu ON tu.id = s.target_id
`;

async function getSwapById(id) {
  return get(`${SWAP_SELECT} WHERE s.id = ?`, id);
}

// Swaps visible to a given user: ones they requested, ones directed at them,
// or (for leads) everything, for oversight.
async function listSwapsForUser(userId, { isLead = false } = {}) {
  if (isLead) {
    return all(`${SWAP_SELECT} ORDER BY s.created_at DESC`);
  }
  return all(`${SWAP_SELECT} WHERE s.requester_id = ? OR s.target_id = ? ORDER BY s.created_at DESC`, userId, userId);
}

async function resolveSwap(id, status) {
  await run("UPDATE swaps SET status = ?, resolved_at = datetime('now') WHERE id = ?", status, id);
  return getSwapById(id);
}

// Any other pending swap requests referencing this exact shift become moot
// once one of them resolves (the shift can only move once).
async function cancelOtherPendingSwapsForShift(shiftId, exceptSwapId) {
  await run(
    "UPDATE swaps SET status = 'cancelled', resolved_at = datetime('now') WHERE shift_id = ? AND id != ? AND status = 'pending'",
    shiftId, exceptSwapId
  );
}

module.exports = {
  createSwapRequest,
  getSwapById,
  listSwapsForUser,
  resolveSwap,
  cancelOtherPendingSwapsForShift
};
