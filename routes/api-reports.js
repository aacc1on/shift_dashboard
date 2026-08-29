'use strict';

const express = require('express');
const router = express.Router();
const shiftsModel = require('../models/shifts');
const reportsModel = require('../models/reports');
const { requireAuth } = require('../middleware/auth');
const { nowIso } = require('../lib/shift-times');

const REPORT_DUE_MINUTES = Number(process.env.REPORT_DUE_MINUTES) || 20;

router.use(requireAuth);

router.get('/', (req, res) => {
  const { q, author, from, to } = req.query;
  const reports = reportsModel.listReports({
    authorId: author ? Number(author) : null,
    q: q || null,
    from: from || null,
    to: to || null
  });
  res.json(reports);
});

router.get('/shift/:shiftId', (req, res) => {
  const report = reportsModel.getReportForShift(Number(req.params.shiftId));
  if (!report) return res.status(404).json({ error: 'No report for this shift.' });
  res.json(report);
});

// Powers the dashboard reminder banner: is the viewer's own current shift
// due (or overdue) for its report?
router.get('/due', (req, res) => {
  const now = nowIso();
  const shift = shiftsModel.getCurrentShiftForUser(req.authUserId, now);
  if (!shift || !reportsModel.isReportDue(shift, now, REPORT_DUE_MINUTES)) {
    return res.json({ due: false });
  }
  res.json({
    due: true,
    shift: { id: shift.id, type: shift.type, start_at: shift.start_at, end_at: shift.end_at },
    windowMinutes: REPORT_DUE_MINUTES
  });
});

// Powers "what happened during the previous shift" continuity: the report
// from whoever had the shift immediately before the viewer's current one.
router.get('/incoming', (req, res) => {
  const now = nowIso();
  const shift = shiftsModel.getCurrentShiftForUser(req.authUserId, now);
  if (!shift) return res.json({ report: null });
  const previous = shiftsModel.getPreviousShift(shift);
  if (!previous) return res.json({ report: null });
  const report = reportsModel.getReportForShift(previous.id);
  res.json({ report: report || null });
});

router.post('/', (req, res) => {
  const shiftId = Number(req.body?.shiftId);
  if (!shiftId) return res.status(400).json({ error: 'shiftId is required.' });

  const shift = shiftsModel.getShiftById(shiftId);
  if (!shift) return res.status(404).json({ error: 'Shift not found.' });
  if (shift.user_id !== req.authUserId) {
    return res.status(403).json({ error: 'You can only file a report for your own shift.' });
  }
  if (shift.status !== 'open') {
    return res.status(400).json({ error: 'This shift already has a report.' });
  }

  const whatDone = String(req.body?.whatDone || '').trim();
  const unfinished = String(req.body?.unfinished || '').trim();
  const openItems = Array.isArray(req.body?.openItems)
    ? req.body.openItems.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  if (!whatDone) return res.status(400).json({ error: '"What was done" is required.' });

  try {
    const report = reportsModel.createReport({ shiftId, authorId: req.authUserId, whatDone, unfinished, openItems });
    res.json(report);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
