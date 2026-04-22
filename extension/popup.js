(() => {
  const typeButtons = document.querySelectorAll('.pill');
  const titleInput = document.getElementById('title');
  const urlInput = document.getElementById('url');
  const contentInput = document.getElementById('content');
  const locationSelect = document.getElementById('location');
  const form = document.getElementById('capture-form');
  const saveBtn = document.getElementById('save-btn');
  const statusEl = document.getElementById('status');
  const openSettingsBtn = document.getElementById('open-settings');

  let selectedType = 'link';

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.classList.remove('hidden', 'ok', 'err');
    statusEl.classList.add(ok ? 'ok' : 'err');
  }

  function clearStatus() {
    statusEl.classList.add('hidden');
    statusEl.textContent = '';
  }

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      // When switching to note/quote, allow empty url
      urlInput.required = false;
    });
  });

  openSettingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  async function prefillFromActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      titleInput.value = tab.title || '';
      urlInput.value = tab.url || '';

      // Ask content script for current selection (if any)
      try {
        const results = await chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
        if (results?.text && results.text.trim().length > 0) {
          contentInput.value = results.text.slice(0, 8000);
          // If user has a selection they likely want a quote
          document.querySelector('[data-type="quote"]').click();
        }
      } catch {
        // Content script may not be injected on restricted pages; ignore.
      }
    } catch (err) {
      console.error('[KV Popup] prefill failed:', err);
    }
  }

  async function saveViaBackground(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'save', payload }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!response || !response.ok) {
          return reject(new Error(response?.error || 'Unknown save failure'));
        }
        resolve(response.item);
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearStatus();

    const title = titleInput.value.trim();
    const url = urlInput.value.trim();
    const content = contentInput.value.trim();
    const location = locationSelect.value;

    if (!title) {
      setStatus('Title is required', false);
      return;
    }
    if (selectedType === 'link' && !url) {
      setStatus('Link type requires a URL', false);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      await saveViaBackground({
        type: selectedType,
        title: title.slice(0, 500),
        url: url || undefined,
        content: content || undefined,
        location,
      });
      setStatus('Saved to Knowledge Vault', true);
      setTimeout(() => window.close(), 800);
    } catch (err) {
      setStatus(err?.message || 'Failed to save', false);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  });

  prefillFromActiveTab();
})();
