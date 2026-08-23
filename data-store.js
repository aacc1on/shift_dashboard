const fs = require('fs').promises;
const path = require('path');

const STORE_PATH = path.join(__dirname, 'data.json');
const VALID_CODES = new Set(['D', 'E', 'N', 'X']);

const SHIFT_TIMES = {
  D: { start: '09:00', end: '17:00', label: 'Day Shift', color: '#00ff88', bg: '#002a18' },
  E: { start: '17:00', end: '01:00', label: 'Evening Shift', color: '#ffcc00', bg: '#2a2200' },
  N: { start: '01:00', end: '09:00', label: 'Night Shift', color: '#ff6b35', bg: '#2a1200' },
  X: { start: null, end: null, label: 'Day Off', color: '#4a9eff', bg: '#001a2a' }
};

const WEEK_PATTERN = [
  { Areg: 'X', Minas: 'N', Rubik: 'X', Levon: 'D', Hrach: 'E', Arshak: 'N' },
  { Areg: 'D', Minas: 'X', Rubik: 'N', Levon: 'E', Hrach: 'N', Arshak: 'X' },
  { Areg: 'E', Minas: 'D', Rubik: 'N', Levon: 'E', Hrach: 'X', Arshak: 'N' },
  { Areg: 'E', Minas: 'D', Rubik: 'X', Levon: 'N', Hrach: 'D', Arshak: 'N' },
  { Areg: 'X', Minas: 'N', Rubik: 'D', Levon: 'N', Hrach: 'E', Arshak: 'X' },
  { Areg: 'N', Minas: 'X', Rubik: 'D', Levon: 'X', Hrach: 'N', Arshak: 'E' },
  { Areg: 'N', Minas: 'D', Rubik: 'N', Levon: 'X', Hrach: 'X', Arshak: 'E' }
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildDefaultData() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }));
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset - 7);

  const people = ['Areg', 'Minas', 'Rubik', 'Levon', 'Hrach', 'Arshak'];
  const dates = [];
  const schedule = {};

  for (let i = 0; i < 28; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const iso = isoLocal(d);
    dates.push(iso);
    schedule[iso] = WEEK_PATTERN[i % 7];
  }

  return { system: 'SOC', people, dates, schedule };
}

async function ensureStore() {
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(buildDefaultData(), null, 2));
  }
}

function normalizeName(value) {
  return String(value || '').trim();
}

async function load() {
  await ensureStore();
  const json = await fs.readFile(STORE_PATH, 'utf8');
  const data = JSON.parse(json);
  const fallback = buildDefaultData();
  return {
    system: data.system || fallback.system,
    people: Array.isArray(data.people) ? data.people : fallback.people,
    dates: Array.isArray(data.dates) ? data.dates : fallback.dates,
    schedule: data.schedule && typeof data.schedule === 'object' ? data.schedule : fallback.schedule,
    shiftTimes: SHIFT_TIMES
  };
}

async function save(payload) {
  const people = Array.isArray(payload.people)
    ? payload.people.map(normalizeName).filter(Boolean)
    : [];

  const dates = Array.isArray(payload.dates)
    ? payload.dates.map((date) => String(date || '').trim()).filter(Boolean)
    : [];

  const schedule = {};
  for (const date of dates) {
    schedule[date] = {};
    const row = payload.schedule && typeof payload.schedule[date] === 'object' ? payload.schedule[date] : {};
    for (const person of people) {
      const code = String(row[person] || 'X').toUpperCase();
      schedule[date][person] = VALID_CODES.has(code) ? code : 'X';
    }
  }

  const normalizedData = {
    system: 'SOC',
    people,
    dates,
    schedule
  };

  await fs.writeFile(STORE_PATH, JSON.stringify(normalizedData, null, 2));
  return normalizedData;
}

module.exports = {
  load,
  save,
  SHIFT_TIMES,
  VALID_CODES
};
