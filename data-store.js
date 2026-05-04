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

const DEFAULT_DATA = {
  system: 'SOC',
  people: ['Areg', 'Minas', 'Rubik', 'Levon', 'Hrach', 'Arshak'],
  dates: ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10'],
  schedule: {
    '2026-05-04': { Areg: 'X', Minas: 'N', Rubik: 'X', Levon: 'D', Hrach: 'E', Arshak: 'N' },
    '2026-05-05': { Areg: 'D', Minas: 'X', Rubik: 'N', Levon: 'E', Hrach: 'N', Arshak: 'X' },
    '2026-05-06': { Areg: 'E', Minas: 'D', Rubik: 'N', Levon: 'E', Hrach: 'X', Arshak: 'N' },
    '2026-05-07': { Areg: 'E', Minas: 'D', Rubik: 'X', Levon: 'N', Hrach: 'D', Arshak: 'N' },
    '2026-05-08': { Areg: 'X', Minas: 'N', Rubik: 'D', Levon: 'N', Hrach: 'E', Arshak: 'X' },
    '2026-05-09': { Areg: 'N', Minas: 'X', Rubik: 'D', Levon: 'X', Hrach: 'N', Arshak: 'E' },
    '2026-05-10': { Areg: 'N', Minas: 'D', Rubik: 'N', Levon: 'X', Hrach: 'X', Arshak: 'E' }
  }
};

async function ensureStore() {
  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function normalizeName(value) {
  return String(value || '').trim();
}

async function load() {
  await ensureStore();
  const json = await fs.readFile(STORE_PATH, 'utf8');
  const data = JSON.parse(json);
  return {
    system: data.system || DEFAULT_DATA.system,
    people: Array.isArray(data.people) ? data.people : DEFAULT_DATA.people,
    dates: Array.isArray(data.dates) ? data.dates : DEFAULT_DATA.dates,
    schedule: data.schedule && typeof data.schedule === 'object' ? data.schedule : DEFAULT_DATA.schedule,
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
