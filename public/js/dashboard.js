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

// ---- SWAP REQUESTS ----

function fmtSwapShift(s) {
  return `${s.shift_type} · ${fmtDate(s.start_at)} ${fmtTime(s.start_at)}`;
}

function setSwapFeedback(message, type = 'info') {
  const el = document.getElementById('swap-feedback');
  if (!el) return;
  el.textContent = message;
  el.className = `admin-feedback${type === 'error' ? ' error' : ''}`;
}

async function loadSwapForm() {
  const shiftSel = document.getElementById('swap-shift-select');
  const targetSel = document.getElementById('swap-target-select');
  if (!shiftSel || !targetSel) return;

  try {
    const [shifts, colleagues] = await Promise.all([
      fetch('/api/dashboard/my-shifts').then((r) => r.json()),
      fetch('/api/dashboard/colleagues').then((r) => r.json())
    ]);

    shiftSel.innerHTML = shifts.length
      ? shifts.map((s) => `<option value="${s.id}">${s.type} · ${fmtDate(s.start)} ${fmtTime(s.start)}</option>`).join('')
      : '<option value="">No upcoming shifts to offer</option>';

    targetSel.innerHTML = colleagues.length
      ? colleagues.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="">No other operators</option>';
  } catch {
    shiftSel.innerHTML = '<option value="">Failed to load</option>';
    targetSel.innerHTML = '<option value="">Failed to load</option>';
  }
}

async function loadSwapLists() {
  const incomingEl = document.getElementById('swap-incoming');
  const outgoingEl = document.getElementById('swap-outgoing');
  if (!incomingEl || !outgoingEl) return;

  try {
    const res = await fetch('/api/swaps');
    const swaps = await res.json();
    const myId = window.SOC_DATA?.userId;

    const incoming = swaps.filter((s) => s.target_id === myId && s.status === 'pending');

    incomingEl.innerHTML = incoming.length
      ? incoming.map((s) => `
        <div class="swap-item">
          <div class="swap-item-meta">${s.requester_name} wants to give you: <strong>${fmtSwapShift(s)}</strong></div>
          <div class="swap-item-actions">
            <button class="admin-btn primary" data-swap-accept="${s.id}" type="button">Accept</button>
            <button class="admin-btn danger" data-swap-reject="${s.id}" type="button">Reject</button>
          </div>
        </div>
      `).join('')
      : '<span style="opacity:.4">Nothing waiting on you</span>';

    const myOutgoing = swaps.filter((s) => s.requester_id === myId);
    outgoingEl.innerHTML = myOutgoing.length
      ? myOutgoing.map((s) => `
        <div class="swap-item">
          <div class="swap-item-meta">To ${s.target_name}: <strong>${fmtSwapShift(s)}</strong></div>
          <div class="swap-item-actions">
            <span class="swap-item-status ${s.status}">${s.status.toUpperCase()}</span>
            ${s.status === 'pending' ? `<button class="admin-btn danger" data-swap-cancel="${s.id}" type="button">Cancel</button>` : ''}
          </div>
        </div>
      `).join('')
      : '<span style="opacity:.4">No requests sent</span>';

    incomingEl.querySelectorAll('[data-swap-accept]').forEach((btn) => {
      btn.addEventListener('click', () => resolveSwap(btn.dataset.swapAccept, 'accept'));
    });
    incomingEl.querySelectorAll('[data-swap-reject]').forEach((btn) => {
      btn.addEventListener('click', () => resolveSwap(btn.dataset.swapReject, 'reject'));
    });
    outgoingEl.querySelectorAll('[data-swap-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => resolveSwap(btn.dataset.swapCancel, 'cancel'));
    });
  } catch {
    incomingEl.innerHTML = '<span style="color:var(--red)">Failed to load</span>';
    outgoingEl.innerHTML = '<span style="color:var(--red)">Failed to load</span>';
  }
}

