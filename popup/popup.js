// popup/popup.js
const $ = (id) => document.getElementById(id);

const els = {
  list: $('chat-list'),
  platform: $('platform-badge'),
  refresh: $('refresh-btn'),
  search: $('search-input'),
  selectAll: $('select-all'),
  deselectAll: $('deselect-all'),
  unpinnedOnly: $('unpinned-only'),
  scanStatus: $('scan-status'),
  selected: $('selected-count'),
  deleteBtn: $('delete-btn'),
  cancelBtn: $('cancel-btn'),
  progressWrap: $('progress-wrap'),
  progressFill: $('progress-fill'),
  progressText: $('progress-text'),
  confirmModal: $('confirm-modal'),
  confirmCount: $('confirm-count'),
  confirmCancel: $('confirm-cancel'),
  confirmOk: $('confirm-ok'),
};

const state = {
  chats: [],           // [{id,title,isPinned}]
  filtered: [],
  selected: new Set(),
  platformId: null,
  platformName: null,
  deleting: false,
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function setStatus(text) { els.scanStatus.textContent = text; }

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, (res) => {
      if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
      resolve(res || { ok: false, error: 'no-response' });
    });
  });
}

function applyFilter() {
  const q = els.search.value.trim().toLowerCase();
  state.filtered = !q
    ? state.chats
    : state.chats.filter((c) => c.title.toLowerCase().includes(q));
  render();
}

function updateCounts() {
  els.selected.textContent = state.selected.size;
  els.deleteBtn.disabled = state.selected.size === 0 || state.deleting;
  els.cancelBtn.classList.toggle('hidden', !state.deleting);
  els.deleteBtn.classList.toggle('hidden', state.deleting);
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------
function render() {
  els.list.innerHTML = '';

  if (state.filtered.length === 0) {
    const msg = state.chats.length === 0
      ? 'No chats found on this page.'
      : 'No chats match your search.';
    els.list.innerHTML = `<li class="loading-state">${msg}</li>`;
    updateCounts();
    return;
  }

  const frag = document.createDocumentFragment();
  for (const chat of state.filtered) {
    const li = document.createElement('li');
    li.className = 'chat-item' + (chat.isPinned ? ' pinned' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.id = chat.id;
    cb.checked = state.selected.has(chat.id);
    cb.disabled = chat.isPinned || state.deleting;
    cb.addEventListener('change', () => {
      if (cb.checked) state.selected.add(chat.id);
      else state.selected.delete(chat.id);
      updateCounts();
    });

    const label = document.createElement('label');
    label.className = 'chat-title';
    label.title = chat.title;
    label.textContent = (chat.isPinned ? '🔒 ' : '') + chat.title;

    li.appendChild(cb);
    li.appendChild(label);
    frag.appendChild(li);
  }
  els.list.appendChild(frag);
  updateCounts();
}

// ---------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------
async function scanChats({ silent = false } = {}) {
  if (!silent) {
    els.list.innerHTML = `<li class="loading-state">Scanning active AI platform…</li>`;
    setStatus('Scanning…');
  }
  els.refresh.classList.add('spinning');
  state.selected.clear();

  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) {
    els.platform.textContent = 'No tab';
    els.list.innerHTML = `<li class="loading-state">No active tab.</li>`;
    els.refresh.classList.remove('spinning');
    return;
  }

  // Ping content script first (may not be injected yet after refresh)
  let ping = await sendToTab(tab.id, { action: 'PING' });
  if (!ping?.ok) {
    // Try to inject manually
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['scripts/content.js'],
      });
      ping = await sendToTab(tab.id, { action: 'PING' });
    } catch (_) {}
  }

  if (!ping?.ok) {
    els.platform.textContent = 'Unsupported';
    els.list.innerHTML = `<li class="loading-state">Open Gemini, ChatGPT, Claude, Perplexity, or DeepSeek to use this extension.</li>`;
    setStatus('Unsupported page');
    els.refresh.classList.remove('spinning');
    return;
  }

  els.platform.textContent = ping.platform || 'Ready';
  const res = await sendToTab(tab.id, { action: 'SCAN_CHATS' });
  els.refresh.classList.remove('spinning');

  if (!res?.ok) {
    els.list.innerHTML = `<li class="loading-state">Scan failed: ${res?.error || 'unknown'}</li>`;
    setStatus('Scan failed');
    return;
  }

  state.chats = res.chats || [];
  state.platformId = res.platformId;
  state.platformName = res.platform;
  els.platform.textContent = res.platform || 'Ready';
  setStatus(
    `${state.chats.length} chats loaded${res.elapsedMs ? ` · ${res.elapsedMs}ms` : ''}`
  );
  applyFilter();
}

// ---------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------
function selectAllVisible() {
  for (const c of state.filtered) {
    if (!c.isPinned) state.selected.add(c.id);
  }
  render();
}
function deselectAll() { state.selected.clear(); render(); }
function selectUnpinnedOnly() {
  state.selected.clear();
  for (const c of state.chats) {
    if (!c.isPinned) state.selected.add(c.id);
  }
  render();
}

// ---------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------
function openConfirm() {
  if (state.selected.size === 0) return;
  els.confirmCount.textContent = state.selected.size;
  els.confirmModal.classList.remove('hidden');
}
function closeConfirm() { els.confirmModal.classList.add('hidden'); }

async function runDeletion() {
  closeConfirm();
  state.deleting = true;
  els.progressWrap.classList.remove('hidden');
  els.progressFill.style.width = '0%';
  els.progressText.textContent = `0 / ${state.selected.size}`;
  updateCounts();

  const tab = await getActiveTab();
  const ids = Array.from(state.selected);

  // Fire-and-listen: content script streams DELETE_PROGRESS messages
  const result = await sendToTab(tab.id, { action: 'DELETE_CHATS', ids });

  state.deleting = false;
  els.progressWrap.classList.add('hidden');
  updateCounts();

  if (result?.ok) {
    setStatus(
      `Deleted ${result.result.ok} · Failed ${result.result.failed}` +
        (result.result.cancelled ? ' · Cancelled' : '')
    );
  } else {
    setStatus(`Delete failed: ${result?.error || 'unknown'}`);
  }

  // Rescan after deletion
  await scanChats({ silent: true });
}

async function cancelDeletion() {
  const tab = await getActiveTab();
  if (tab?.id) await sendToTab(tab.id, { action: 'CANCEL_DELETE' });
  setStatus('Cancelling…');
}

// ---------------------------------------------------------------
// Global message listener (progress + scan progress)
// ---------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === 'DELETE_PROGRESS') {
    const { current, total } = msg;
    const pct = total ? Math.round((current / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `${current} / ${total} · ✓${msg.ok} ✗${msg.failed}`;
  }
  if (msg?.action === 'SCAN_PROGRESS') {
    setStatus(`Loading chats… (${msg.count} found)`);
  }
});

// ---------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------
els.refresh.addEventListener('click', () => scanChats());
els.search.addEventListener('input', applyFilter);
els.selectAll.addEventListener('click', selectAllVisible);
els.deselectAll.addEventListener('click', deselectAll);
els.unpinnedOnly.addEventListener('click', selectUnpinnedOnly);
els.deleteBtn.addEventListener('click', openConfirm);
els.confirmCancel.addEventListener('click', closeConfirm);
els.confirmOk.addEventListener('click', runDeletion);
els.cancelBtn.addEventListener('click', cancelDeletion);

document.addEventListener('DOMContentLoaded', () => scanChats());