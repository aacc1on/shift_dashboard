'use strict';

const VALID_CODES = ['D', 'E', 'N', 'X'];
const COLORS = { D: '#00ff88', E: '#ffcc00', N: '#ff6b35', X: '#4a9eff' };
let people = []; // [{ id: number|null, name: string }] — id null means "not yet created"
let dates = [];
let schedule = {}; // { [date]: { [personName]: code } } — keyed by CURRENT name, kept in sync on rename
let weekOffset = 0;
let canEdit = true;

function getArmeniaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Yerevan' }));
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getWeekRange(offset) {
  const now = getArmeniaNow();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + (offset * 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { monday, sunday };
}

function weekDatesIso(offset) {
  const { monday } = getWeekRange(offset);
  const out = [];
  for (let i = 0; i < 7; i++) {
    out.push(isoLocal(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  }
  return out;
}

function visibleDates() {
  const { monday, sunday } = getWeekRange(weekOffset);
  return dates
    .filter((d) => {
      const parsed = new Date(`${d}T00:00:00`);
      return parsed >= monday && parsed <= sunday;
    })
    .sort();
}

function updateWeekLabel() {
  const { monday, sunday } = getWeekRange(weekOffset);
  document.getElementById('week-label').textContent = `WEEK ${isoLocal(monday)} → ${isoLocal(sunday)}`;
}

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
  const today = isoLocal(getArmeniaNow());
  const weekDates = visibleDates();

  document.getElementById('admin-table-empty')?.remove();

  if (!weekDates.length) {
    table.innerHTML = '';
    const empty = document.createElement('div');
    empty.id = 'admin-table-empty';
    empty.className = 'empty-state';
    empty.textContent = 'NO DATES IN THIS WEEK. CLICK + FILL WEEK TO CREATE THEM.';
    table.parentElement.appendChild(empty);
    return;
  }

  const dis = canEdit ? '' : 'disabled';
  const headerRow = [
    '<tr>',
    '<th style="text-align:left;min-width:130px">OPERATOR</th>',
    ...weekDates.map((date) => `<th class="${date === today ? 'today-col' : ''}"><input class="date-input-cell" type="date" value="${date}" data-date="${date}" ${dis} /><button class="remove-btn" data-remove-date="${date}" title="Remove date" ${dis}>×</button></th>`),
    '</tr>'
  ].join('');

  const bodyRows = people.map((p, rowIndex) => {
    const cells = weekDates.map((date) => {
      const current = schedule[date]?.[p.name] || 'X';
      const opts = VALID_CODES.map((code) =>
        `<option value="${code}" ${code === current ? 'selected' : ''}>${code}</option>`
      ).join('');
      return `<td class="${date === today ? 'today-col' : ''}"><select data-person="${p.name}" data-date="${date}" ${dis}>${opts}</select></td>`;
    }).join('');

    return `<tr>
      <td>
        <input class="person-name-input" value="${p.name}" data-row-index="${rowIndex}" ${dis} />
        <button class="remove-btn" data-remove-person="${p.name}" title="Deactivate operator" ${dis}>×</button>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  table.innerHTML = `<thead>${headerRow}</thead><tbody>${bodyRows}</tbody>`;

  // Color all selects and keep the in-memory schedule live so edits survive week navigation
  table.querySelectorAll('select').forEach((s) => {
    colorSelect(s);
    s.addEventListener('change', () => {
      colorSelect(s);
      const { person, date } = s.dataset;
      if (!schedule[date]) schedule[date] = {};
      schedule[date][person] = s.value;
    });
  });
}

function refreshTable() {
  updateWeekLabel();
  buildAdminTable();
  attachControls();
  updateSidebarStats();
}

function getFormData() {
  const names = people.map((p) => p.name);
  if (new Set(names).size !== names.length) throw new Error('Operator names must be unique.');
  if (new Set(dates).size !== dates.length) throw new Error('Dates must be unique.');
  const bad = dates.find((d) => !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d));
  if (bad) throw new Error('Invalid date format: ' + bad);

  const payloadSchedule = {};
  dates.forEach((date) => {
    payloadSchedule[date] = {};
    people.forEach((p) => {
      payloadSchedule[date][p.name] = schedule[date]?.[p.name] || 'X';
    });
  });

  // people carry a stable id (or null for not-yet-created) so the server can
  // tell "this operator was renamed" apart from "removed one, added another" —
  // matters so a rename doesn't orphan shift history outside the loaded window.
  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    dates: [...dates],
    schedule: payloadSchedule
  };
}

async function runAutoGenerate(targetDates) {
  if (!targetDates.length) { setFeedback('No dates to generate.', 'error'); return; }
  if (!people.length) { setFeedback('Add operators first.', 'error'); return; }
  setFeedback('Generating schedule…');
  try {
    const res = await fetch('/api/admin/autogenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ people: people.map((p) => p.name), dates: targetDates })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Auto-generate failed.');

    targetDates.forEach((date) => {
      if (!dates.includes(date)) dates.push(date);
      schedule[date] = result.schedule[date] || {};
    });
    dates.sort();
    refreshTable();

    const parts = [`Generated ${targetDates.length} date(s) via ${result.source}.`];
    if (result.note) parts.push(result.note);
    if (result.repairs && result.repairs.length) parts.push(`${result.repairs.length} slot(s) adjusted to keep rest rules.`);
    parts.push('Review and click SAVE CHANGES to apply.');
    setFeedback(parts.join(' '));
  } catch (err) {
    setFeedback(err.message, 'error');
  }
}

function attachControls() {
  document.querySelectorAll('[data-remove-person]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.removePerson;
      people = people.filter((p) => p.name !== name);
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

  document.querySelectorAll('.person-name-input').forEach((input) => {
    input.addEventListener('change', () => {
      const rowIndex = Number(input.dataset.rowIndex);
      const person = people[rowIndex];
      if (!person) return;
      const old = person.name;
      const val = input.value.trim();
      if (!val || val === old) return;
      if (people.some((p) => p.name === val)) { setFeedback('Operator already exists.', 'error'); input.value = old; return; }

      person.name = val; // id stays the same — this is a rename, not a new operator
      for (const d of dates) {
        if (schedule[d] && Object.prototype.hasOwnProperty.call(schedule[d], old)) {
          schedule[d][val] = schedule[d][old];
          delete schedule[d][old];
        }
      }
      refreshTable();
    });
  });
}

function bindAdminActions() {
  const announceBtn = document.getElementById('announcement-send-btn');
  if (announceBtn) {
    announceBtn.addEventListener('click', async () => {
      const input = document.getElementById('announcement-input');
      const content = input.value.trim();
      if (!content) { setFeedback('Type something to broadcast first.', 'error'); return; }
      try {
        const res = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to broadcast.');
        input.value = '';
        setFeedback('Broadcast sent — it\'ll appear on everyone\'s dashboard shortly.');
      } catch (err) {
        setFeedback(err.message, 'error');
      }
    });
  }

  const backupBtn = document.getElementById('backup-now-btn');
  if (backupBtn) {
    backupBtn.addEventListener('click', async () => {
      backupBtn.disabled = true;
      backupBtn.textContent = 'Backing up…';
      try {
        const res = await fetch('/api/backup/run', { method: 'POST' });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Backup failed.');
        setFeedback(result.note || 'Backup complete.');
      } catch (err) {
        setFeedback(err.message, 'error');
      } finally {
        backupBtn.disabled = false;
        backupBtn.textContent = '💾 Backup Now';
        loadBackupStatus();
      }
    });
  }

  document.getElementById('week-prev').addEventListener('click', () => {
    weekOffset -= 1;
    refreshTable();
  });

  document.getElementById('week-next').addEventListener('click', () => {
    weekOffset += 1;
    refreshTable();
  });

  document.getElementById('week-today').addEventListener('click', () => {
    weekOffset = 0;
    refreshTable();
  });

  document.getElementById('week-fill').addEventListener('click', () => {
    const days = weekDatesIso(weekOffset);
    let added = 0;
    days.forEach((date) => {
      if (!dates.includes(date)) {
        dates.push(date);
        added++;
      }
      if (!schedule[date]) schedule[date] = {};
      people.forEach((p) => { if (!schedule[date][p.name]) schedule[date][p.name] = 'X'; });
    });
    dates.sort();
    refreshTable();
    setFeedback(added ? `Added ${added} date(s) for this week.` : 'This week already has all 7 dates.');
  });

  document.getElementById('autogen-week-btn').addEventListener('click', () => runAutoGenerate(weekDatesIso(weekOffset)));
  document.getElementById('autogen-month-btn').addEventListener('click', () => runAutoGenerate([...dates]));

  document.getElementById('add-person-btn').addEventListener('click', () => {
    const input = document.getElementById('new-person');
    const value = input.value.trim();
    if (!value) { setFeedback('Enter a name first.', 'error'); return; }
    if (people.some((p) => p.name === value)) { setFeedback('Operator already exists.', 'error'); return; }
    people.push({ id: null, name: value });
    for (const d of dates) { if (schedule[d]) schedule[d][value] = 'X'; }
    input.value = '';
    refreshTable();
    setFeedback(`Operator "${value}" added — a login account is created for them on Save.`);
  });

  document.getElementById('add-date-btn').addEventListener('click', () => {
    const input = document.getElementById('new-date');
    const value = input.value.trim();
    if (!value) { setFeedback('Select a date first.', 'error'); return; }
    if (dates.includes(value)) { setFeedback('Date already in schedule.', 'error'); return; }
    dates.push(value);
    dates.sort();
    schedule[value] = {};
    people.forEach((p) => { schedule[value][p.name] = 'X'; });
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

      people = result.people.map((u) => ({ id: u.id, name: u.name }));
      dates = payload.dates;
      // Re-key the schedule onto whatever final names the server settled on
      // (covers the brand-new-operator case, where id was null pre-save).
      const byOldName = {};
      payload.people.forEach((p, i) => { byOldName[p.name] = result.people[i]?.name || p.name; });
      const rekeyed = {};
      Object.entries(payload.schedule).forEach(([date, row]) => {
        rekeyed[date] = {};
        Object.entries(row).forEach(([name, code]) => { rekeyed[date][byOldName[name] || name] = code; });
      });
      schedule = rekeyed;

      let msg = 'Changes saved. Dashboard will reflect updates on next refresh.';
      if (result.createdAccounts && result.createdAccounts.length) {
        const lines = result.createdAccounts.map((a) => `${a.username} / ${a.tempPassword} (${a.displayName})`);
        msg += ` New account(s): ${lines.join(', ')} — share these temp passwords securely.`;
      }
      setFeedback(msg);
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
  people = Array.isArray(init.people) ? init.people.map((p) => ({ id: p.id, name: p.name })) : [];
  dates = Array.isArray(init.dates) ? [...init.dates] : [];
  schedule = typeof init.schedule === 'object' ? JSON.parse(JSON.stringify(init.schedule)) : {};
  canEdit = init.canEdit !== false;
  document.getElementById('week-fill').disabled = !canEdit;

  refreshTable();
  bindAdminActions();
  setFeedback('Admin panel ready.');
  await loadPendingSwaps();
  await loadBackupStatus();

  const clockEl = document.getElementById('live-clock');
  const tick = () => clockEl.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
  tick(); setInterval(tick, 1000);
}

initialize().catch((err) => setFeedback(err.message, 'error'));

async function loadBackupStatus() {
  const box = document.getElementById('backup-status');
  if (!box) return;
  try {
    const res = await fetch('/api/backup/status');
    const status = await res.json();
    const local = 'Local snapshots: daily, kept 30 days.';
    let drive;
    if (!status.driveConfigured) {
      drive = 'Google Drive: not connected. See scripts/google-auth-setup.js.';
    } else if (status.lastDriveBackup) {
      const t = new Date(status.lastDriveBackup.time).toLocaleString('en-GB', { timeZone: 'Asia/Yerevan' });
      drive = `Google Drive: last synced ${t} (${status.lastDriveBackup.documentCount} docs).`;
    } else {
      drive = 'Google Drive: connected, first sync pending.';
    }
    box.innerHTML = `${local}<br/>${drive}`;
  } catch {
    box.innerHTML = '<span style="color:var(--red)">Failed to load backup status</span>';
  }
}

async function loadPendingSwaps() {
  const box = document.getElementById('pending-swaps');
  if (!box) return;
  try {
    const res = await fetch('/api/swaps');
    const swaps = await res.json();
    const pending = swaps.filter((s) => s.status === 'pending');
    if (!pending.length) {
      box.innerHTML = '<span style="opacity:.5">No pending swaps</span>';
      return;
    }
    // Read-only oversight — only the requested colleague can accept/reject
    // (no lead approval needed), so this is visibility, not an action panel.
    box.innerHTML = pending.map((s) => `<div style="border:1px solid var(--border);padding:6px;margin-bottom:6px;">${s.requester_name} → ${s.target_name}: ${s.shift_type} shift, ${new Date(s.start_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' })}</div>`).join('');
  } catch {
    box.innerHTML = '<span style="color:var(--red)">Failed to load swaps</span>';
  }
}
