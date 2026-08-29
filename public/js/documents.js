'use strict';

const AUTH_ROLE = (window.SOC_DOCS || {}).authRole;
const AUTH_USER_ID = (window.SOC_DOCS || {}).authUserId;

let currentViewDoc = null;
let allDocs = [];
let activeCategory = null; // null = "All"
let teamCache = [];

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

function excerptOf(content, len = 140) {
  const plain = String(content || '').replace(/[#*_`>[\]()-]/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > len ? plain.slice(0, len) + '…' : plain;
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Yerevan' }) : '';
}

function canEditDoc(d) {
  return AUTH_ROLE === 'lead' || d.author_id === AUTH_USER_ID;
}

function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('soc_theme');
  if (saved === 'light') document.body.classList.add('light');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('soc_theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });
  }
}

function updateClock() {
  const el = document.getElementById('live-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Yerevan', hour12: false });
}

function setFeedback(elId, message, type = 'info') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.className = `admin-feedback${type === 'error' ? ' error' : ''}`;
}

// ---- TABS ----

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.getElementById('tab-documents').hidden = target !== 'documents';
      document.getElementById('tab-reports').hidden = target !== 'reports';
    });
  });
}

// ---- REPORTS ----

async function searchReports() {
  const box = document.getElementById('report-results');
  const q = document.getElementById('report-search').value.trim();
  const from = document.getElementById('report-from').value;
  const to = document.getElementById('report-to').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  box.innerHTML = '<span style="opacity:.4">Loading…</span>';
  try {
    const res = await fetch(`/api/reports?${params}`);
    const reports = await res.json();
    if (!reports.length) { box.innerHTML = '<div class="empty-state">No reports found.</div>'; return; }
    box.innerHTML = reports.map((r) => `
      <div class="report-item">
        <div class="report-item-head">${escapeHtml(r.author_name)} — ${escapeHtml(r.shift_type)} shift, ${fmtDate(r.start_at)}</div>
        <div class="field-label">What was done:</div>${escapeHtml(r.what_done)}
        ${r.unfinished ? `<div class="field-label">Unfinished:</div>${escapeHtml(r.unfinished)}` : ''}
        ${r.open_items.length ? `<div class="field-label">Open items:</div><ol>${r.open_items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>` : ''}
      </div>
    `).join('');
  } catch {
    box.innerHTML = '<div class="empty-state">Failed to load reports.</div>';
  }
}

// ---- DOCUMENTS ----

function docBadge(visibility) {
  const label = { shift: 'SHIFT HANDOFF', team: 'TEAM', published: 'PUBLISHED', restricted: '🔒 RESTRICTED' }[visibility] || visibility.toUpperCase();
  return `<span class="doc-badge ${visibility}">${label}</span>`;
}

async function loadTeamCache() {
  try {
    const res = await fetch('/api/team');
    teamCache = await res.json();
  } catch {
    teamCache = [];
  }
}

function renderRestrictedChecklist(checkedIds) {
  const box = document.getElementById('doc-restricted-checklist');
  const checked = new Set((checkedIds || []).map(Number));
  box.innerHTML = teamCache.map((u) => `
    <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-dim);cursor:pointer;">
      <input type="checkbox" value="${u.id}" style="width:auto" ${checked.has(u.id) ? 'checked' : ''} />
      ${escapeHtml(u.avatar_emoji)} ${escapeHtml(u.display_name)} <span style="opacity:.5">(${u.role})</span>
    </label>
  `).join('') || '<span style="opacity:.4">No team members</span>';
}

function getCheckedRestrictedIds() {
  return [...document.querySelectorAll('#doc-restricted-checklist input:checked')].map((el) => Number(el.value));
}

function updateRestrictedPickerVisibility() {
  const isRestricted = document.getElementById('doc-visibility').value === 'restricted';
  document.getElementById('doc-restricted-picker').hidden = !isRestricted;
}

async function loadAllDocuments() {
  document.getElementById('doc-results').innerHTML = '<span style="opacity:.4">Loading…</span>';
  try {
    const res = await fetch('/api/documents');
    allDocs = await res.json();
  } catch {
    allDocs = [];
  }
  renderCategories();
  renderTypeOptions();
  renderDocGrid();
}

function renderCategories() {
  const box = document.getElementById('category-list');
  const counts = new Map();
  allDocs.forEach((d) => counts.set(d.type, (counts.get(d.type) || 0) + 1));
  const categories = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const rows = [
    `<div class="category-item ${activeCategory === null ? 'active' : ''}" data-cat="">All documents <span class="count">${allDocs.length}</span></div>`,
    ...categories.map(([type, count]) =>
      `<div class="category-item ${activeCategory === type ? 'active' : ''}" data-cat="${escapeHtml(type)}">${escapeHtml(type)} <span class="count">${count}</span></div>`
    )
  ];
  box.innerHTML = rows.join('') || '<span style="opacity:.4">No categories yet</span>';

  box.querySelectorAll('[data-cat]').forEach((el) => {
    el.addEventListener('click', () => {
      activeCategory = el.dataset.cat || null;
      renderCategories();
      renderDocGrid();
    });
  });
}

function renderTypeOptions() {
  const list = document.getElementById('doc-type-options');
  const types = [...new Set(allDocs.map((d) => d.type))].sort();
  list.innerHTML = types.map((t) => `<option value="${escapeHtml(t)}"></option>`).join('');
}

function renderDocGrid() {
  const box = document.getElementById('doc-results');
  const filterBar = document.getElementById('doc-active-filter');
  const q = document.getElementById('doc-search').value.trim().toLowerCase();

  let docs = allDocs;
  if (activeCategory) docs = docs.filter((d) => d.type === activeCategory);
  if (q) {
    docs = docs.filter((d) =>
      d.title.toLowerCase().includes(q) ||
      d.content.toLowerCase().includes(q) ||
      d.tags.toLowerCase().includes(q)
    );
  }

  if (activeCategory) {
    filterBar.hidden = false;
    filterBar.innerHTML = `Filtered by category: <strong style="color:var(--green)">${escapeHtml(activeCategory)}</strong> <button type="button" id="doc-clear-filter">✕ clear</button>`;
    document.getElementById('doc-clear-filter').addEventListener('click', () => {
      activeCategory = null;
      renderCategories();
      renderDocGrid();
    });
  } else {
    filterBar.hidden = true;
    filterBar.innerHTML = '';
  }

  if (!docs.length) { box.innerHTML = '<div class="empty-state">No documents found.</div>'; return; }

  box.innerHTML = docs.map((d) => `
    <div class="doc-item" data-doc-id="${d.id}">
      <div class="doc-item-head"><span class="doc-item-title" data-open="${d.id}">${escapeHtml(d.title)}</span>${docBadge(d.visibility)}</div>
      <div class="doc-item-meta"><span class="doc-badge">${escapeHtml(d.type)}</span> ${escapeHtml(d.author_name)} · ${fmtDate(d.created_at)}${d.tags ? ' · ' + escapeHtml(d.tags) : ''}</div>
      <div class="doc-item-excerpt" data-open="${d.id}">${escapeHtml(excerptOf(d.content)) || '<span style="opacity:.4">(empty)</span>'}</div>
    </div>
  `).join('');

  box.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', () => openDocView(Number(el.dataset.open)));
  });
}

