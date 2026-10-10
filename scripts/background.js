chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const log = (...a) => console.log('[OmniDelete AI bg]', ...a);

  log('clicked on', tab.url);

  const send = () => chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' });

  // Pehle try karo (agar script pehle se ho)
  try {
    const res = await send();
    log('toggle ok (existing)', res);
    return;
  } catch (_) {
    log('no script yet — injecting…');
  }

  // Inject karo
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['scripts/content.js'],
    });
    await new Promise((r) => setTimeout(r, 150));
    const res = await send();
    log('toggle ok (post-inject)', res);
  } catch (err) {
    console.warn('[OmniDelete AI bg] inject/toggle failed:', err);
  }
});