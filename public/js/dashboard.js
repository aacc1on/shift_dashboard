'use strict';

const COLORS = { D: '#00ff88', E: '#ffcc00', N: '#ff6b35', X: '#4a9eff' };
const LABELS = { D: '☀ DAY SHIFT', E: '🌆 EVENING SHIFT', N: '🌙 NIGHT SHIFT', X: '⬜ DAY OFF' };
const SHIFT_OPTIONS = ['D', 'E', 'N', 'X'];

let cardEls = {};
let people = [];
let adminDates = [];

function fmtMs(ms) { if (ms <= 0) return '00:00:00'; const s = Math.floor(ms / 1000); return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function fmtTime(isoStr) { return isoStr ? new Date(isoStr).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Yerevan' }) : '--:--'; }
function fmtDate(isoStr) { return isoStr ? new Date(isoStr).toLocaleDateString('en-GB', { month:'short', day:'numeric', timeZone:'Asia/Yerevan' }) : ''; }

function buildCard(person) {
  const tpl = document.getElementById('card-tpl');
  const el = tpl.content.cloneNode(true).querySelector('.person-card');
  el.dataset.person = person;
  el.querySelector('.card-name').textContent = person.toUpperCase();
  cardEls[person] = el;
  document.getElementById('cards-grid').appendChild(el);
}

function rebuildCards(nextPeople) {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';
  cardEls = {};
  people = nextPeople;
  people.forEach(buildCard);
}

function updateCard(person, info) {
  const el = cardEls[person]; if (!el) return;
  const { todayCode, current, next } = info;
  const color = COLORS[current ? current.code : todayCode] || COLORS.X;
  const badge = el.querySelector('.card-badge'); const label = el.querySelector('.card-shift-label');
  const fill = el.querySelector('.card-progress-fill'); const glow = el.querySelector('.card-progress-glow');
  const pct = el.querySelector('.card-pct'); const elapsed = el.querySelector('.card-elapsed');
  const remaining = el.querySelector('.card-remaining'); const nextEl = el.querySelector('.card-next');
  const timerEl = el.querySelector('.big-timer') || (() => { const t = document.createElement('div'); t.className='big-timer'; el.querySelector('.card-shift-label').after(t); return t; })();

  if (current) {
    el.classList.remove('off-duty'); el.classList.add('active-shift');
    badge.textContent = 'ON DUTY'; label.textContent = LABELS[current.code] || current.code;
    timerEl.textContent = fmtMs(current.remaining); fill.style.width = `${current.progress}%`; pct.textContent = `${current.progress}%`;
    elapsed.textContent = `▶ ${fmtMs(current.elapsed)} elapsed`; remaining.textContent = `◀ ${fmtMs(current.remaining)} left`;
  } else {
    el.classList.add('off-duty'); el.classList.remove('active-shift');
    const code = todayCode || 'X'; badge.textContent = code === 'X' ? 'OFF TODAY' : code;
    label.textContent = LABELS[code] || code; timerEl.textContent = '--:--:--'; fill.style.width = '0%'; pct.textContent = '0%';
    elapsed.textContent = ''; remaining.textContent = '';
  }

  [badge, label, timerEl, pct, remaining].forEach(x => { if (x) x.style.color = color; });
  badge.style.borderColor = color + '80'; fill.style.background = color; glow.style.background = color;
  nextEl.innerHTML = next ? `NEXT: <span style="color:${COLORS[next.code] || '#fff'}">${LABELS[next.code] || next.code}</span> · ${fmtDate(next.start)} ${fmtTime(next.start)} · starts in <span>${fmtMs(next.startsIn)}</span>` : 'NO UPCOMING SHIFTS IN DATA';
}

function updateClock() { document.getElementById('live-clock').textContent = new Date().toLocaleTimeString('en-GB', { timeZone:'Asia/Yerevan', hour12:false }); }
function sortPeople(data) { return Object.keys(data).sort((a,b)=>((data[b].current?1:0)-(data[a].current?1:0))||((data[a].next?.startsIn??Infinity)-(data[b].next?.startsIn??Infinity))); }

async function fetchAndUpdate() {
  try {
    const res = await fetch('/api/status'); const json = await res.json(); const { data } = json;
    const sorted = sortPeople(data); const grid = document.getElementById('cards-grid'); sorted.forEach(p => cardEls[p] && grid.appendChild(cardEls[p]));
    Object.entries(data).forEach(([person,info]) => updateCard(person, info));
    const onDuty = sorted.filter(p => data[p].current).length;
    document.getElementById('status-txt').textContent = `FEED ACTIVE — ${onDuty}/${sorted.length} OPERATORS ON DUTY — LAST SYNC: ${new Date().toLocaleTimeString('en-GB', {timeZone:'Asia/Yerevan'})}`;
  } catch (_) { document.getElementById('status-txt').textContent = 'CONNECTION ERROR — RETRYING...'; }
}

function renderAdminTable() {
  const table = document.getElementById('admin-table');
  const head = `<thead><tr><th>OPERATOR</th>${adminDates.map(d=>`<th>${d.slice(5)}</th>`).join('')}</tr></thead>`;
  const rows = people.map((p)=>`<tr><td class="person-cell">${p}</td>${adminDates.map((d)=>`<td><select data-person="${p}" data-date="${d}">${SHIFT_OPTIONS.map(code=>`<option value="${code}">${code}</option>`).join('')}</select></td>`).join('')}</tr>`).join('');
  table.innerHTML = `${head}<tbody>${rows}</tbody>`;
}

async function loadAdmin() {
  const res = await fetch('/api/admin');
  const json = await res.json();
  adminDates = json.dates;
  rebuildCards(json.people);
  renderAdminTable();
  adminDates.forEach((d)=>people.forEach((p)=>{
    const sel = document.querySelector(`select[data-person="${p}"][data-date="${d}"]`);
    if (sel) sel.value = json.schedule[d]?.[p] || 'X';
  }));
}

async function saveAdmin() {
  const schedule = {};
  adminDates.forEach((d)=>{ schedule[d] = {}; people.forEach((p)=>{ const sel = document.querySelector(`select[data-person="${p}"][data-date="${d}"]`); schedule[d][p] = sel ? sel.value : 'X'; }); });
  const res = await fetch('/api/admin', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ people, schedule })});
  if (!res.ok) alert('Save failed'); else alert('Saved');
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAdmin();
  document.getElementById('add-person-btn').addEventListener('click', () => {
    const input = document.getElementById('new-person');
    const name = input.value.trim();
    if (!name || people.includes(name)) return;
    people.push(name); input.value = ''; renderAdminTable();
  });
  document.getElementById('save-admin-btn').addEventListener('click', saveAdmin);
  updateClock(); setInterval(updateClock, 1000); fetchAndUpdate(); setInterval(fetchAndUpdate, 1000);
});
