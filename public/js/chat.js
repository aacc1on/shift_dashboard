'use strict';

const AUTH_USER_ID = (window.SOC_CHAT || {}).authUserId;

let currentChannel = { type: 'team' }; // or { type: 'dm', userId, name, avatar }
let lastMessageId = 0;

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Yerevan' });
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

function renderMessage(m) {
  const div = document.createElement('div');
  div.className = `chat-msg${m.author_id === AUTH_USER_ID ? ' own' : ''}`;
  div.innerHTML = `
    <div class="chat-msg-avatar">${escapeHtml(m.author_avatar)}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-head"><span class="chat-msg-author">${escapeHtml(m.author_name)}</span><span class="chat-msg-time">${fmtTime(m.created_at)}</span></div>
      <div class="chat-msg-content">${escapeHtml(m.content)}</div>
    </div>
  `;
  return div;
}

function currentEndpoint() {
  return currentChannel.type === 'team' ? '/api/messages' : `/api/messages/dm/${currentChannel.userId}`;
}

async function loadChannel() {
  const log = document.getElementById('chat-log');
  const header = document.getElementById('chat-header');
  lastMessageId = 0;
  log.innerHTML = '<span style="opacity:.4">Loading…</span>';

  header.textContent = currentChannel.type === 'team'
    ? '📢 Team Channel — visible to everyone'
    : `${currentChannel.avatar} ${currentChannel.name} — private, only the two of you can see this`;

  try {
    const res = await fetch(currentEndpoint());
    const data = await res.json();
    const messages = currentChannel.type === 'team' ? data : data.messages;
    log.innerHTML = '';
    if (!messages.length) {
      log.innerHTML = '<span style="opacity:.4">No messages yet — say hello.</span>';
    } else {
      messages.forEach((m) => log.appendChild(renderMessage(m)));
      lastMessageId = messages[messages.length - 1].id;
    }
    log.scrollTop = log.scrollHeight;
  } catch {
    log.innerHTML = '<span style="color:var(--red)">Failed to load messages.</span>';
  }
}

async function pollNew() {
  if (!lastMessageId) return;
  try {
    const url = currentChannel.type === 'team'
      ? `/api/messages?since=${lastMessageId}`
      : `/api/messages/dm/${currentChannel.userId}?since=${lastMessageId}`;
    const res = await fetch(url);
    const data = await res.json();
    const messages = currentChannel.type === 'team' ? data : data.messages;
    if (!messages.length) return;
    const log = document.getElementById('chat-log');
    const wasAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    document.querySelector('#chat-log > span')?.remove();
    messages.forEach((m) => log.appendChild(renderMessage(m)));
    lastMessageId = messages[messages.length - 1].id;
    if (wasAtBottom) log.scrollTop = log.scrollHeight;
    if (currentChannel.type === 'dm') loadConversationList(); // bump preview/ordering
  } catch { /* try again next poll */ }
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content) return;
  const feedback = document.getElementById('chat-feedback');
  try {
    const res = await fetch(currentEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to send.');
    input.value = '';
    feedback.textContent = '';
    await pollNew();
    if (currentChannel.type === 'dm') loadConversationList();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.className = 'admin-feedback error';
  }
}

function switchToTeam() {
  currentChannel = { type: 'team' };
  document.querySelectorAll('.chat-channel-item, .chat-dm-item').forEach((el) => el.classList.remove('active'));
  document.querySelector('.chat-channel-item').classList.add('active');
  loadChannel();
}

function switchToDm(userId, name, avatar) {
  currentChannel = { type: 'dm', userId, name, avatar };
  document.querySelectorAll('.chat-channel-item, .chat-dm-item').forEach((el) => el.classList.remove('active'));
  document.querySelector(`.chat-dm-item[data-user-id="${userId}"]`)?.classList.add('active');
  loadChannel();
}

async function loadConversationList() {
  const box = document.getElementById('dm-conversation-list');
  try {
    const res = await fetch('/api/messages/conversations');
    const conversations = await res.json();
    if (!conversations.length) {
      box.innerHTML = '<span style="opacity:.4;font-size:0.65rem;">No conversations yet</span>';
      return;
    }
    box.innerHTML = conversations.map((c) => `
      <div class="chat-dm-item${currentChannel.type === 'dm' && currentChannel.userId === c.user.id ? ' active' : ''}" data-user-id="${c.user.id}">
        <span class="avatar">${escapeHtml(c.user.avatar_emoji)}</span>
        <div class="meta">
          <div>${escapeHtml(c.user.display_name)}</div>
          <div class="preview">${c.lastAuthorId === AUTH_USER_ID ? 'You: ' : ''}${escapeHtml(c.lastContent)}</div>
        </div>
      </div>
    `).join('');
    box.querySelectorAll('.chat-dm-item').forEach((el) => {
      el.addEventListener('click', () => {
        const conv = conversations.find((c) => c.user.id === Number(el.dataset.userId));
        switchToDm(conv.user.id, conv.user.display_name, conv.user.avatar_emoji);
      });
    });
  } catch {
    box.innerHTML = '<span style="color:var(--red);font-size:0.65rem;">Failed to load</span>';
  }
}

async function openNewDmModal() {
  const modal = document.getElementById('dm-new-backdrop');
  const box = document.getElementById('dm-new-list');
  box.innerHTML = '<span style="opacity:.4">Loading…</span>';
  modal.hidden = false;
  try {
    const res = await fetch('/api/team');
    const team = (await res.json()).filter((u) => u.id !== AUTH_USER_ID);
    box.innerHTML = team.map((u) => `
      <div class="chat-dm-item" data-user-id="${u.id}" data-name="${escapeHtml(u.display_name)}" data-avatar="${escapeHtml(u.avatar_emoji)}" style="border-bottom:1px solid var(--border);">
        <span class="avatar">${escapeHtml(u.avatar_emoji)}</span>
        <div class="meta"><div>${escapeHtml(u.display_name)}</div><div class="preview">${escapeHtml(u.role)}</div></div>
      </div>
    `).join('') || '<span style="opacity:.4">No one else on the team yet.</span>';
    box.querySelectorAll('.chat-dm-item').forEach((el) => {
      el.addEventListener('click', () => {
        switchToDm(Number(el.dataset.userId), el.dataset.name, el.dataset.avatar);
        modal.hidden = true;
        loadConversationList();
      });
    });
  } catch {
    box.innerHTML = '<span style="color:var(--red)">Failed to load team.</span>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateClock();
  setInterval(updateClock, 1000);

  document.querySelector('.chat-channel-item').addEventListener('click', switchToTeam);
  document.getElementById('dm-new-btn').addEventListener('click', openNewDmModal);
  document.getElementById('dm-new-close-btn').addEventListener('click', () => { document.getElementById('dm-new-backdrop').hidden = true; });

  loadChannel();
  loadConversationList();
  setInterval(pollNew, 4000);

  document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
});
