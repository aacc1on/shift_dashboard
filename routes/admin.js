const express = require('express');
const router = express.Router();
const store = require('../data-store');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  const data = await store.load();
  res.render('admin', {
    system: data.system,
    people: data.people,
    dates: data.dates,
    schedule: data.schedule,
    shiftTimes: store.SHIFT_TIMES
  });
});

module.exports = router;
