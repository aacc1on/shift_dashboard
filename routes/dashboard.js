const express = require('express');
const router = express.Router();
const store = require('../data-store');

function getYerevanTodayDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }));
}

function toIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekRange(weekOffset) {
  const now = getYerevanTodayDate();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + (weekOffset * 7));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return { monday, sunday };
}

router.get('/', async (req, res) => {
  const data = await store.load();
  const parsed = Number.parseInt(req.query.week, 10);
  const week = Number.isFinite(parsed) ? parsed : 0;
  const { monday, sunday } = getWeekRange(week);

  const weekDates = data.dates
    .filter((dateStr) => {
      const d = new Date(`${dateStr}T00:00:00`);
      return d >= monday && d <= sunday;
    })
    .sort();

  const weekSchedule = {};
  weekDates.forEach((d) => {
    weekSchedule[d] = data.schedule[d] || {};
  });

  res.render('index', {
    system: data.system,
    people: data.people,
    dates: weekDates,
    schedule: weekSchedule,
    shiftTimes: store.SHIFT_TIMES,
    week,
    weekLabel: `${toIsoDate(monday)} → ${toIsoDate(sunday)}`
  });
});

module.exports = router;