async function openDocView(id) {
  try {
    const res = await fetch(`/api/documents/${id}`);
    if (!res.ok) throw new Error('Document not found or you no longer have access to it.');
    const doc = await res.json();
    currentViewDoc = doc;

    document.getElementById('doc-view-title').textContent = doc.title;
    let metaHtml = `${docBadge(doc.visibility)} <span class="doc-badge">${escapeHtml(doc.type)}</span> · ${escapeHtml(doc.author_name)} · ${fmtDate(doc.created_at)}${doc.tags ? ' · ' + escapeHtml(doc.tags) : ''}`;
    if (doc.access_user_ids) {
      const names = doc.access_user_ids.map((id) => teamCache.find((u) => u.id === id)?.display_name || `#${id}`);
      metaHtml += `<br/><span style="opacity:.7">Can read: ${names.length ? escapeHtml(names.join(', ')) : '(no one yet — edit to add)'}</span>`;
    }
    document.getElementById('doc-view-meta').innerHTML = metaHtml;
    document.getElementById('doc-view-content').innerHTML = doc.content_html || '<span style="opacity:.4">(empty)</span>';

    const editBtn = document.getElementById('doc-view-edit-btn');
    const deleteBtn = document.getElementById('doc-view-delete-btn');
    const publishBtn = document.getElementById('doc-view-publish-btn');
    const unpublishBtn = document.getElementById('doc-view-unpublish-btn');

    const editable = canEditDoc(doc) && doc.visibility !== 'published';
    editBtn.hidden = !editable;
    deleteBtn.hidden = !canEditDoc(doc);
    publishBtn.hidden = !(AUTH_ROLE === 'lead' && doc.visibility === 'team');
    unpublishBtn.hidden = !(AUTH_ROLE === 'lead' && doc.visibility === 'published');

    document.getElementById('doc-view-backdrop').hidden = false;
  } catch (err) {
    alert(err.message);
  }
}

function closeDocView() {
  document.getElementById('doc-view-backdrop').hidden = true;
  currentViewDoc = null;
}

function openDocForm(doc) {
  document.getElementById('doc-feedback').textContent = '';
  document.getElementById('doc-feedback').className = 'admin-feedback';
  if (doc) {
    document.getElementById('doc-editing-id').value = doc.id;
    document.getElementById('doc-form-title').textContent = `EDITING: ${doc.title}`;
    document.getElementById('doc-type').value = doc.type;
    document.getElementById('doc-title').value = doc.title;
    document.getElementById('doc-tags').value = doc.tags;
    document.getElementById('doc-content').value = doc.content;
    document.getElementById('doc-visibility').value = doc.visibility === 'published' ? 'team' : doc.visibility;
    document.getElementById('doc-is-template').checked = !!doc.is_template;
    document.getElementById('doc-create-btn').textContent = '▶ UPDATE DOCUMENT';
    renderRestrictedChecklist(doc.access_user_ids);
  } else {
    document.getElementById('doc-editing-id').value = '';
    document.getElementById('doc-form-title').textContent = 'NEW DOCUMENT';
    document.getElementById('doc-type').value = activeCategory || '';
    document.getElementById('doc-title').value = '';
    document.getElementById('doc-tags').value = '';
    document.getElementById('doc-content').value = '';
    document.getElementById('doc-visibility').value = 'team';
    document.getElementById('doc-is-template').checked = false;
    document.getElementById('doc-create-btn').textContent = '▶ SAVE DOCUMENT';
    renderRestrictedChecklist([]);
  }
  updateRestrictedPickerVisibility();
  closeDocView();
  document.getElementById('doc-edit-backdrop').hidden = false;
}

