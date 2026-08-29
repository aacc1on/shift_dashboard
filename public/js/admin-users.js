'use strict';

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

function updateClock() {
  const el = document.getElementById('live-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
}

async function loadUsers() {
  const box = document.getElementById('user-list');
  try {
    const res = await fetch('/api/users');
    if (res.status === 403) { box.innerHTML = '<div class="empty-state">Lead role required.</div>'; return; }
    const users = await res.json();
    box.innerHTML = users.map((u) => `
      <div class="doc-item">
        <div class="doc-item-head">
          <span class="doc-item-title">${escapeHtml(u.display_name)}</span>
          <span class="doc-badge ${u.role === 'lead' ? 'published' : 'team'}">${u.role.toUpperCase()}</span>
          ${u.active ? '' : '<span class="doc-badge">DEACTIVATED</span>'}
        </div>
        <div class="doc-item-meta">username: ${escapeHtml(u.username)} · created ${new Date(u.created_at).toLocaleDateString('en-GB')}</div>
        <div class="doc-item-actions">
          <button class="admin-btn ai" data-reset="${u.id}" data-username="${escapeHtml(u.username)}" data-display="${escapeHtml(u.display_name)}" type="button">Reset Password</button>
          ${u.active
            ? `<button class="admin-btn danger" data-deactivate="${u.id}" data-display="${escapeHtml(u.display_name)}" type="button">Deactivate</button>`
            : `<button class="admin-btn" data-activate="${u.id}" data-display="${escapeHtml(u.display_name)}" type="button">Reactivate</button>`}
        </div>
      </div>
    `).join('');

    box.querySelectorAll('[data-reset]').forEach((btn) => {
      btn.addEventListener('click', () => resetPassword(btn.dataset.reset, btn.dataset.username, btn.dataset.display));
    });
    box.querySelectorAll('[data-deactivate]').forEach((btn) => {
      btn.addEventListener('click', () => setActive(btn.dataset.deactivate, false, btn.dataset.display));
    });
    box.querySelectorAll('[data-activate]').forEach((btn) => {
      btn.addEventListener('click', () => setActive(btn.dataset.activate, true, btn.dataset.display));
    });
  } catch {
    box.innerHTML = '<div class="empty-state">Failed to load users.</div>';
  }
}

async function resetPassword(id, username, displayName) {
  if (!confirm(`Reset the password for ${displayName} (${username})? Their current password stops working immediately.`)) return;
  try {
    const res = await fetch(`/api/users/${id}/reset-password`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to reset password.');
    document.getElementById('reset-username').textContent = `${displayName} (${result.username})`;
    document.getElementById('reset-password-display').textContent = result.tempPassword;
    document.getElementById('reset-result-backdrop').hidden = false;
  } catch (err) {
    alert(err.message);
  }
}

async function setActive(id, active, displayName) {
  const verb = active ? 'reactivate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${verb} ${displayName}?${active ? '' : ' They will no longer be able to log in.'}`)) return;
  try {
    const res = await fetch(`/api/users/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || `Failed to ${verb}.`);
    loadUsers();
  } catch (err) {
    alert(err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  setInterval(updateClock, 1000);
  loadUsers();
  document.getElementById('reset-close-btn').addEventListener('click', () => {
    document.getElementById('reset-result-backdrop').hidden = true;
  });
});
