'use strict';

const COLORS = {
  D: '#00ff88',
  E: '#ffcc00',
  N: '#ff6b35',
  X: '#4a9eff',
  Ardzakurd: '#a855f7',
};
const LABELS = {
  D: '☀ DAY SHIFT',
  E: '🌆 EVENING SHIFT',
  N: '🌙 NIGHT SHIFT',
  X: '⬜ DAY OFF',
  Ardzakurd: '⚡ ARDZAKURD',
};

let cardEls = {};

function fmtMs(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function fmtTime(isoStr) {
  if (!isoStr) return '--:--';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yerevan' });
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'Asia/Yerevan' });
}

function buildCard(person) {
  const tpl = document.getElementById('card-tpl');
  const el = tpl.content.cloneNode(true).querySelector('.person-card');
  el.dataset.person = person;
  el.querySelector('.card-name').textContent = person.toUpperCase();
  cardEls[person] = el;
  document.getElementById('cards-grid').appendChild(el);
}

function updateCard(person, info) {
  const el = cardEls[person];
  if (!el) return;

  const { todayCode, current, next } = info;
  const color = COLORS[current ? current.code : todayCode] || COLORS.X;

  el.style.setProperty('--card-color', color);
  el.querySelector('.card-name').style.color = '#c8e8f0';

  const badge = el.querySelector('.card-badge');
  const label = el.querySelector('.card-shift-label');
  const fill = el.querySelector('.card-progress-fill');
  const glow = el.querySelector('.card-progress-glow');
  const pct = el.querySelector('.card-pct');
  const elapsed = el.querySelector('.card-elapsed');
  const remaining = el.querySelector('.card-remaining');
  const nextEl = el.querySelector('.card-next');
  const timerEl = el.querySelector('.big-timer') || (() => {
    const t = document.createElement('div');
    t.className = 'big-timer';
    el.querySelector('.card-shift-label').after(t);
    return t;
  })();

  if (current) {
    el.classList.remove('off-duty');
    el.classList.add('active-shift');

    badge.textContent = 'ON DUTY';
    badge.style.color = color;
    badge.style.borderColor = color + '80';
    badge.style.background = color + '15';

    label.textContent = LABELS[current.code] || current.code;
    label.style.color = color;

    timerEl.textContent = fmtMs(current.remaining);
    timerEl.style.color = color;

    fill.style.width = current.progress + '%';
    fill.style.background = color;
    glow.style.background = color;
    pct.textContent = current.progress + '%';
    pct.style.color = color;

    elapsed.textContent = `▶ ${fmtMs(current.elapsed)} elapsed`;
    remaining.textContent = `◀ ${fmtMs(current.remaining)} left`;
    elapsed.style.color = color + 'aa';
    remaining.style.color = color;

  } else {
    el.classList.add('off-duty');
    el.classList.remove('active-shift');

    const code = todayCode || 'X';
    badge.textContent = code === 'X' ? 'OFF TODAY' : code;
    badge.style.color = color;
    badge.style.borderColor = color + '40';
    badge.style.background = 'transparent';

    label.textContent = LABELS[code] || code;
    label.style.color = color;

    timerEl.textContent = '--:--:--';
    timerEl.style.color = 'var(--text-dim)';

    fill.style.width = '0%';
    pct.textContent = '0%';
    elapsed.textContent = '';
    remaining.textContent = '';
  }

  if (next) {
    const nc = COLORS[next.code] || '#fff';
    nextEl.innerHTML = `NEXT: <span style="color:${nc}">${LABELS[next.code] || next.code}</span> &nbsp;·&nbsp; ${fmtDate(next.start)} <span>${fmtTime(next.start)}</span> &nbsp;·&nbsp; starts in <span>${fmtMs(next.startsIn)}</span>`;
  } else {
    nextEl.textContent = 'NO UPCOMING SHIFTS IN DATA';
  }
}

// Live clock
function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
  document.getElementById('live-clock').textContent = t;
}

// Sort: on-duty first, then by next shift
function sortPeople(data) {
  const people = Object.keys(data);
  return people.sort((a, b) => {
    const ca = data[a].current ? 1 : 0;
    const cb = data[b].current ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const na = data[a].next?.startsIn ?? Infinity;
    const nb = data[b].next?.startsIn ?? Infinity;
    return na - nb;
  });
}

let lastOrder = [];

async function fetchAndUpdate() {
  try {
    const res = await fetch('/api/status');
    const json = await res.json();
    const { data } = json;

    const sorted = sortPeople(data);

    // Reorder cards if needed
    const grid = document.getElementById('cards-grid');
    const orderKey = sorted.join(',');
    if (orderKey !== lastOrder.join(',')) {
      sorted.forEach(p => grid.appendChild(cardEls[p]));
      lastOrder = sorted;
    }

    // Update each card
    for (const [person, info] of Object.entries(data)) {
      updateCard(person, info);
    }

    // Status bar
    const onDuty = sorted.filter(p => data[p].current).length;
    document.getElementById('status-txt').textContent =
      `FEED ACTIVE — ${onDuty}/${sorted.length} OPERATORS ON DUTY — LAST SYNC: ${new Date().toLocaleTimeString('en-GB', {timeZone:'Asia/Yerevan'})}`;

  } catch(e) {
    document.getElementById('status-txt').textContent = 'CONNECTION ERROR — RETRYING...';
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  const people = ['Areg', 'Minas', 'Rubik', 'Levon', 'Arshak', 'Hrach'];
  people.forEach(buildCard);

  updateClock();
  setInterval(updateClock, 1000);

  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);
});
