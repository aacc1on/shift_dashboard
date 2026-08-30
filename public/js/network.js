'use strict';

let editor = null;
let currentDiagramId = null;
let diagrams = [];
let dirty = false;
let nodeSeq = 0;

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

function fmtRelative(iso) {
  const diffMs = Date.now() - new Date(iso + 'Z').getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function setSaveStatus(text, isError) {
  const el = document.getElementById('net-save-status');
  el.textContent = text;
  el.className = 'net-save-status' + (isError ? ' error' : '');
  if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2500);
}

function markDirty() {
  dirty = true;
  document.getElementById('net-save-btn').classList.add('pending');
}
function markClean() {
  dirty = false;
  document.getElementById('net-save-btn').classList.remove('pending');
}

function setToolbarEnabled(enabled) {
  ['net-clear-btn', 'net-delete-btn', 'net-save-btn'].forEach((id) => {
    document.getElementById(id).disabled = !enabled;
  });
  document.getElementById('diagram-title').disabled = !enabled;
  document.getElementById('net-empty-state').hidden = enabled;
}

function initEditor() {
  const container = document.getElementById('drawflow');
  editor = new Drawflow(container);
  editor.reroute = true;
  editor.curvature = 0.4;
  editor.start();

  ['nodeMoved', 'nodeDataChanged', 'connectionCreated', 'connectionRemoved', 'nodeRemoved'].forEach((ev) => {
    editor.on(ev, () => { if (currentDiagramId) markDirty(); });
  });

  container.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.net-node-del');
    if (delBtn) {
      const nodeEl = e.target.closest('.drawflow-node');
      if (nodeEl) editor.removeNodeId(nodeEl.id);
      return;
    }
    const label = e.target.closest('.net-node-label');
    if (label) {
      const current = label.textContent;
      const next = prompt('Rename:', current);
      if (next != null && next.trim()) label.textContent = next.trim();
    }
  });
}

async function loadDiagramList(selectId) {
  const res = await fetch('/api/network');
  diagrams = await res.json();
  const list = document.getElementById('diagram-list');
  if (!diagrams.length) {
    list.innerHTML = '<span style="opacity:.4">No diagrams yet.</span>';
  } else {
    list.innerHTML = diagrams.map((d) => `
      <div class="net-diagram-item${d.id === currentDiagramId ? ' active' : ''}" data-id="${d.id}">
        <div class="net-diagram-item-title">${escapeHtml(d.title)}</div>
        <div class="net-diagram-item-meta">updated ${fmtRelative(d.updated_at)}${d.updated_by_name ? ' by ' + escapeHtml(d.updated_by_name) : ''}</div>
      </div>
    `).join('');
    list.querySelectorAll('.net-diagram-item').forEach((el) => {
      el.addEventListener('click', () => selectDiagram(Number(el.dataset.id)));
    });
  }
  if (selectId) selectDiagram(selectId);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

async function selectDiagram(id) {
  if (dirty && !confirm('You have unsaved changes on the current diagram. Discard them?')) return;
  const res = await fetch(`/api/network/${id}`);
  if (!res.ok) { setSaveStatus('Could not load diagram.', true); return; }
  const diagram = await res.json();

  currentDiagramId = diagram.id;
  editor.clear();
  let parsed = null;
  try { parsed = JSON.parse(diagram.data); } catch (_) { parsed = null; }
  if (parsed && parsed.drawflow) editor.import(parsed);

  document.getElementById('diagram-title').value = diagram.title;
  setToolbarEnabled(true);
  markClean();
  document.querySelectorAll('.net-diagram-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === id);
  });
}

async function createDiagram() {
  const title = prompt('Diagram title:', 'New Diagram');
  if (!title || !title.trim()) return;
  const res = await fetch('/api/network', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim() })
  });
  if (!res.ok) { setSaveStatus('Could not create diagram.', true); return; }
  const diagram = await res.json();
  await loadDiagramList(diagram.id);
}

async function saveCurrent() {
  if (!currentDiagramId) return;
  const title = document.getElementById('diagram-title').value.trim();
  if (!title) { setSaveStatus('Title cannot be empty.', true); return; }
  const data = editor.export();
  const res = await fetch(`/api/network/${currentDiagramId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, data })
  });
  if (!res.ok) { setSaveStatus('Save failed.', true); return; }
  markClean();
  setSaveStatus('Saved ✓');
  loadDiagramList();
}

async function deleteCurrent() {
  if (!currentDiagramId) return;
  if (!confirm('Delete this diagram permanently?')) return;
  const res = await fetch(`/api/network/${currentDiagramId}`, { method: 'DELETE' });
  if (!res.ok) { setSaveStatus('Delete failed (only the author or a lead can delete).', true); return; }
  currentDiagramId = null;
  editor.clear();
  setToolbarEnabled(false);
  document.getElementById('diagram-title').value = '';
  markClean();
  loadDiagramList();
}

function addNodeAt(icon, label, x, y) {
  nodeSeq += 1;
  const html = `
    <div class="net-node-inner">
      <span class="net-node-icon">${icon}</span>
      <span class="net-node-label">${escapeHtml(label)}</span>
      <span class="net-node-del" title="Delete">✕</span>
    </div>`;
  editor.addNode(label, 1, 1, x, y, 'net-node', {}, html);
  markDirty();
}

function initPalette() {
  document.querySelectorAll('.net-node-tpl').forEach((tpl) => {
    tpl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('icon', tpl.dataset.icon);
      e.dataTransfer.setData('label', tpl.dataset.label);
    });
  });
  const canvas = document.getElementById('drawflow');
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!currentDiagramId) { setSaveStatus('Select or create a diagram first.', true); return; }
    const icon = e.dataTransfer.getData('icon');
    const label = e.dataTransfer.getData('label');
    if (!label) return;
    const rect = canvas.getBoundingClientRect();
    const zoom = editor.zoom || 1;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    addNodeAt(icon, label, x, y);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateClock();
  setInterval(updateClock, 1000);

  initEditor();
  initPalette();
  loadDiagramList();

  document.getElementById('new-diagram-btn').addEventListener('click', createDiagram);
  document.getElementById('net-save-btn').addEventListener('click', saveCurrent);
  document.getElementById('net-delete-btn').addEventListener('click', deleteCurrent);
  document.getElementById('net-clear-btn').addEventListener('click', () => {
    if (!currentDiagramId) return;
    if (!confirm('Clear the whole canvas? (not saved until you press SAVE)')) return;
    editor.clear();
    markDirty();
  });
  document.getElementById('net-zoom-in').addEventListener('click', () => editor.zoom_in());
  document.getElementById('net-zoom-out').addEventListener('click', () => editor.zoom_out());
  document.getElementById('net-zoom-reset').addEventListener('click', () => editor.zoom_reset());
  document.getElementById('diagram-title').addEventListener('input', () => { if (currentDiagramId) markDirty(); });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
});
