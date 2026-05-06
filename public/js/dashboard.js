'use strict';

const COLORS = { D: '#00ff88', E: '#ffcc00', N: '#ff6b35', X: '#4a9eff' };
const LABELS = { D: '☀ DAY SHIFT', E: '🌆 EVENING SHIFT', N: '🌙 NIGHT SHIFT', X: '⬜ DAY OFF' };

let cardEls = {};
let people = [];

function fmtMs(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtTime(isoStr) {
  return isoStr
    ? new Date(isoStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yerevan' })
    : '--:--';
}

function fmtDate(isoStr) {
  return isoStr
    ? new Date(isoStr).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'Asia/Yerevan' })
    : '';
}

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
  const el = cardEls[person];
  if (!el) return;
  const { todayCode, current, next } = info;
  const color = COLORS[current ? current.code : todayCode] || COLORS.X;
  const badge = el.querySelector('.card-badge');
  const label = el.querySelector('.card-shift-label');
  const fill = el.querySelector('.card-progress-fill');
  const glow = el.querySelector('.card-progress-glow');
  const pct = el.querySelector('.card-pct');
  const elapsed = el.querySelector('.card-elapsed');
  const remaining = el.querySelector('.card-remaining');
  const nextEl = el.querySelector('.card-next');
  const timerEl = el.querySelector('.big-timer');

  el.style.setProperty('--card-color', color);

  if (current) {
    el.classList.remove('off-duty');
    el.classList.add('active-shift');
    badge.textContent = 'ON DUTY';
    label.textContent = LABELS[current.code] || current.code;
    timerEl.textContent = fmtMs(current.remaining);
    fill.style.width = `${current.progress}%`;
    pct.textContent = `${current.progress}%`;
    elapsed.textContent = `▶ ${fmtMs(current.elapsed)} elapsed`;
    remaining.textContent = `◀ ${fmtMs(current.remaining)} left`;
  } else {
    el.classList.add('off-duty');
    el.classList.remove('active-shift');
    const code = todayCode || 'X';
    badge.textContent = code === 'X' ? 'OFF TODAY' : 'STANDBY';
    label.textContent = LABELS[code] || code;
    timerEl.textContent = '--:--:--';
    fill.style.width = '0%';
    pct.textContent = '0%';
    elapsed.textContent = '';
    remaining.textContent = '';
  }

  [badge, label, timerEl, pct, remaining].forEach((x) => {
    if (x) x.style.color = color;
  });
  badge.style.borderColor = `${color}60`;
  fill.style.background = color;
  glow.style.background = color;
  nextEl.innerHTML = next
    ? `NEXT: <span style="color:${COLORS[next.code] || '#fff'}">${LABELS[next.code] || next.code}</span> · ${fmtDate(next.start)} ${fmtTime(next.start)} · starts in <span>${fmtMs(next.startsIn)}</span>`
    : '<span style="opacity:0.4">NO UPCOMING SHIFTS IN DATA</span>';
}

function updateStats(data) {
  const counts = { D: 0, E: 0, N: 0, X: 0, total: 0 };
  let onDuty = 0;
  for (const info of Object.values(data)) {
    if (info.current) {
      counts[info.current.code] = (counts[info.current.code] || 0) + 1;
      onDuty++;
    }
    counts.total++;
  }
  document.getElementById('stat-on').textContent = `${onDuty} / ${counts.total}`;
  document.getElementById('stat-day').textContent = counts.D || '0';
  document.getElementById('stat-eve').textContent = counts.E || '0';
  document.getElementById('stat-night').textContent = counts.N || '0';
  const dutyEl = document.getElementById('duty-count');
  if (dutyEl) dutyEl.textContent = `${onDuty} / ${counts.total}`;
}

function updateClock() {
  document.getElementById('live-clock').textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
}


function renderWarnings(warnings){
 const el=document.getElementById('warnings-banner');
 if(!el) return;
 if(!warnings||!warnings.length){el.hidden=true;el.textContent='';return;}
 el.hidden=false;el.textContent=warnings.map(w=>w.message).join(' | ');
}

function initTheme(){
 const btn=document.getElementById('theme-toggle');
 const saved=localStorage.getItem('soc_theme');
 if(saved==='light') document.body.classList.add('light');
 if(btn){btn.addEventListener('click',()=>{document.body.classList.toggle('light');localStorage.setItem('soc_theme',document.body.classList.contains('light')?'light':'dark');});}
}

function sortPeople(data) {
  return Object.keys(data).sort((a, b) =>
    (data[b].current ? 1 : 0) - (data[a].current ? 1 : 0) ||
    ((data[a].next?.startsIn ?? Infinity) - (data[b].next?.startsIn ?? Infinity))
  );
}

async function fetchAndUpdate() {
  try {
    const res = await fetch('/api/dashboard/status');
    const json = await res.json();
    const { data, warnings } = json;
    const sorted = sortPeople(data);
    const grid = document.getElementById('cards-grid');
    sorted.forEach((p) => cardEls[p] && grid.appendChild(cardEls[p]));
    Object.entries(data).forEach(([person, info]) => updateCard(person, info));
    updateStats(data);
    renderWarnings(warnings);
    const onDuty = sorted.filter((p) => data[p].current).length;
    document.getElementById('status-txt').textContent =
      `FEED ACTIVE — ${onDuty}/${sorted.length} OPERATORS ON DUTY — LAST SYNC: ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan' })}`;
  } catch {
    document.getElementById('status-txt').textContent = 'CONNECTION ERROR — RETRYING...';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const init = window.SOC_DATA || {};
  rebuildCards(Array.isArray(init.people) ? init.people : []);
  updateClock();
  setInterval(updateClock, 1000);
  initTheme();
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);
});