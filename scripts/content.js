// scripts/content.js — OmniDelete AI v1.4
// FIX: stale-instance detection. Re-injection ab kaam karega.

(function () {
  'use strict';

  const VERSION = '1.4.0';
  const LOG = `[OmniDelete AI v${VERSION}]`;

  // ---- Unique ID for THIS injection ----
  const INSTANCE_ID = 'od_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const LATEST_KEY = '__OD_LATEST_INSTANCE__';

  console.log(`${LOG} booting instance ${INSTANCE_ID}`);

  // ---- Cleanup: remove any old overlay DOM ----
  document.querySelectorAll('#omnidelete-ai-root').forEach((n) => n.remove());

  // ---- Register ourselves as latest ----
  // Any listener from a previous injection checks this and stays silent.
  window[LATEST_KEY] = INSTANCE_ID;

  // ---- Everything from here is the same as before ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // =========================================================
  //  ADAPTERS  (copy exactly from previous version — unchanged)
  // =========================================================
  const BaseAdapter = {
    id: 'base', name: 'Unknown',
    match: () => false,
    getScrollContainer() { return null; },
    scan() { return []; },
    async openItemMenu() { return false; },
    async clickDeleteInMenu() { return false; },
    async confirmDeleteDialog() { return false; },
    async waitForRemoval(link, timeout = 4000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        if (!document.body.contains(link)) return true;
        await sleep(120);
      }
      return false;
    },
  };

  const Gemini = Object.create(BaseAdapter);
  Object.assign(Gemini, {
    id: 'gemini', name: 'Gemini',
    match: () => location.hostname.includes('gemini.google.com'),

    getScrollContainer() {
      const candidates = [
        'side-navigation-v2 [role="list"]',
        'side-navigation-v2 .scrollable',
        'side-navigation-v2',
        '[role="navigation"]',
      ];
      for (const sel of candidates) {
        const el = $(sel);
        if (el && el.scrollHeight > el.clientHeight + 20) return el;
      }
      for (const el of $$('*')) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 40 &&
            el.clientHeight > 200 &&
            el.getBoundingClientRect().left < 420) {
          return el;
        }
      }
      return null;
    },

    scan() {
      const out = [];
      const seen = new Set();
      $$('a[href*="/app/"]').forEach((a, i) => {
        const href = a.getAttribute('href') || '';
        if (!href || href === '/app' || seen.has(href)) return;
        const titleEl =
          a.querySelector('[class*="title"]') || a.querySelector('span, div');
        let title = (titleEl?.innerText || a.innerText || '').trim();
        if (!title) title = a.getAttribute('aria-label') || `Untitled ${i + 1}`;
        if (/^new chat$/i.test(title)) return;
        seen.add(href);
        const isPinned =
          !!a.querySelector('[aria-label*="Unpin" i], [class*="pinned" i]') ||
          /pin/i.test(a.getAttribute('aria-label') || '');
        out.push({ id: href, title, isPinned });
      });
      return out;
    },

    async openItemMenu(link) {
      if (!link || !document.body.contains(link)) return false;
      try { link.scrollIntoView({ block: 'center', behavior: 'instant' }); }
      catch { link.scrollIntoView({ block: 'center' }); }
      await sleep(280);
      if (!document.body.contains(link)) return false;

      const container =
        link.closest('li, [role="listitem"], [role="option"]') ||
        link.parentElement;
      if (!container) return false;
      const itemRect = container.getBoundingClientRect();
      if (itemRect.width < 20 || itemRect.height < 10) return false;

      const cx = itemRect.right - 20;
      const cy = itemRect.top + itemRect.height / 2;
      for (const type of ['pointerover','pointerenter','mouseover','mouseenter','mousemove']) {
        try {
          container.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: cx, clientY: cy }));
        } catch (_) {}
      }
      try {
        link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        link.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      } catch (_) {}
      await sleep(320);

      const itemRectNow = container.getBoundingClientRect();
      const rowTop = itemRectNow.top + 2;
      const rowBottom = itemRectNow.bottom - 2;

      const allBtns = $$('button', container);
      const inRow = allBtns.filter((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const midY = r.top + r.height / 2;
        return midY >= rowTop && midY <= rowBottom;
      });

      let menuBtn = inRow.find((b) => {
        const al = (b.getAttribute('aria-label') || '').toLowerCase();
        return al.includes('option') || al.includes('more') || al.includes('menu') || al.includes('actions');
      });
      if (!menuBtn && inRow.length) {
        menuBtn = inRow.reduce((acc, b) => {
          const rb = b.getBoundingClientRect();
          const ra = acc.getBoundingClientRect();
          return rb.right > ra.right ? b : acc;
        });
      }
      if (!menuBtn) { console.warn(LOG, 'no menu button for', link.href); return false; }

      const mbRect = menuBtn.getBoundingClientRect();
      const itemMidY = itemRectNow.top + itemRectNow.height / 2;
      const mbMidY = mbRect.top + mbRect.height / 2;
      if (Math.abs(mbMidY - itemMidY) > 30) {
        console.warn(LOG, 'menu btn too far — abort');
        return false;
      }

      const prevOutline = container.style.outline;
      container.style.outline = '2px solid #f28b82';
      container.style.borderRadius = '8px';
      setTimeout(() => {
        container.style.outline = prevOutline;
        container.style.borderRadius = '';
      }, 1800);

      menuBtn.click();
      const menu = await waitForMenuNear(mbRect, 2000);
      if (!menu) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      return true;
    },

    async clickDeleteInMenu() {
      const menu = await waitForMenuNear(null, 800, true);
      if (!menu) return false;
      for (const it of $$('[role="menuitem"], .mat-mdc-menu-item, button', menu)) {
        const t = (it.getAttribute('aria-label') || it.innerText || '').trim().toLowerCase();
        if (t === 'delete' || t.includes('delete chat') || t.startsWith('delete ')) {
          it.click();
          return true;
        }
      }
      return false;
    },

    async confirmDeleteDialog(expectedTitle) {
      await sleep(420);
      const dialog = $('mat-dialog-container') || $('[role="dialog"]');
      if (!dialog) return false;

      const dialogText = (dialog.innerText || '').replace(/\s+/g, ' ').trim();
      if (expectedTitle && dialogText.length > 5) {
        const expected = expectedTitle.trim().toLowerCase();
        const quoted = dialogText.match(/[“"']([^”"']{3,})[”"']/);
        if (quoted) {
          const shown = quoted[1].trim().toLowerCase();
          const match = shown.includes(expected.slice(0, 25)) || expected.includes(shown.slice(0, 25));
          if (!match) {
            console.error(LOG, '❌ dialog title mismatch', { shown, expected });
            const cancelBtn = $$('button', dialog).find((b) => /cancel/i.test(b.innerText || ''));
            if (cancelBtn) cancelBtn.click();
            return false;
          }
        }
      }

      for (const b of $$('button, [role="button"]', dialog)) {
        const t = (b.innerText || '').trim().toLowerCase();
        if (t === 'delete' || t === 'yes, delete' || t.includes('delete chat')) {
          b.click();
          return true;
        }
      }
      return false;
    },
  });

  const ChatGPT = Object.create(BaseAdapter);
  Object.assign(ChatGPT, {
    id: 'chatgpt', name: 'ChatGPT',
    match: () => /chatgpt\.com|chat\.openai\.com/.test(location.hostname),
    scan() {
      const out = [], seen = new Set();
      $$('a[href^="/c/"]').forEach((a, i) => {
        const href = a.getAttribute('href') || '';
        if (!href || seen.has(href)) return;
        seen.add(href);
        out.push({ id: href, title: (a.innerText || '').trim() || `Untitled ${i + 1}`, isPinned: false });
      });
      return out;
    },
    async openItemMenu(link) {
      return Claude.openItemMenu.call(this, link);
    },
    async clickDeleteInMenu() {
      return Claude.clickDeleteInMenu.call(this);
    },
    async confirmDeleteDialog(expectedTitle) {
      return Claude.confirmDeleteDialog.call(this, expectedTitle);
    },
  });

  // ================= CLAUDE =================
  const Claude = Object.create(BaseAdapter);
  Object.assign(Claude, {
    id: 'claude',
    name: 'Claude',
    match: () => location.hostname.includes('claude.ai'),

    getScrollContainer() {
      const candidates = [
        'nav[aria-label*="sidebar" i]',
        'nav[aria-label*="conversation" i]',
        '[class*="sidebar"] [class*="scroll"]',
        '[class*="sidebar"]',
      ];
      for (const sel of candidates) {
        const el = $(sel);
        if (el && el.scrollHeight > el.clientHeight + 20) return el;
      }
      for (const el of $$('*')) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 40 &&
            el.clientHeight > 200 &&
            el.getBoundingClientRect().left < 420) {
          return el;
        }
      }
      return null;
    },

    scan() {
      const out = [];
      const seen = new Set();
      const selectors = [
        'nav a[href*="/chat/"]',
        'nav a[href*="/c/"]',
        '[data-testid*="conversation"]',
        'a[href*="/chat/"]',
        'a[href*="/c/"]',
      ];
      let links = [];
      for (const sel of selectors) {
        const found = $$(sel);
        if (found.length > links.length) links = found;
      }
      links.forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (!href || seen.has(href)) return;
        const title = (a.innerText || a.getAttribute('aria-label') || '').trim();
        if (!title || /new chat|settings|help/i.test(title)) return;
        seen.add(href);
        const isPinned =
          !!a.querySelector('[aria-label*="Unpin" i], [class*="pinned" i]') ||
          /pin/i.test(a.getAttribute('aria-label') || '');
        out.push({ id: href, title, isPinned });
      });
      return out;
    },

    async openItemMenu(link) {
      if (!link || !document.body.contains(link)) {
        console.warn(LOG, `[${this.id}] link missing`);
        return false;
      }
      try { link.scrollIntoView({ block: 'center', behavior: 'instant' }); }
      catch { link.scrollIntoView({ block: 'center' }); }
      await sleep(300);

      const linkRect = link.getBoundingClientRect();
      if (linkRect.height < 5) {
        console.warn(LOG, `[${this.id}] link has no size`);
        return false;
      }
      const linkMidY = linkRect.top + linkRect.height / 2;
      const hoverX = linkRect.right - 15;
      const hoverY = linkMidY;

      // Realistic hover on the link and its ancestors reveals hidden actions.
      let walker = link;
      for (let i = 0; i < 3 && walker; i++, walker = walker.parentElement) {
        for (const type of ['mouseover', 'mouseenter', 'mousemove',
          'pointerover', 'pointerenter', 'pointermove']) {
          try {
            const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
            walker.dispatchEvent(new Ev(type, {
              bubbles: true, cancelable: true, clientX: hoverX, clientY: hoverY,
            }));
          } catch (_) {}
        }
      }
      await sleep(350);

      const ancestors = [];
      let cur = link.parentElement;
      for (let i = 0; i < 3 && cur; i++, cur = cur.parentElement) ancestors.push(cur);

      const searchRoots = [link, ...ancestors];
      let candidates = [];
      for (const root of searchRoots) {
        const btns = $$('button, [role="button"], [role="menuitem"]', root);
        for (const b of btns) {
          const r = b.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const midY = r.top + r.height / 2;
          if (Math.abs(midY - linkMidY) > 40) continue;
          if (candidates.includes(b)) continue;
          candidates.push(b);
        }
        if (candidates.length > 0) break;
      }

      if (candidates.length === 0) {
        console.warn(LOG, `[${this.id}] no buttons found near item`, {
          title: link.innerText?.slice(0, 40),
        });
        return false;
      }

      let menuBtn = candidates.find((b) => {
        const al = (
          b.getAttribute('aria-label') ||
          b.getAttribute('title') ||
          b.querySelector('[aria-label], [title]')?.getAttribute('aria-label') ||
          ''
        ).toLowerCase();
        return al.includes('option') || al.includes('more') ||
          al.includes('menu') || al.includes('action') ||
          al.includes('delete') || al.includes('⋯') || al.includes('…');
      });

      if (!menuBtn) {
        menuBtn = candidates.reduce((acc, b) => {
          const rb = b.getBoundingClientRect();
          const ra = acc.getBoundingClientRect();
          return rb.right > ra.right ? b : acc;
        });
      }

      console.log(LOG, `[${this.id}] clicking menu button`, {
        count: candidates.length,
        chosen: menuBtn.outerHTML.slice(0, 120),
        title: (link.innerText || '').slice(0, 40),
      });

      const container = link.closest('li, [role="listitem"], a') || link.parentElement;
      if (container) {
        const prevOutline = container.style.outline;
        container.style.outline = '2px solid #f28b82';
        container.style.borderRadius = '8px';
        setTimeout(() => {
          container.style.outline = prevOutline;
          container.style.borderRadius = '';
        }, 1800);
      }

      activateElement(menuBtn);
      const menu = await waitForMenuNear(menuBtn.getBoundingClientRect(), 2500, true);
      if (!menu) {
        console.warn(LOG, `[${this.id}] ❌ menu did not open after click`);
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      console.log(LOG, `[${this.id}] ✓ menu opened`);
      return true;
    },

    async clickDeleteInMenu() {
      const menu = await waitForMenuNear(null, 800, true);
      if (!menu) return false;
      const items = $$('[role="menuitem"], button, [role="option"], [role="menuitemcheckbox"], [data-testid*="delete" i]', menu);
      for (const it of items) {
        const text = (it.getAttribute('aria-label') || it.innerText || '').trim().toLowerCase();
        if (text === 'delete' || text.includes('delete chat') || text.includes('delete thread') ||
            text.startsWith('delete')) {
          activateElement(it);
          return true;
        }
      }
      console.warn(LOG, 'delete menu item not found', {
        platform: this.id,
        items: items.map((it) => (it.innerText || it.getAttribute('aria-label') || '').trim()).filter(Boolean),
      });
      return false;
    },

    async confirmDeleteDialog(expectedTitle) {
      await sleep(650);
      const dialog = $('[role="dialog"]') || $('[role="alertdialog"]') ||
        $('div[class*="modal" i]') || $('[data-testid*="modal" i]');
      if (!dialog) {
        console.warn(LOG, 'delete confirmation dialog not found', { platform: this.id });
        return false;
      }
      const dialogText = (dialog.innerText || '').replace(/\s+/g, ' ').trim();
      if (expectedTitle && dialogText.length > 5) {
        const expected = expectedTitle.trim().toLowerCase();
        const quoted = dialogText.match(/[“"']([^”"']{3,})[”"']/);
        if (quoted && !quoted[1].toLowerCase().includes(expected.slice(0, 20))) {
          console.error('[OmniDelete AI] dialog title mismatch — aborting');
          const cancelBtn = $$('button', dialog).find((b) => /cancel/i.test(b.innerText || ''));
          if (cancelBtn) activateElement(cancelBtn);
          return false;
        }
      }
      for (const b of $$('button, [role="button"], [data-testid*="delete" i]', dialog)) {
        const text = (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
        if (text === 'delete' || text === 'yes, delete' || text.includes('delete') ||
            text.includes('remove')) {
          activateElement(b);
          return true;
        }
      }
      console.warn(LOG, 'delete confirmation button not found', { platform: this.id });
      return false;
    },
  });

  // ================= PERPLEXITY =================
  const Perplexity = Object.create(BaseAdapter);
  Object.assign(Perplexity, {
    id: 'perplexity',
    name: 'Perplexity',
    match: () => location.hostname.includes('perplexity.ai'),

    getScrollContainer() {
      const candidates = [
        'nav[aria-label*="thread" i]',
        '[class*="sidebar"] [class*="scroll"]',
        '[class*="sidebar"]',
        '[class*="library"]',
      ];
      for (const sel of candidates) {
        const el = $(sel);
        if (el && el.scrollHeight > el.clientHeight + 20) return el;
      }
      for (const el of $$('*')) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 40 &&
            el.clientHeight > 200 &&
            el.getBoundingClientRect().left < 420) {
          return el;
        }
      }
      return null;
    },

    scan() {
      const out = [];
      const seen = new Set();
      const selectors = [
        'a[href*="/search/"]',
        'a[href*="/thread/"]',
        'a[href*="/library/"]',
        '[data-testid*="thread"]',
      ];
      let links = [];
      for (const sel of selectors) {
        const found = $$(sel);
        if (found.length > links.length) links = found;
      }
      links.forEach((a) => {
        const href = a.getAttribute('href') || '';
        if (!href || seen.has(href)) return;
        const title = (a.innerText || a.getAttribute('aria-label') || '').trim();
        if (!title || /new thread|home|discover|spaces/i.test(title)) return;
        seen.add(href);
        out.push({ id: href, title, isPinned: false });
      });
      return out;
    },

    async openItemMenu(link) { return Claude.openItemMenu.call(this, link); },
    async clickDeleteInMenu() { return Claude.clickDeleteInMenu.call(this); },
    async confirmDeleteDialog(expectedTitle) {
      return Claude.confirmDeleteDialog.call(this, expectedTitle);
    },
  });

  // ================= DEEPSEEK =================
  const DeepSeek = Object.create(BaseAdapter);
  Object.assign(DeepSeek, {
    id: 'deepseek',
    name: 'DeepSeek',
    match: () => location.hostname.includes('chat.deepseek.com') ||
      location.hostname.includes('deepseek.com'),

    getScrollContainer() {
      const candidates = [
        'nav[aria-label*="sidebar" i]',
        '[class*="sidebar"] [class*="scroll"]',
        '[class*="sidebar"]',
        '[class*="history"]',
      ];
      for (const sel of candidates) {
        const el = $(sel);
        if (el && el.scrollHeight > el.clientHeight + 20) return el;
      }
      for (const el of $$('*')) {
        const cs = getComputedStyle(el);
        if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 40 &&
            el.clientHeight > 200 &&
            el.getBoundingClientRect().left < 420) {
          return el;
        }
      }
      return null;
    },

    scan() {
      const out = [];
      const seen = new Set();
      const selectors = [
        'a[href*="/chat/"]',
        'a[href*="/conversation/"]',
        '[class*="conversation"]',
        '[class*="history"] a',
      ];
      let links = [];
      for (const sel of selectors) {
        const found = $$(sel);
        if (found.length > links.length) links = found;
      }
      links.forEach((a, i) => {
        const href = a.getAttribute('href') || '';
        const title = (a.innerText || a.getAttribute('aria-label') || '').trim();
        if (!title || /new chat|settings|help/i.test(title)) return;
        const id = href || `deepseek-${i}-${title.slice(0, 20)}`;
        if (seen.has(id)) return;
        seen.add(id);
        out.push({ id, title, isPinned: false });
      });
      return out;
    },

    async openItemMenu(link) { return Claude.openItemMenu.call(this, link); },
    async clickDeleteInMenu() { return Claude.clickDeleteInMenu.call(this); },
    async confirmDeleteDialog(expectedTitle) {
      return Claude.confirmDeleteDialog.call(this, expectedTitle);
    },
  });

  const ADAPTERS = [Gemini, ChatGPT, Claude, Perplexity, DeepSeek];
  const adapter = ADAPTERS.find((a) => a.match()) || null;

  // ---------- menu helper ----------
  async function waitForMenuNear(anchorRect, timeout = 2000, anyOpen = false) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const menu = $$('[role="menu"], [role="listbox"], .mat-mdc-menu-panel, .cdk-overlay-pane, [data-radix-menu-content], [data-floating-ui-portal], [data-state="open"]')
        .find((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 20 && r.height > 20 &&
            getComputedStyle(el).visibility !== 'hidden';
        });
      if (menu) {
        if (anyOpen || !anchorRect) return menu;
        const mr = menu.getBoundingClientRect();
        const anchorMid = anchorRect.top + anchorRect.height / 2;
        const menuMid = mr.top + mr.height / 2;
        if (Math.abs(menuMid - anchorMid) < 200) return menu;
      }
      await sleep(80);
    }
    return null;
  }

  function activateElement(element) {
    if (!element) return;
    try { element.focus({ preventScroll: true }); } catch (_) {}
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      try { element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); }
      catch (_) {}
    }
    element.click();
  }

  // ---------- scan ----------
  async function autoScrollAll(container, onProgress) {
    const originalScrollTop = container.scrollTop;
    let stableRounds = 0, rounds = 0, lastCount = 0;
    const MAX_ROUNDS = 25;
    try {
      container.scrollTop = 0;
      await sleep(300);
      while (rounds < MAX_ROUNDS && stableRounds < 3) {
        rounds++;
        const count = adapter.scan().length;
        if (count === lastCount) stableRounds++;
        else stableRounds = 0;
        lastCount = count;
        onProgress?.({ round: rounds, count });
        const before = container.scrollTop;
        const step = Math.max(300, Math.round(container.clientHeight * 0.85));
        container.scrollTop = Math.min(container.scrollTop + step, container.scrollHeight);
        await sleep(520);
        if (container.scrollTop === before) {
          await sleep(520);
          if (container.scrollTop === before) break;
        }
      }
    } finally {
      container.scrollTop = originalScrollTop;
      await sleep(150);
    }
    return { rounds, count: adapter.scan().length };
  }

  async function scanChats({ loadAll = false, onProgress } = {}) {
    if (!adapter) return { ok: false, error: 'Unsupported platform', chats: [] };
    const t0 = performance.now();
    let scrollInfo = null;
    if (loadAll) {
      const c = adapter.getScrollContainer();
      if (c) scrollInfo = await autoScrollAll(c, onProgress);
    }
    const chats = adapter.scan();
    return {
      ok: true,
      platform: adapter.name,
      platformId: adapter.id,
      chats,
      scrollInfo,
      elapsedMs: Math.round(performance.now() - t0),
    };
  }

  // ---------- delete engine ----------
  const delState = { running: false, cancel: false };

  async function deleteOne(id, expectedTitle) {
    console.log(LOG, `[delete] → start`, { id, title: expectedTitle });

    let item = findConversationElement(id, expectedTitle);
    if (!item) {
      console.log(LOG, `[delete] item not in DOM, scrolling to find…`);
      item = await findConversationByScrolling(id, expectedTitle);
      if (!item) {
        console.warn(LOG, `[delete] ❌ not-in-dom`, { id });
        return { ok: false, reason: 'not-in-dom' };
      }
    }
    console.log(LOG, `[delete] item found`, { href: item.getAttribute?.('href') });

    const okMenu = await adapter.openItemMenu(item);
    if (!okMenu) {
      console.warn(LOG, `[delete] ❌ menu-open-failed`);
      return { ok: false, reason: 'menu-open-failed' };
    }
    console.log(LOG, `[delete] ✓ menu opened, clicking delete`);

    const okDel = await adapter.clickDeleteInMenu();
    if (!okDel) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      console.warn(LOG, `[delete] ❌ delete-item-missing`);
      return { ok: false, reason: 'delete-item-missing' };
    }
    console.log(LOG, `[delete] ✓ delete clicked, confirming`);

    const okConfirm = await adapter.confirmDeleteDialog(expectedTitle);
    if (!okConfirm) {
      console.warn(LOG, `[delete] ❌ confirm-aborted`);
      return { ok: false, reason: 'confirm-aborted' };
    }
    console.log(LOG, `[delete] ✓ confirm clicked, waiting for removal`);

    const still = findConversationElement(id, expectedTitle);
    if (still) {
      const gone = await adapter.waitForRemoval(still, 4500);
      console.log(LOG, `[delete] removal wait →`, gone ? 'gone' : 'still-present');
      return gone ? { ok: true } : { ok: false, reason: 'still-present' };
    }
    console.log(LOG, `[delete] ✓ done (item already gone)`);
    return { ok: true };
  }

  function findConversationElement(id, expectedTitle) {
    const escapedId = CSS.escape(id);
    const exact = $(`a[href="${escapedId}"]`);
    if (exact) return exact;
    if (!expectedTitle) return null;
    const wanted = expectedTitle.trim().toLowerCase();
    const candidates = $$('a[href], [data-testid*="conversation" i], [data-testid*="thread" i], [class*="conversation" i], [class*="thread" i]');
    return candidates.find((el) => {
      const text = (el.innerText || el.getAttribute('aria-label') || '').trim().toLowerCase();
      return text === wanted || text.includes(wanted) || wanted.includes(text);
    }) || null;
  }

  async function findConversationByScrolling(id, expectedTitle) {
    const container = adapter.getScrollContainer();
    if (!container) return null;
    const saved = container.scrollTop;
    try {
      container.scrollTop = 0;
      await sleep(250);
      for (let i = 0; i < 40; i++) {
        const found = findConversationElement(id, expectedTitle);
        if (found) return found;
        const before = container.scrollTop;
        container.scrollTop = Math.min(
          container.scrollTop + Math.max(300, container.clientHeight * 0.85),
          container.scrollHeight
        );
        await sleep(300);
        if (container.scrollTop === before) break;
      }
    } finally {
      container.scrollTop = saved;
      await sleep(120);
    }
    return findConversationElement(id, expectedTitle);
  }

  async function runDelete(items, onProgress) {
    delState.running = true;
    delState.cancel = false;
    let ok = 0, failed = 0;
    for (let i = 0; i < items.length; i++) {
      if (delState.cancel) {
        onProgress?.({ current: i, total: items.length, ok, failed, cancelled: true });
        break;
      }
      const it = items[i];
      const res = await deleteOne(it.id, it.title);
      if (res.ok) ok++; else failed++;
      onProgress?.({ current: i + 1, total: items.length, ok, failed, status: res.reason || 'ok', title: it.title });
      await sleep(800 + Math.floor(Math.random() * 400));
    }
    delState.running = false;
    return { ok, failed, cancelled: delState.cancel };
  }

  // =========================================================
  //  OVERLAY UI
  // =========================================================
  let hostEl, shadow;
  const ui = {};
  const ov = { chats: [], filtered: [], selected: new Map(), deleting: false };

  function ensureOverlay() {
    if (hostEl && document.body.contains(hostEl)) return;
    hostEl = document.createElement('div');
    hostEl.id = 'omnidelete-ai-root';
    document.documentElement.appendChild(hostEl);
    shadow = hostEl.attachShadow({ mode: 'open' });
    shadow.innerHTML = overlayHTML();

    ui.panel = shadow.querySelector('.od-panel');
    ui.platform = shadow.querySelector('.od-platform');
    ui.refresh = shadow.querySelector('.od-refresh');
    ui.close = shadow.querySelector('.od-close');
    ui.search = shadow.querySelector('.od-search');
    ui.list = shadow.querySelector('.od-list');
    ui.status = shadow.querySelector('.od-status');
    ui.selectAll = shadow.querySelector('.od-select-all');
    ui.deselectAll = shadow.querySelector('.od-deselect-all');
    ui.unpinned = shadow.querySelector('.od-unpinned');
    ui.selectedCount = shadow.querySelector('.od-selected-count');
    ui.deleteBtn = shadow.querySelector('.od-delete-btn');
    ui.cancelBtn = shadow.querySelector('.od-cancel-btn');
    ui.progressWrap = shadow.querySelector('.od-progress-wrap');
    ui.progressFill = shadow.querySelector('.od-progress-fill');
    ui.progressText = shadow.querySelector('.od-progress-text');
    ui.confirmModal = shadow.querySelector('.od-modal');
    ui.confirmList = shadow.querySelector('.od-confirm-list');
    ui.confirmCount = shadow.querySelector('.od-confirm-count');
    ui.confirmCancel = shadow.querySelector('.od-confirm-cancel');
    ui.confirmOk = shadow.querySelector('.od-confirm-ok');

    bindOverlayEvents();
    makeDraggable(ui.panel, shadow.querySelector('.od-header'));
    ui.panel.classList.add('od-open');
  }

  function applyFilter() {
    const q = ui.search.value.trim().toLowerCase();
    ov.filtered = !q ? ov.chats : ov.chats.filter((c) => c.title.toLowerCase().includes(q));
    renderList();
  }

  function updateCounts() {
    ui.selectedCount.textContent = ov.selected.size;
    ui.deleteBtn.disabled = ov.selected.size === 0 || ov.deleting;
    ui.deleteBtn.classList.toggle('od-hidden', ov.deleting);
    ui.cancelBtn.classList.toggle('od-hidden', !ov.deleting);
  }

  function renderList() {
    ui.list.innerHTML = '';
    if (ov.filtered.length === 0) {
      ui.list.innerHTML = `<li class="od-empty">${ov.chats.length === 0 ? 'No chats found. Click ⟳ to load.' : 'No chats match your search.'}</li>`;
      updateCounts();
      return;
    }
    const frag = document.createDocumentFragment();
    for (const c of ov.filtered) {
      const li = document.createElement('li');
      li.className = 'od-item' + (c.isPinned ? ' od-pinned' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = ov.selected.has(c.id);
      cb.disabled = c.isPinned || ov.deleting;
      cb.addEventListener('change', () => {
        if (cb.checked) ov.selected.set(c.id, { id: c.id, title: c.title });
        else ov.selected.delete(c.id);
        updateCounts();
      });
      const label = document.createElement('span');
      label.className = 'od-title';
      label.textContent = (c.isPinned ? '🔒 ' : '') + c.title;
      label.title = c.title;
      li.append(cb, label);
      frag.appendChild(li);
    }
    ui.list.appendChild(frag);
    updateCounts();
  }

  async function doScan({ silent = false } = {}) {
    if (!adapter) {
      ui.platform.textContent = 'Unsupported';
      ui.list.innerHTML = `<li class="od-empty">Open Gemini, ChatGPT, Claude, Perplexity, or DeepSeek.</li>`;
      return;
    }
    if (!silent) {
      ui.list.innerHTML = `<li class="od-empty">Loading all chats…</li>`;
      ui.status.textContent = 'Auto-scrolling…';
    }
    ui.refresh.classList.add('od-spin');
    ov.selected.clear();
    const res = await scanChats({
      loadAll: true,
      onProgress: (p) => (ui.status.textContent = `Loading… (${p.count} chats found)`),
    });
    ui.refresh.classList.remove('od-spin');
    if (!res.ok) {
      ui.list.innerHTML = `<li class="od-empty">Scan failed: ${res.error}</li>`;
      ui.status.textContent = 'Scan failed';
      return;
    }
    ov.chats = res.chats || [];
    ui.platform.textContent = res.platform || '—';
    ui.status.textContent = `${ov.chats.length} chats loaded` + (res.elapsedMs ? ` · ${res.elapsedMs}ms` : '');
    try {
      await chrome.storage.local.set({ [`backup_${res.platformId}_${Date.now()}`]: ov.chats });
    } catch (_) {}
    applyFilter();
  }

  function bindOverlayEvents() {
    ui.refresh.addEventListener('click', () => doScan());
    ui.close.addEventListener('click', () => ui.panel.classList.remove('od-open'));
    ui.search.addEventListener('input', applyFilter);
    ui.selectAll.addEventListener('click', () => {
      for (const c of ov.filtered) if (!c.isPinned) ov.selected.set(c.id, { id: c.id, title: c.title });
      renderList();
    });
    ui.deselectAll.addEventListener('click', () => { ov.selected.clear(); renderList(); });
    ui.unpinned.addEventListener('click', () => {
      ov.selected.clear();
      for (const c of ov.chats) if (!c.isPinned) ov.selected.set(c.id, { id: c.id, title: c.title });
      renderList();
    });
    ui.deleteBtn.addEventListener('click', () => {
      if (ov.selected.size === 0) return;
      const items = [...ov.selected.values()];
      ui.confirmCount.textContent = items.length;
      ui.confirmList.innerHTML = items.map((it) => `<li>${it.title.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</li>`).join('');
      ui.confirmModal.classList.add('od-open');
    });
    ui.confirmCancel.addEventListener('click', () => ui.confirmModal.classList.remove('od-open'));
    ui.confirmOk.addEventListener('click', async () => {
      ui.confirmModal.classList.remove('od-open');
      await runDeleteFlow();
    });
    ui.cancelBtn.addEventListener('click', () => {
      delState.cancel = true;
      ui.status.textContent = 'Cancelling…';
    });
  }

  async function runDeleteFlow() {
    ov.deleting = true;
    updateCounts();
    ui.progressWrap.classList.add('od-open');
    ui.progressFill.style.width = '0%';
    ui.progressText.textContent = `0 / ${ov.selected.size}`;
    const items = [...ov.selected.values()];
    const result = await runDelete(items, (p) => {
      const pct = p.total ? Math.round((p.current / p.total) * 100) : 0;
      ui.progressFill.style.width = `${pct}%`;
      ui.progressText.textContent = `${p.current} / ${p.total}  ·  ✓${p.ok} ✗${p.failed}`;
      if (p.title) ui.status.textContent = `Processing: ${p.title}`;
    });
    ov.deleting = false;
    ui.progressWrap.classList.remove('od-open');
    updateCounts();
    ui.status.textContent = `Done — deleted ${result.ok}, failed ${result.failed}` + (result.cancelled ? ' (cancelled)' : '');
    await sleep(600);
    await doScan({ silent: true });
  }

  function makeDraggable(panel, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button, input')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect();
      ox = r.left; oy = r.top;
      panel.style.right = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = `${ox + e.clientX - sx}px`;
      panel.style.top = `${oy + e.clientY - sy}px`;
    });
    window.addEventListener('mouseup', () => (dragging = false));
  }

  function overlayHTML() {
    return `
      <style>
        :host { all: initial; display: block; }
        * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
        .od-panel {
          position: fixed; top: 0; right: 0;
          width: 370px; height: 100vh;
          background: #1e1f20; color: #e3e3e3;
          border-left: 1px solid #35363a;
          box-shadow: -12px 0 40px rgba(0,0,0,0.45);
          display: none; flex-direction: column;
          z-index: 2147483647; font-size: 13px;
        }
        .od-panel.od-open { display: flex; }
        .od-header { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #26282a; border-bottom: 1px solid #35363a; user-select: none; }
        .od-dot { width: 8px; height: 8px; border-radius: 50%; background: #8ab4f8; box-shadow: 0 0 8px #8ab4f8; }
        .od-title-text { font-weight: 600; font-size: 13.5px; flex: 1; }
        .od-platform { background: #35363a; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #c4c7c5; }
        .od-refresh, .od-close { background: transparent; color: #c4c7c5; border: 1px solid #35363a; border-radius: 6px; width: 26px; height: 26px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }
        .od-refresh:hover, .od-close:hover { color: #8ab4f8; border-color: #8ab4f8; }
        .od-refresh.od-spin { animation: od-spin 1s linear infinite; }
        @keyframes od-spin { to { transform: rotate(360deg); } }
        .od-warn { background: rgba(242,139,130,0.12); border-bottom: 1px solid rgba(242,139,130,0.35); color: #f9b1a9; font-size: 11.5px; padding: 8px 14px; display: flex; align-items: center; gap: 6px; }
        .od-warn strong { color: #f28b82; }
        .od-search-wrap { padding: 10px 14px 0; }
        .od-search { width: 100%; background: #131314; border: 1px solid #35363a; border-radius: 8px; padding: 8px 10px; color: #e3e3e3; font-size: 12.5px; outline: none; }
        .od-search:focus { border-color: #8ab4f8; }
        .od-actions { display: flex; gap: 6px; padding: 10px 14px; flex-wrap: wrap; border-bottom: 1px solid #35363a; }
        .od-btn { background: transparent; color: #8ab4f8; border: 1px solid #35363a; border-radius: 6px; padding: 6px 10px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; }
        .od-btn:hover { background: rgba(138,180,248,0.1); border-color: #8ab4f8; }
        .od-status { padding: 6px 14px; font-size: 11px; color: #a8abaf; }
        .od-list { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1; min-height: 100px; }
        .od-list::-webkit-scrollbar { width: 6px; }
        .od-list::-webkit-scrollbar-thumb { background: #35363a; border-radius: 10px; }
        .od-item { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-bottom: 1px solid #26282a; }
        .od-item:hover { background: #2b2c2e; }
        .od-item input { width: 15px; height: 15px; accent-color: #8ab4f8; cursor: pointer; }
        .od-item.od-pinned { opacity: 0.7; }
        .od-title { flex: 1; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .od-empty { text-align: center; padding: 24px 16px; color: #a8abaf; font-size: 12px; }
        .od-progress-wrap { padding: 10px 14px; border-top: 1px solid #35363a; display: none; }
        .od-progress-wrap.od-open { display: block; }
        .od-progress-bar { height: 6px; background: #26282a; border-radius: 6px; overflow: hidden; }
        .od-progress-fill { height: 100%; width: 0%; background: linear-gradient(90deg,#8ab4f8,#c58af9); transition: width .2s; }
        .od-progress-text { margin-top: 6px; font-size: 11px; color: #a8abaf; text-align: center; }
        .od-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: #26282a; border-top: 1px solid #35363a; gap: 8px; }
        .od-footer-text { font-size: 12px; color: #a8abaf; }
        .od-danger { background: #f28b82; color: #131314; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; font-size: 12.5px; cursor: pointer; }
        .od-danger:hover:not(:disabled) { background: #ff9a92; }
        .od-danger:disabled { background: #35363a; color: #a8abaf; cursor: not-allowed; }
        .od-secondary { background: transparent; color: #8ab4f8; border: 1px solid #35363a; border-radius: 6px; padding: 8px 12px; font-size: 12.5px; cursor: pointer; }
        .od-hidden { display: none !important; }
        .od-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: none; align-items: center; justify-content: center; z-index: 2147483647; padding: 20px; }
        .od-modal.od-open { display: flex; }
        .od-modal-card { background: #1e1f20; border: 1px solid #35363a; border-radius: 12px; padding: 18px; max-width: 420px; width: 100%; max-height: 80vh; display: flex; flex-direction: column; }
        .od-modal-card h3 { margin: 0 0 8px; font-size: 14px; color: #f28b82; }
        .od-modal-card p { margin: 0 0 10px; color: #c4c7c5; font-size: 12.5px; line-height: 1.5; }
        .od-confirm-list { list-style: none; padding: 0; margin: 0 0 14px; max-height: 220px; overflow-y: auto; background: #131314; border: 1px solid #35363a; border-radius: 8px; font-size: 12px; }
        .od-confirm-list li { padding: 6px 10px; border-bottom: 1px solid #26282a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e3e3e3; }
        .od-confirm-list li:last-child { border-bottom: none; }
        .od-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
      </style>

      <div class="od-panel">
        <div class="od-header">
          <span class="od-dot"></span>
          <span class="od-title-text">OmniDelete AI</span>
          <span class="od-platform">Detecting…</span>
          <button class="od-refresh" title="Rescan">⟳</button>
          <button class="od-close" title="Close">✕</button>
        </div>
        <div class="od-warn">⚠️ <strong>Verify list before deleting.</strong> Pinned chats are locked. Deletion is permanent.</div>
        <div class="od-search-wrap"><input class="od-search" type="search" placeholder="Search chats…" autocomplete="off" /></div>
        <div class="od-actions">
          <button class="od-btn od-select-all">Select All</button>
          <button class="od-btn od-deselect-all">Deselect All</button>
          <button class="od-btn od-unpinned">Unpinned Only</button>
        </div>
        <div class="od-status">Ready</div>
        <ul class="od-list"><li class="od-empty">Click ⟳ to load all chats…</li></ul>
        <div class="od-progress-wrap">
          <div class="od-progress-bar"><div class="od-progress-fill"></div></div>
          <div class="od-progress-text">0 / 0</div>
        </div>
        <div class="od-footer">
          <span class="od-footer-text"><span class="od-selected-count">0</span> selected</span>
          <div style="display:flex;gap:6px;">
            <button class="od-secondary od-cancel-btn od-hidden">Cancel</button>
            <button class="od-danger od-delete-btn" disabled>Delete Selected</button>
          </div>
        </div>
      </div>

      <div class="od-modal">
        <div class="od-modal-card">
          <h3>⚠️ Confirm Deletion</h3>
          <p>You are about to permanently delete <strong><span class="od-confirm-count">0</span> chat(s)</strong>. This cannot be undone:</p>
          <ul class="od-confirm-list"></ul>
          <div class="od-modal-actions">
            <button class="od-secondary od-confirm-cancel">Cancel</button>
            <button class="od-danger od-confirm-ok">Yes, Delete All</button>
          </div>
        </div>
      </div>
    `;
  }

  // =========================================================
  //  MESSAGE BRIDGE — guarded against stale instances
  // =========================================================
  chrome.runtime.onMessage.addListener((req, _sender, respond) => {
    // If a newer injection took over, this listener stays silent.
    if (window[LATEST_KEY] !== INSTANCE_ID) {
      return false;
    }
    (async () => {
      try {
        if (req.action === 'PING') {
          return respond({ ok: true, platform: adapter?.name || null, version: VERSION });
        }
        if (req.action === 'TOGGLE_OVERLAY') {
          // IMPORTANT: check open state BEFORE we create/attach the panel
          const alreadyOpen = !!(hostEl && ui.panel && ui.panel.classList.contains('od-open'));

          ensureOverlay();

          if (alreadyOpen && !req.forceOpen) {
            ui.panel.classList.remove('od-open');
          } else {
            ui.panel.classList.add('od-open');
            if (ov.chats.length === 0) doScan();
          }
          return respond({ ok: true, version: VERSION });
        }
        if (req.action === 'SCAN_CHATS') {
          const res = await scanChats({ loadAll: !!req.loadAll });
          return respond(res);
        }
        if (req.action === 'DELETE_CHATS') {
          const items = req.items || (req.ids || []).map((id) => ({ id, title: '' }));
          const res = await runDelete(items);
          return respond({ ok: true, result: res });
        }
        if (req.action === 'CANCEL_DELETE') {
          delState.cancel = true;
          return respond({ ok: true });
        }
        respond({ ok: false, error: 'unknown-action' });
      } catch (e) {
        console.error(LOG, e);
        respond({ ok: false, error: String(e) });
      }
    })();
    return true;
  });

  setTimeout(() => {
    console.log(`${LOG} ready on ${adapter?.name || 'unknown'} · instance ${INSTANCE_ID}`);
  }, 300);

})();