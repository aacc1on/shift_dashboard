'use strict';

// Shared across every authenticated page: a "who am I" badge in the header
// (click to edit your own emoji avatar + bio), and a team roster you can
// browse to see colleagues' avatar/role/bio. Builds its own modal DOM so no
// page needs matching markup — just this one script tag.
(function () {
  const PRESET_EMOJI = ['🧑', '🛡️', '🕵️', '👮', '🧑‍💻', '🧑‍🚀', '🦉', '🐺', '🦅', '🐢', '🔥', '⚡', '👾', '🤖'];

  let me = null;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : s;
    return div.innerHTML;
  }

  async function loadMe() {
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      me = await res.json();
      renderBadges();
    } catch { /* header just won't show a badge this load */ }
  }

  function renderBadges() {
    const container = document.querySelector('.hdr-right');
    if (!container || !me) return;

    if (!document.getElementById('profile-badge')) {
      const profileBtn = document.createElement('button');
      profileBtn.id = 'profile-badge';
      profileBtn.className = 'hdr-badge';
      profileBtn.type = 'button';
      profileBtn.title = 'Edit your profile';
      profileBtn.addEventListener('click', openProfileModal);
      container.insertBefore(profileBtn, container.firstChild);

      const teamBtn = document.createElement('button');
      teamBtn.id = 'team-badge';
      teamBtn.className = 'hdr-badge';
      teamBtn.type = 'button';
      teamBtn.textContent = '👥 TEAM';
      teamBtn.title = 'View the team';
      teamBtn.addEventListener('click', openTeamModal);
      container.insertBefore(teamBtn, container.firstChild);
    }
    document.getElementById('profile-badge').textContent = `${me.avatar_emoji} ${me.display_name}`;
  }

  function ensureModal(id, buildContent) {
    let backdrop = document.getElementById(id);
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = id;
    backdrop.className = 'modal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `<div class="modal-box">${buildContent}</div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.hidden = true; });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function openProfileModal() {
    const modal = ensureModal('profile-edit-backdrop', `
      <div class="section-header"><span class="section-icon">▶</span> YOUR PROFILE <span class="section-line"></span></div>
      <div class="sidebar-field">
        <label>// AVATAR (pick an emoji or type your own)</label>
        <div id="profile-emoji-presets" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
        <input id="profile-emoji-input" type="text" maxlength="8" />
      </div>
      <div class="sidebar-field" style="margin-top:10px">
        <label>// DISPLAY NAME</label>
        <input id="profile-name-input" type="text" />
      </div>
      <div class="sidebar-field" style="margin-top:10px">
        <label>// ROLE / WHAT YOU DO ON THE TEAM</label>
        <textarea id="profile-bio-input" rows="3" placeholder="e.g. Night shift lead, malware triage"></textarea>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="admin-btn primary" id="profile-save-btn" type="button" style="width:auto;flex:1">▶ SAVE PROFILE</button>
        <button class="admin-btn" id="profile-close-btn" type="button" style="width:auto">Close</button>
      </div>
      <div class="admin-feedback" id="profile-feedback" style="margin-top:10px"></div>

      <div style="margin-top:20px; border-top:1px solid var(--border); padding-top:16px;">
        <div class="admin-sidebar-title">// CHANGE PASSWORD</div>
        <div class="sidebar-field">
          <label>// CURRENT PASSWORD</label>
          <input id="profile-current-password" type="password" autocomplete="current-password" />
        </div>
        <div class="sidebar-field" style="margin-top:10px">
          <label>// NEW PASSWORD (min. 6 characters)</label>
          <input id="profile-new-password" type="password" autocomplete="new-password" />
        </div>
        <button class="admin-btn" id="profile-password-btn" type="button" style="margin-top:10px">Change Password</button>
        <div class="admin-feedback" id="profile-password-feedback" style="margin-top:10px"></div>
      </div>
    `);

    document.getElementById('profile-emoji-input').value = me.avatar_emoji;
    document.getElementById('profile-name-input').value = me.display_name;
    document.getElementById('profile-bio-input').value = me.bio;
    document.getElementById('profile-feedback').textContent = '';
    document.getElementById('profile-feedback').className = 'admin-feedback';
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-password-feedback').textContent = '';
    document.getElementById('profile-password-feedback').className = 'admin-feedback';

    const presetsBox = document.getElementById('profile-emoji-presets');
    presetsBox.innerHTML = PRESET_EMOJI.map((e) =>
      `<button type="button" class="admin-btn" style="width:auto;padding:6px 10px;font-size:1rem;" data-emoji="${e}">${e}</button>`
    ).join('');
    presetsBox.querySelectorAll('[data-emoji]').forEach((btn) => {
      btn.addEventListener('click', () => { document.getElementById('profile-emoji-input').value = btn.dataset.emoji; });
    });

    document.getElementById('profile-close-btn').onclick = () => { modal.hidden = true; };
    document.getElementById('profile-save-btn').onclick = async () => {
      const avatarEmoji = document.getElementById('profile-emoji-input').value.trim();
      const displayName = document.getElementById('profile-name-input').value.trim();
      const bio = document.getElementById('profile-bio-input').value.trim();
      const feedback = document.getElementById('profile-feedback');
      feedback.textContent = 'Saving…';
      try {
        const res = await fetch('/api/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarEmoji, displayName, bio })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to save.');
        me = result;
        renderBadges();
        feedback.textContent = 'Saved.';
        setTimeout(() => { modal.hidden = true; }, 500);
      } catch (err) {
        feedback.textContent = err.message;
        feedback.className = 'admin-feedback error';
      }
    };

    document.getElementById('profile-password-btn').onclick = async () => {
      const currentPassword = document.getElementById('profile-current-password').value;
      const newPassword = document.getElementById('profile-new-password').value;
      const pwFeedback = document.getElementById('profile-password-feedback');
      pwFeedback.textContent = 'Saving…';
      pwFeedback.className = 'admin-feedback';
      try {
        const res = await fetch('/api/me/password', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to change password.');
        document.getElementById('profile-current-password').value = '';
        document.getElementById('profile-new-password').value = '';
        pwFeedback.textContent = 'Password changed.';
      } catch (err) {
        pwFeedback.textContent = err.message;
        pwFeedback.className = 'admin-feedback error';
      }
    };

    modal.hidden = false;
  }

  async function openTeamModal() {
    const modal = ensureModal('team-backdrop', `
      <div class="section-header"><span class="section-icon">▶</span> TEAM <span class="section-line"></span></div>
      <div id="team-roster" class="doc-list" style="max-height:60vh;overflow-y:auto;"><span style="opacity:.4">Loading…</span></div>
      <button class="admin-btn primary" id="team-close-btn" type="button" style="width:auto;margin-top:14px">Close</button>
    `);
    document.getElementById('team-close-btn').onclick = () => { modal.hidden = true; };
    modal.hidden = false;

    const box = document.getElementById('team-roster');
    try {
      const res = await fetch('/api/team');
      const team = await res.json();
      box.innerHTML = team.map((u) => `
        <div class="doc-item">
          <div class="doc-item-head">
            <span style="font-size:1.3rem;">${escapeHtml(u.avatar_emoji)}</span>
            <span class="doc-item-title" style="cursor:default;">${escapeHtml(u.display_name)}</span>
            <span class="doc-badge ${u.role === 'lead' ? 'published' : 'team'}">${u.role.toUpperCase()}</span>
          </div>
          <div class="doc-item-meta">${u.bio ? escapeHtml(u.bio) : '<span style="opacity:.4">No bio set</span>'}</div>
        </div>
      `).join('') || '<span style="opacity:.4">No team members found.</span>';
    } catch {
      box.innerHTML = '<span style="color:var(--red)">Failed to load team.</span>';
    }
  }

  document.addEventListener('DOMContentLoaded', loadMe);
})();
