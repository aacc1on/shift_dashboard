const express = require('express');
const router = express.Router();
const store = require('../data-store');

router.get('/', async (req, res) => {
  const data = await store.load();
  res.render('index', {
    system: data.system,
    people: data.people,
    dates: data.dates,
    schedule: data.schedule,
    shiftTimes: store.SHIFT_TIMES
  });
});

module.exports = router;
