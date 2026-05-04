'use strict';

const SHIFT_OPTIONS = ['D', 'E', 'N', 'X'];
let people = [];
let dates = [];
let schedule = {};

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildDates(start, count) {
  const arr = [];
  const s = new Date(`${start}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const d = new Date(s);
    d.setDate(s.getDate() + i);
    arr.push(fmtDate(d));
  }
  return arr;
}

function render() {
  const t = document.getElementById('admin-table');
  const head = `<thead><tr><th>OPERATOR</th>${dates.map((d) => `<th>${d}</th>`).join('')}</tr></thead>`;
  const body = people.map((p) => `<tr><td><input data-name="${p}" value="${p}"/></td>${dates.map((d) => `<td><select data-person="${p}" data-date="${d}">${SHIFT_OPTIONS.map((c) => `<option value="${c}" ${((schedule[d]?.[p] || 'X') === c) ? 'selected' : ''}>${c}</option>`).join('')}</select></td>`).join('')}</tr>`).join('');
  t.innerHTML = `${head}<tbody>${body}</tbody>`;
}

async function load() {
  const r = await fetch('/api/admin');
  const j = await r.json();
  people = j.people;
  dates = j.dates;
  schedule = j.schedule;
  document.getElementById('start-date').value = dates[0] || '';
  render();
}

function syncNames() {
  const inputs = [...document.querySelectorAll('input[data-name]')];
  const names = [...new Set(inputs.map((i) => i.value.trim()).filter(Boolean))];
  const next = {};
  dates.forEach((d) => {
    next[d] = {};
    names.forEach((n) => { next[d][n] = 'X'; });
  });

  inputs.forEach((inp, idx) => {
    const oldName = people[idx];
    const newName = inp.value.trim();
    if (!newName) return;
    dates.forEach((d) => {
      next[d][newName] = schedule[d]?.[oldName] || 'X';
    });
  });

  people = names;
  schedule = next;
}

function syncSchedule() {
  syncNames();
  dates.forEach((d) => {
    if (!schedule[d]) schedule[d] = {};
    people.forEach((p) => {
      const el = document.querySelector(`select[data-person="${p}"][data-date="${d}"]`);
      schedule[d][p] = el ? el.value : 'X';
    });
  });
}

async function save() {
  syncSchedule();
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ people, schedule, dates })
  });
  alert(res.ok ? 'Saved' : 'Save failed');
}

document.addEventListener('DOMContentLoaded', async () => {
  await load();

  document.getElementById('add-person-btn').onclick = () => {
    const n = document.getElementById('new-person').value.trim();
    if (!n || people.includes(n)) return;
    people.push(n);
    dates.forEach((d) => {
      if (!schedule[d]) schedule[d] = {};
      schedule[d][n] = 'X';
    });
    document.getElementById('new-person').value = '';
    render();
  };

  document.getElementById('apply-dates-btn').onclick = () => {
    syncSchedule();
    const start = document.getElementById('start-date').value;
    const count = Math.max(1, Math.min(31, Number(document.getElementById('days-count').value) || 7));
    if (!start) return;

    const old = schedule;
    dates = buildDates(start, count);
    const next = {};
    dates.forEach((d) => {
      next[d] = {};
      people.forEach((p) => { next[d][p] = old[d]?.[p] || 'X'; });
    });
    schedule = next;
    render();
  };

  document.getElementById('save-admin-btn').onclick = save;
});