async function resolveSwap(id, action) {
  try {
    const res = await fetch(`/api/swaps/${id}/${action}`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Action failed.');
    setSwapFeedback(`Swap ${action}ed.`);
    await Promise.all([loadSwapLists(), loadSwapForm()]);
  } catch (err) {
    setSwapFeedback(err.message, 'error');
  }
}

function bindSwapForm() {
  const btn = document.getElementById('swap-request-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const shiftId = document.getElementById('swap-shift-select').value;
    const targetId = document.getElementById('swap-target-select').value;
    if (!shiftId || !targetId) { setSwapFeedback('Pick a shift and a colleague first.', 'error'); return; }
    setSwapFeedback('Requesting…');
    try {
      const res = await fetch('/api/swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: Number(shiftId), targetId: Number(targetId) })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Request failed.');
      setSwapFeedback('Swap requested.');
      await Promise.all([loadSwapLists(), loadSwapForm()]);
    } catch (err) {
      setSwapFeedback(err.message, 'error');
    }
  });
}

// ---- HANDOVER REPORT ----

let reportDueShiftId = null;

async function checkReportDue() {
  const banner = document.getElementById('report-due-banner');
  if (!banner) return;
  try {
    const res = await fetch('/api/reports/due');
    const data = await res.json();
    if (data.due) {
      reportDueShiftId = data.shift.id;
      banner.hidden = false;
      banner.innerHTML = `<span class="blink-dot" style="background:var(--orange);box-shadow:0 0 8px var(--orange)"></span><span>YOUR ${data.shift.type} SHIFT NEEDS A HANDOVER REPORT</span><button class="admin-btn primary" id="report-open-btn" type="button">▶ FILE REPORT</button>`;
      document.getElementById('report-open-btn').addEventListener('click', openReportModal);
    } else {
      reportDueShiftId = null;
      banner.hidden = true;
      banner.innerHTML = '';
    }
  } catch { /* leave banner as-is on transient failure */ }
}

async function loadIncomingReport() {
  const card = document.getElementById('incoming-report-card');
  if (!card) return;
  try {
    const res = await fetch('/api/reports/incoming');
    const data = await res.json();
    if (!data.report) { card.hidden = true; card.innerHTML = ''; return; }
    const r = data.report;
    card.hidden = false;
    card.innerHTML = `
      <div class="title">◈ HANDOFF FROM ${r.author_name} (${r.shift_type} shift, ${fmtDate(r.start_at)})</div>
      <div class="field-label">What was done:</div>${escapeHtml(r.what_done)}
      ${r.unfinished ? `<div class="field-label">Unfinished / needs continuity:</div>${escapeHtml(r.unfinished)}` : ''}
      ${r.open_items.length ? `<div class="field-label">Open items:</div><ol>${r.open_items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>` : ''}
    `;
  } catch { /* leave as-is */ }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function openReportModal() {
  document.getElementById('report-modal-backdrop').hidden = false;
}
function closeReportModal() {
  document.getElementById('report-modal-backdrop').hidden = true;
  document.getElementById('report-feedback').textContent = '';
}

function bindReportModal() {
  const backdrop = document.getElementById('report-modal-backdrop');
  if (!backdrop) return;
  document.getElementById('report-cancel-btn').addEventListener('click', closeReportModal);
  document.getElementById('report-submit-btn').addEventListener('click', async () => {
    if (!reportDueShiftId) { closeReportModal(); return; }
    const whatDone = document.getElementById('report-what-done').value.trim();
    const unfinished = document.getElementById('report-unfinished').value.trim();
    const openItems = document.getElementById('report-open-items').value.split('\n').map((s) => s.trim()).filter(Boolean);
    const feedback = document.getElementById('report-feedback');
    if (!whatDone) { feedback.textContent = '"What was done" is required.'; feedback.className = 'admin-feedback error'; return; }
    feedback.textContent = 'Submitting…'; feedback.className = 'admin-feedback';
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: reportDueShiftId, whatDone, unfinished, openItems })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to submit.');
      closeReportModal();
      document.getElementById('report-what-done').value = '';
      document.getElementById('report-unfinished').value = '';
      document.getElementById('report-open-items').value = '';
      checkReportDue();
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'admin-feedback error';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const init = window.SOC_DATA || {};
  rebuildCards(Array.isArray(init.people) ? init.people : []);
  updateClock();
  setInterval(updateClock, 1000);
  initTheme();
  fetchAndUpdate();
  setInterval(fetchAndUpdate, 1000);

  bindSwapForm();
  loadSwapForm();
  loadSwapLists();
  setInterval(loadSwapLists, 15000);

  bindReportModal();
  checkReportDue();
  loadIncomingReport();
  setInterval(checkReportDue, 30000);
  setInterval(loadIncomingReport, 60000);
});