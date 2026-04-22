(() => {
  const baseInput = document.getElementById('api-base');
  const keyInput = document.getElementById('api-key');
  const form = document.getElementById('settings-form');
  const testBtn = document.getElementById('test-btn');
  const testResult = document.getElementById('test-result');

  function setResult(text, ok) {
    testResult.textContent = text;
    testResult.classList.remove('hidden', 'ok', 'err');
    testResult.classList.add(ok ? 'ok' : 'err');
  }

  async function load() {
    const { apiBase, apiKey } = await chrome.storage.sync.get(['apiBase', 'apiKey']);
    if (apiBase) baseInput.value = apiBase;
    if (apiKey) keyInput.value = apiKey;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await chrome.storage.sync.set({
      apiBase: baseInput.value.trim().replace(/\/+$/, ''),
      apiKey: keyInput.value.trim(),
    });
    setResult('Settings saved', true);
  });

  testBtn.addEventListener('click', async () => {
    const base = baseInput.value.trim().replace(/\/+$/, '');
    const key = keyInput.value.trim();
    if (!base || !key) {
      setResult('Fill both fields first', false);
      return;
    }
    testResult.classList.add('hidden');
    testBtn.disabled = true;
    testBtn.textContent = 'Testing…';
    try {
      const response = await fetch(`${base}/api/items`, {
        method: 'GET',
        headers: { 'x-api-key': key },
      });
      if (response.ok) {
        setResult('Connected successfully', true);
      } else {
        setResult(`Server rejected the key (HTTP ${response.status})`, false);
      }
    } catch (err) {
      setResult(`Could not reach server: ${err?.message ?? 'network error'}`, false);
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = 'Test connection';
    }
  });

  load();
})();
