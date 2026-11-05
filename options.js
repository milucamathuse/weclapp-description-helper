(async () => {
  const ta = document.getElementById('custom');
  const status = document.getElementById('status');

  const bundled = await (await fetch(browser.runtime.getURL('phrases.txt'))).text();
  document.getElementById('count').textContent = WeclappPhraseMatcher.parsePhrases(bundled).length;

  ta.value = (await browser.storage.local.get('customPhrases')).customPhrases || '';

  document.getElementById('save').addEventListener('click', async () => {
    await browser.storage.local.set({ customPhrases: ta.value });
    const n = WeclappPhraseMatcher.parsePhrases(ta.value).length;
    status.textContent = `Gespeichert (${n} eigene Einträge).`;
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
})();
