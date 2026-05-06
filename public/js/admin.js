'use strict';

const VALID_CODES = ['D', 'E', 'N', 'X'];
const COLORS = { D: '#00ff88', E: '#ffcc00', N: '#ff6b35', X: '#4a9eff' };
let people = [];
let dates = [];
let schedule = {};

function setFeedback(message, type = 'info') {
  const el = document.getElementById('admin-feedback');
  el.textContent = message;
  el.className = `admin-feedback${type === 'error' ? ' error' : ''}`;
}

function updateSidebarStats() {
  const el = document.getElementById('sidebar-stats');
  if (!el) return;
  const counts = { D: 0, E: 0, N: 0, X: 0 };
  for (const dateObj of Object.values(schedule)) {
    for (const code of Object.values(dateObj)) {
      if (counts[code] !== undefined) counts[code]++;
    }
  }
  el.innerHTML = [
    `<span style="color:#00ff88">D (Day)&nbsp;&nbsp;&nbsp;&nbsp;</span> ${counts.D} shifts`,
    `<span style="color:#ffcc00">E (Evening)</span> ${counts.E} shifts`,
    `<span style="color:#ff6b35">N (Night)&nbsp;&nbsp;</span> ${counts.N} shifts`,
    `<span style="color:#4a9eff">X (Off)&nbsp;&nbsp;&nbsp;</span> ${counts.X} slots`,
    `<br><span style="opacity:.4">Operators: ${people.length}</span>`,
    `<span style="opacity:.4">Dates: ${dates.length}</span>`,
  ].join('<br>');
}

function colorSelect(select) {
  const color = COLORS[select.value] || '#c8e8f0';
  select.style.color = color;
  select.style.borderColor = color + '60';
}

function buildAdminTable() {
  const table = document.getElementById('admin-table');
  const headerRow = [
    '<tr>',
    '<th style="text-align:left;min-width:130px">OPERATOR</th>',
    ...dates.map((date) => `<th><input class="date-input-cell" type="date" value="${date}" data-date="${date}" /><button class="remove-btn" data-remove-date="${date}" title="Remove date">×</button></th>`),
    '</tr>'
  ].join('');

  const bodyRows = people.map((person) => {
    const cells = dates.map((date) => {
      const current = schedule[date]?.[person] || 'X';
      const opts = VALID_CODES.map((code) =>
        `<option value="${code}" ${code === current ? 'selected' : ''}>${code}</option>`
      ).join('');
      return `<td><select data-person="${person}" data-date="${date}">${opts}</select></td>`;
    }).join('');

    return `<tr>
      <td>
        <input class="person-name-input" value="${person}" data-person="${person}" />
        <button class="remove-btn" data-remove-person="${person}" title="Remove operator">×</button>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  table.innerHTML = `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;

  // Color all selects
  table.querySelectorAll('select').forEach((s) => {
    colorSelect(s);
    s.addEventListener('change', () => colorSelect(s));
  });
}

function refreshTable() {
  buildAdminTable();
  attachControls();
  updateSidebarStats();
}

function getFormData() {
  const nameInputs = Array.from(document.querySelectorAll('.person-name-input'));
  const dateInputs = Array.from(document.querySelectorAll('.date-input-cell'));

  const newPeople = nameInputs.map((i) => i.value.trim()).filter(Boolean);
  const newDates = dateInputs.map((i) => i.value).filter(Boolean);

  if (new Set(newPeople).size !== newPeople.length) throw new Error('Operator names must be unique.');
  if (new Set(newDates).size !== newDates.length) throw new Error('Dates must be unique.');
  const bad = newDates.find((d) => !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d));
  if (bad) throw new Error('Invalid date format: ' + bad);

  const payloadSchedule = {};
  newDates.forEach((date) => {
    payloadSchedule[date] = {};
    newPeople.forEach((person) => {
      const sel = document.querySelector(`select[data-person="${CSS.escape(person)}"][data-date="${CSS.escape(date)}"]`);
      payloadSchedule[date][person] = sel ? sel.value : 'X';
    });
  });

  return { people: newPeople, dates: newDates, schedule: payloadSchedule };
}

function attachControls() {
  document.querySelectorAll('[data-remove-person]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.removePerson;
      people = people.filter((p) => p !== name);
      for (const d of dates) { if (schedule[d]) delete schedule[d][name]; }
      refreshTable();
    });
  });

  document.querySelectorAll('[data-remove-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.dataset.removeDate;
      dates = dates.filter((d) => d !== date);
      delete schedule[date];
      refreshTable();
    });
  });

  document.querySelectorAll('.date-input-cell').forEach((input) => {
    input.addEventListener('change', () => {
      const old = input.dataset.date;
      const val = input.value.trim();
      if (!val) return;
      const idx = dates.indexOf(old);
      if (idx !== -1) {
        dates[idx] = val;
        schedule[val] = schedule[old] || {};
        if (old !== val) delete schedule[old];
        input.dataset.date = val;
        refreshTable();
      }
    });
  });
}

function bindAdminActions() {
  document.getElementById('add-person-btn').addEventListener('click', () => {
    const input = document.getElementById('new-person');
    const value = input.value.trim();
    if (!value) { setFeedback('Enter a name first.', 'error'); return; }
    if (people.includes(value)) { setFeedback('Operator already exists.', 'error'); return; }
    people.push(value);
    for (const d of dates) { if (schedule[d]) schedule[d][value] = 'X'; }
    input.value = '';
    refreshTable();
    setFeedback(`Operator "${value}" added.`);
  });

  document.getElementById('add-date-btn').addEventListener('click', () => {
    const input = document.getElementById('new-date');
    const value = input.value.trim();
    if (!value) { setFeedback('Select a date first.', 'error'); return; }
    if (dates.includes(value)) { setFeedback('Date already in schedule.', 'error'); return; }
    dates.push(value);
    dates.sort();
    schedule[value] = {};
    people.forEach((p) => { schedule[value][p] = 'X'; });
    input.value = '';
    refreshTable();
    setFeedback(`Date ${value} added.`);
  });

  document.getElementById('save-admin-btn').addEventListener('click', async () => {
    setFeedback('Saving...');
    try {
      const payload = getFormData();
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed.');
      // Sync local state
      people = payload.people;
      dates = payload.dates;
      schedule = payload.schedule;
      setFeedback('Changes saved. Dashboard will reflect updates on next refresh.');
    } catch (err) {
      setFeedback(err.message, 'error');
    }
  });

  document.getElementById('reset-admin-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin');
      const data = await res.json();
      people = data.people;
      dates = data.dates;
      schedule = data.schedule;
      refreshTable();
      setFeedback('Reloaded from server.');
    } catch {
      setFeedback('Failed to reload from server.', 'error');
    }
  });
}

async function initialize() {
  const init = window.SOC_INIT || {};
  people = Array.isArray(init.people) ? [...init.people] : [];
  dates = Array.isArray(init.dates) ? [...init.dates] : [];
  schedule = typeof init.schedule === 'object' ? JSON.parse(JSON.stringify(init.schedule)) : {};

  refreshTable();
  bindAdminActions();
  setFeedback('Admin panel ready.');

  const clockEl = document.getElementById('live-clock');
  const tick = () => clockEl.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
  tick(); setInterval(tick, 1000);
}

initialize().catch((err) => setFeedback(err.message, 'error'));