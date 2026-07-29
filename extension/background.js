/**
 * Nothing but the badge. The content script does the work in the page; this
 * exists so the toolbar can show how much was covered on the current tab, and
 * so a removal is never invisible.
 */
chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== 'tf-counts') return;
  const total = (message.covered ?? 0) + (message.removed ?? 0);
  chrome.action.setBadgeText({
    text: total > 0 ? String(total) : '',
    tabId: sender.tab?.id,
  });
  chrome.action.setBadgeBackgroundColor({ color: '#6ED7CE', tabId: sender.tab?.id });
});
