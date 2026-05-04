const express = require('express');
const router = express.Router();
const store = require('../data-store');

function getArmeniaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }));
}

function padZ(value) {
  return String(value).padStart(2, '0');
}

function dateStr(date) {
  return `${date.getFullYear()}-${padZ(date.getMonth() + 1)}-${padZ(date.getDate())}`;
}

function getShiftWindow(dateObj, shiftCode) {
  const shift = store.SHIFT_TIMES[shiftCode];
  if (!shift || !shift.start) return null;
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);

  const start = new Date(dateObj);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(dateObj);
  end.setHours(eh, em, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);

  return { start, end };
}

function getPersonStatus(person, now, schedule) {
  let current = null;
  let next = null;

  for (let offset = -1; offset <= 14; offset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const key = dateStr(day);
    const code = schedule[key]?.[person];
    if (!code || code === 'X') continue;

    const window = getShiftWindow(day, code);
    if (!window) continue;

    const nowMs = now.getTime();
    if (window.start.getTime() <= nowMs && nowMs < window.end.getTime()) {
      current = {
        dateStr: key,
        code,
        ...window,
        elapsed: nowMs - window.start.getTime(),
        remaining: window.end.getTime() - nowMs,
        total: window.end.getTime() - window.start.getTime(),
        progress: Math.floor(((nowMs - window.start.getTime()) / (window.end.getTime() - window.start.getTime())) * 100)
      };
    } else if (window.start.getTime() > nowMs && !next) {
      next = {
        dateStr: key,
        code,
        ...window,
        startsIn: window.start.getTime() - nowMs
      };
    }
  }

  const todayCode = schedule[dateStr(now)]?.[person] || 'X';
  return { todayCode, current, next };
}

router.get('/status', async (req, res) => {
  const data = await store.load();
  const now = getArmeniaNow();
  const responseData = {
    system: data.system,
    serverTime: now.toISOString(),
    data: {}
  };

  for (const person of data.people) {
    responseData.data[person] = getPersonStatus(person, now, data.schedule);
  }

  res.json(responseData);
});

module.exports = router;
