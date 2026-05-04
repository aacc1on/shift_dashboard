'use strict';

const COLORS = {
  D: '#00ff88',
  E: '#ffcc00',
  N: '#ff6b35',
  X: '#4a9eff'
};

const LABELS = {
  D: '☀ DAY SHIFT',
  E: '🌆 EVENING SHIFT',
  N: '🌙 NIGHT SHIFT',
  X: '⬜ DAY OFF'
};

let cardElements = {};

function formatDuration(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '--:--';
  return new Date(isoStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Yerevan'
  });
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Yerevan'
  });
}

function buildCard(person) {
  const template = document.getElementById('card-tpl');
  const card = template.content.cloneNode(true).querySelector('.person-card');
  card.querySelector('.card-name').textContent = person.toUpperCase();
  cardElements[person] = card;
  document.getElementById('cards-grid').appendChild(card);
}

function updateCard(person, info) {
  const card = cardElements[person];
  if (!card) return;

  const { todayCode, current, next } = info;
  const color = COLORS[current ? current.code : todayCode] || COLORS.X;

  const badge = card.querySelector('.card-badge');
  const label = card.querySelector('.card-shift-label');
  const fill = card.querySelector('.card-progress-fill');
  const glow = card.querySelector('.card-progress-glow');
  const pct = card.querySelector('.card-pct');
  const elapsed = card.querySelector('.card-elapsed');
  const remaining = card.querySelector('.card-remaining');
  const nextElement = card.querySelector('.card-next');

  const timer = card.querySelector('.big-timer') || (() => {
    const timerDiv = document.createElement('div');
    timerDiv.className = 'big-timer';
    card.querySelector('.card-shift-label').after(timerDiv);
    return timerDiv;
  })();

  if (current) {
    badge.textContent = 'ON DUTY';
    label.textContent = LABELS[current.code] || current.code;
    timer.textContent = formatDuration(current.remaining);
    fill.style.width = `${current.progress}%`;
    pct.textContent = `${current.progress}%`;
    elapsed.textContent = `▶ ${formatDuration(current.elapsed)} elapsed`;
    remaining.textContent = `◀ ${formatDuration(current.remaining)} left`;
  } else {
    const code = todayCode || 'X';
    badge.textContent = code === 'X' ? 'OFF TODAY' : code;
    label.textContent = LABELS[code] || code;
    timer.textContent = '--:--:--';
    fill.style.width = '0%';
    pct.textContent = '0%';
    elapsed.textContent = '';
    remaining.textContent = '';
  }

  [badge, label, timer, pct, remaining].forEach((el) => {
    if (el) el.style.color = color;
  });

  badge.style.borderColor = `${color}80`;
  fill.style.background = color;
  glow.style.background = color;

  if (next) {
    const nextColor = COLORS[next.code] || '#fff';
    nextElement.innerHTML = `NEXT: <span style="color:${nextColor}">${LABELS[next.code] || next.code}</span> · ${formatDate(next.start)} ${formatTime(next.start)} · starts in <span>${formatDuration(next.startsIn)}</span>`;
  } else {
    nextElement.textContent = 'NO UPCOMING SHIFTS IN DATA';
  }
}

function updateClock() {
  document.getElementById('live-clock').textContent = new Date().toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Yerevan',
    hour12: false
  });
}

function sortPeopleByActivity(data) {
  return Object.keys(data).sort((a, b) => {
    const activeA = data[a].current ? 1 : 0;
    const activeB = data[b].current ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    const nextA = data[a].next?.startsIn ?? Infinity;
    const nextB = data[b].next?.startsIn ?? Infinity;
    return nextA - nextB;
  });
}

async function initCards() {
  const res = await fetch('/api/admin');
  const json = await res.json();
  json.people.forEach(buildCard);
}

async function fetchAndUpdate() {
  try {
    const res = await fetch('/api/status');
    const json = await res.json();
    const data = json.data;
    const sorted = sortPeopleByActivity(data);

    const grid = document.getElementById('cards-grid');
    sorted.forEach((person) => {
      if (cardElements[person]) grid.appendChild(cardElements[person]);
    });

    Object.entries(data).forEach(([person, info]) => updateCard(person, info));

    const onDuty = sorted.filter((person) => data[person].current).length;
    document.getElementById('status-txt').textContent =
      `FEED ACTIVE — ${onDuty}/${sorted.length} OPERATORS ON DUTY — LAST SYNC: ${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan' })}`;
  } catch (_) {
    document.getElementById('status-txt').textContent = 'CONNECTION ERROR — RETRYING...';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initCards();
  updateClock();
  setInterval(updateClock, 1000);

  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);
});
