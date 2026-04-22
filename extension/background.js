// Knowledge Vault — background service worker (Manifest V3)

const DEFAULT_API_BASE = 'http://localhost:3000';

async function getSettings() {
  const { apiBase, apiKey } = await chrome.storage.sync.get(['apiBase', 'apiKey']);
  return {
    apiBase: (apiBase || DEFAULT_API_BASE).replace(/\/+$/, ''),
    apiKey: apiKey || '',
  };
}

async function postWithKey(path, body) {
  const { apiBase, apiKey } = await getSettings();
  if (!apiKey) {
    throw new Error('API key is not configured. Open Settings and paste a key.');
  }
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data?.error) message = `${message}: ${data.error}`;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const data = await response.json().catch(() => ({}));
  return data;
}

async function saveItem(payload) {
  const body = {
    title: payload.title,
    type: payload.type ?? 'link',
    content: payload.content ?? null,
    url: payload.url ?? null,
    location: payload.location ?? 'inbox',
  };
  const data = await postWithKey('/api/items', body);
  return data?.item ?? data;
}

async function saveTask(payload) {
  const body = {
    title: payload.title,
    description: payload.description ?? null,
    priority: payload.priority ?? 'medium',
  };
  const data = await postWithKey('/api/tasks', body);
  return data?.task ?? data;
}

function showNotification(title, message, isError = false) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title,
      message,
      priority: isError ? 2 : 1,
    });
  } catch {
    // notifications permission may not be granted yet; ignore silently
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'save') {
    saveItem(msg.payload)
      .then((item) => sendResponse({ ok: true, item }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Save failed' }));
    return true;
  }
  if (msg?.action === 'saveTask') {
    saveTask(msg.payload)
      .then((task) => sendResponse({ ok: true, task }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Save task failed' }));
    return true;
  }
  return false;
});

// Context menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'kv-save-page',
      title: 'Save page to Knowledge Vault',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'kv-save-selection',
      title: 'Save selection as quote',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'kv-save-link',
      title: 'Save link to Knowledge Vault',
      contexts: ['link'],
    });
    chrome.contextMenus.create({
      id: 'kv-save-task-selection',
      title: 'Save selection as task',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'kv-save-page' && tab) {
      const item = await saveItem({
        type: 'link',
        title: tab.title || 'Untitled',
        url: tab.url || undefined,
        location: 'inbox',
      });
      showNotification('Saved', tab.title || 'Page saved to Vault');
      return item;
    }
    if (info.menuItemId === 'kv-save-selection' && tab) {
      const text = (info.selectionText || '').slice(0, 8000);
      const title = text.split('\n')[0].slice(0, 120) || 'Quote';
      const content = tab.url ? `${text}\n\n— Source: ${tab.url}` : text;
      await saveItem({
        type: 'quote',
        title,
        url: tab.url || undefined,
        content,
        location: 'inbox',
      });
      showNotification('Saved', 'Quote saved to Vault');
    }
    if (info.menuItemId === 'kv-save-link' && info.linkUrl) {
      await saveItem({
        type: 'link',
        title: info.linkUrl,
        url: info.linkUrl,
        location: 'inbox',
      });
      showNotification('Saved', 'Link saved to Vault');
    }
    if (info.menuItemId === 'kv-save-task-selection' && tab) {
      const text = (info.selectionText || '').slice(0, 500);
      const title = text.split('\n')[0].slice(0, 200) || 'Task from web';
      await saveTask({
        title,
        description: tab.url ? `${text}\n\nSource: ${tab.url}` : text,
        priority: 'medium',
      });
      showNotification('Saved', 'Task created from selection');
    }
  } catch (err) {
    showNotification('Knowledge Vault error', err?.message || 'Save failed', true);
  }
});

// Keyboard shortcut: quick-save the current page
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'quick-save') return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    await saveItem({
      type: 'link',
      title: tab.title || 'Untitled',
      url: tab.url || undefined,
      location: 'inbox',
    });
    showNotification('Saved', tab.title || 'Page saved to Vault');
  } catch (err) {
    showNotification('Knowledge Vault error', err?.message || 'Save failed', true);
  }
});
