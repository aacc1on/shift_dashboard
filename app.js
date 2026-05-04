const express = require('express');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const shiftTimes = {
  D: { start: '09:00', end: '17:00', label: 'Day Shift', color: '#00ff88', bg: '#002a18' },
  E: { start: '17:00', end: '01:00', label: 'Evening Shift', color: '#ffcc00', bg: '#2a2200' },
  N: { start: '01:00', end: '09:00', label: 'Night Shift', color: '#ff6b35', bg: '#2a1200' },
  X: { start: null, end: null, label: 'Day Off', color: '#4a9eff', bg: '#001a2a' }
};

const VALID_CODES = new Set(Object.keys(shiftTimes));
let people = ['Areg', 'Minas', 'Rubik', 'Levon', 'Hrach', 'Arshak'];

let schedule = {
  '2026-05-04': { Areg: 'X', Minas: 'N', Rubik: 'X', Levon: 'D', Hrach: 'E', Arshak: 'N' },
  '2026-05-05': { Areg: 'D', Minas: 'X', Rubik: 'N', Levon: 'E', Hrach: 'N', Arshak: 'X' },
  '2026-05-06': { Areg: 'E', Minas: 'D', Rubik: 'N', Levon: 'E', Hrach: 'X', Arshak: 'N' },
  '2026-05-07': { Areg: 'E', Minas: 'D', Rubik: 'X', Levon: 'N', Hrach: 'D', Arshak: 'N' },
  '2026-05-08': { Areg: 'X', Minas: 'N', Rubik: 'D', Levon: 'N', Hrach: 'E', Arshak: 'X' },
  '2026-05-09': { Areg: 'N', Minas: 'X', Rubik: 'D', Levon: 'X', Hrach: 'N', Arshak: 'E' },
  '2026-05-10': { Areg: 'N', Minas: 'D', Rubik: 'N', Levon: 'X', Hrach: 'X', Arshak: 'E' }
};

function getArmeniaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }));
}

function padZ(n) {
  return String(n).padStart(2, '0');
}

function dateStr(d) {
  return `${d.getFullYear()}-${padZ(d.getMonth() + 1)}-${padZ(d.getDate())}`;
}

function ensureWeek(dateISO) {
  const start = new Date(`${dateISO}T00:00:00+04:00`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateStr(d);
    if (!schedule[key]) schedule[key] = {};
    for (const person of people) {
      if (!VALID_CODES.has(schedule[key][person])) schedule[key][person] = 'X';
    }
  }
}

ensureWeek('2026-05-04');

function getShiftWindow(dateObj, shiftCode) {
  const t = shiftTimes[shiftCode];
  if (!t || !t.start) return null;
  const [sh, sm] = t.start.split(':').map(Number);
  const [eh, em] = t.end.split(':').map(Number);
  const start = new Date(dateObj);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(dateObj);
  end.setHours(eh, em, 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return { start, end };
}

function getPersonStatus(person, now) {
  let current = null;
  let next = null;

  for (let offset = -1; offset <= 14; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const ds = dateStr(d);
    const code = schedule[ds]?.[person];
    if (!code || code === 'X') continue;

    const win = getShiftWindow(d, code);
    if (!win) continue;

    const nowMs = now.getTime();
    if (win.start.getTime() <= nowMs && nowMs < win.end.getTime()) {
      current = {
        dateStr: ds,
        code,
        ...win,
        elapsed: nowMs - win.start.getTime(),
        remaining: win.end.getTime() - nowMs,
        total: win.end.getTime() - win.start.getTime(),
        progress: Math.floor(((nowMs - win.start.getTime()) / (win.end.getTime() - win.start.getTime())) * 100)
      };
    } else if (win.start.getTime() > nowMs && !next) {
      next = { dateStr: ds, code, ...win, startsIn: win.start.getTime() - nowMs };
    }
  }

  const todayCode = schedule[dateStr(now)]?.[person] || 'X';
  return { todayCode, current, next };
}

app.get('/', (req, res) => {
  res.render('index', { people, shiftTimes, schedule });
});

app.get('/admin', (req, res) => {
  res.render('admin');
});

app.get('/api/status', (req, res) => {
  const now = getArmeniaNow();
  const data = {};
  for (const p of people) data[p] = getPersonStatus(p, now);
  res.json({ serverTime: now.toISOString(), data });
});

app.get('/api/admin', (req, res) => {
  const dates = Object.keys(schedule).sort();
  res.json({ people, schedule, dates, shiftTimes });
});

app.post('/api/admin', (req, res) => {
  const nextPeople = Array.isArray(req.body.people)
    ? req.body.people.map((p) => String(p || '').trim()).filter(Boolean)
    : [];
  const nextSchedule = req.body.schedule && typeof req.body.schedule === 'object' ? req.body.schedule : null;
  const nextDates = Array.isArray(req.body.dates) ? req.body.dates : null;

  if (!nextPeople.length || !nextSchedule || !nextDates || !nextDates.length) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const normalized = {};
  for (const date of nextDates) {
    const rows = nextSchedule[date] || {};
    normalized[date] = {};
    for (const person of nextPeople) {
      const code = String(rows?.[person] || 'X').toUpperCase();
      normalized[date][person] = VALID_CODES.has(code) ? code : 'X';
    }
  }

  people = nextPeople;
  schedule = normalized;
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\x1b[32m[SHIFT-DASHBOARD]\x1b[0m http://localhost:${PORT}`);
});
