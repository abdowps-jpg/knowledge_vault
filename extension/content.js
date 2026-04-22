// Knowledge Vault — content script
// Lightweight bridge that exposes the current text selection to the popup.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'getSelection') {
    try {
      const selection = window.getSelection();
      const text = selection ? selection.toString() : '';
      sendResponse({ text });
    } catch {
      sendResponse({ text: '' });
    }
    return true;
  }
  return false;
});
