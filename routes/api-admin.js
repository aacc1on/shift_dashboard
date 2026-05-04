const express = require('express');
const router = express.Router();
const store = require('../data-store');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (req, res) => {
  const data = await store.load();
  res.json({
    system: data.system,
    people: data.people,
    dates: data.dates,
    schedule: data.schedule,
    shiftTimes: store.SHIFT_TIMES
  });
});

router.post('/', async (req, res) => {
  const payload = req.body;
  if (!payload || !Array.isArray(payload.people) || !Array.isArray(payload.dates) || typeof payload.schedule !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const people = payload.people.map((item) => String(item || '').trim()).filter(Boolean);
  const dates = payload.dates.map((item) => String(item || '').trim()).filter(Boolean);

  if (!people.length || !dates.length) {
    return res.status(400).json({ error: 'At least one operator and one date are required.' });
  }

  if (new Set(dates).size !== dates.length) {
    return res.status(400).json({ error: 'Duplicate dates are not allowed.' });
  }

  if (!dates.every((date) => ISO_DATE.test(date))) {
    return res.status(400).json({ error: 'Dates must be ISO format YYYY-MM-DD.' });
  }

  try {
    const saved = await store.save({ people, dates, schedule: payload.schedule });
    res.json({ ok: true, system: saved.system });
  } catch (error) {
    res.status(500).json({ error: 'Unable to save admin changes.' });
  }
});

module.exports = router;