function closeDocForm() {
  document.getElementById('doc-edit-backdrop').hidden = true;
}

async function deleteCurrentDoc() {
  if (!currentViewDoc) return;
  if (!confirm(`Delete "${currentViewDoc.title}"? This can't be undone.`)) return;
  try {
    const res = await fetch(`/api/documents/${currentViewDoc.id}`, { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to delete.');
    closeDocView();
    loadAllDocuments();
  } catch (err) {
    alert(err.message);
  }
}

async function setDocVisibility(id, action) {
  await fetch(`/api/documents/${id}/${action}`, { method: 'POST' });
  closeDocView();
  loadAllDocuments();
}

async function loadTemplates() {
  const box = document.getElementById('template-list');
  try {
    const res = await fetch('/api/documents?templates=1');
    const templates = await res.json();
    if (!templates.length) { box.innerHTML = '<span style="opacity:.4">No templates yet</span>'; return; }
    box.innerHTML = templates.map((t) => `
      <div style="border:1px solid var(--border);padding:6px;margin-bottom:6px;font-family:var(--font-mono);font-size:0.65rem;">
        ${escapeHtml(t.title)} <span style="opacity:.5">(${escapeHtml(t.type)})</span>
        <button class="admin-btn" data-use-template="${t.id}" type="button" style="margin-top:4px;font-size:0.6rem;padding:5px 8px;">Use Template</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-use-template]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = await fetch(`/api/documents/${btn.dataset.useTemplate}/use-template`, { method: 'POST' });
        const result = await res.json();
        if (res.ok) {
          loadAllDocuments();
        } else {
          alert(result.error || 'Failed to use template.');
        }
      });
    });
  } catch {
    box.innerHTML = '<span style="color:var(--red)">Failed to load templates</span>';
  }
}

function bindDocForm() {
  document.getElementById('doc-new-btn').addEventListener('click', () => openDocForm(null));
  document.getElementById('doc-cancel-edit-btn').addEventListener('click', closeDocForm);
  document.getElementById('doc-visibility').addEventListener('change', updateRestrictedPickerVisibility);

  document.getElementById('doc-create-btn').addEventListener('click', async () => {
    const editingId = document.getElementById('doc-editing-id').value;
    const type = document.getElementById('doc-type').value.trim();
    const title = document.getElementById('doc-title').value.trim();
    const tags = document.getElementById('doc-tags').value.trim();
    const content = document.getElementById('doc-content').value;
    const visibility = document.getElementById('doc-visibility').value;
    const isTemplate = document.getElementById('doc-is-template').checked;
    const restrictedTo = visibility === 'restricted' ? getCheckedRestrictedIds() : undefined;

    if (!type || !title) { setFeedback('doc-feedback', 'Category and title are required.', 'error'); return; }
    if (visibility === 'restricted' && !restrictedTo.length) { setFeedback('doc-feedback', 'Pick at least one person who can read this.', 'error'); return; }
    setFeedback('doc-feedback', 'Saving…');
    try {
      const res = await fetch(editingId ? `/api/documents/${editingId}` : '/api/documents', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, tags, content, visibility, isTemplate, restrictedTo })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to save.');
      closeDocForm();
      loadAllDocuments();
      if (isTemplate) loadTemplates();
    } catch (err) {
      setFeedback('doc-feedback', err.message, 'error');
    }
  });
}

function bindDocViewModal() {
  document.getElementById('doc-view-close-btn').addEventListener('click', closeDocView);
  document.getElementById('doc-view-edit-btn').addEventListener('click', () => currentViewDoc && openDocForm(currentViewDoc));
  document.getElementById('doc-view-delete-btn').addEventListener('click', deleteCurrentDoc);
  document.getElementById('doc-view-publish-btn').addEventListener('click', () => currentViewDoc && setDocVisibility(currentViewDoc.id, 'publish'));
  document.getElementById('doc-view-unpublish-btn').addEventListener('click', () => currentViewDoc && setDocVisibility(currentViewDoc.id, 'unpublish'));
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateClock();
  setInterval(updateClock, 1000);
  bindTabs();

  document.getElementById('report-search-btn').addEventListener('click', searchReports);
  document.getElementById('doc-search').addEventListener('input', renderDocGrid);
  bindDocForm();
  bindDocViewModal();

  searchReports();
  loadAllDocuments();
  loadTemplates();
  loadTeamCache();
});
