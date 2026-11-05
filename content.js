(() => {
  'use strict';

  const M = window.WeclappPhraseMatcher;
  const FIELD_LABEL = 'Beschreibung';
  const MAX_RESULTS = 8;
  const MAX_BROWSE = 300;

  let phrases = [];
  let input = null;
  let results = [];
  let active = -1;
  let segStart = 0;
  let dismissed = false;

  async function loadPhrases() {
    let bundled = '';
    try {
      bundled = await (await fetch(browser.runtime.getURL('phrases.txt'))).text();
    } catch (e) {
      console.error('[weclapp-Textbausteine] phrases.txt konnte nicht geladen werden', e);
    }
    let custom = '';
    try {
      custom = (await browser.storage.local.get('customPhrases')).customPhrases || '';
    } catch (e) { }
    phrases = M.parsePhrases(custom + '\n[Team]\n' + bundled, 'Eigene');
  }

  loadPhrases();
  browser.storage.onChanged.addListener((changes) => {
    if (changes.customPhrases) loadPhrases();
  });

  function isTarget(el) {
    if (!(el instanceof HTMLInputElement) || el.type !== 'text' || el.readOnly || el.disabled) return false;
    const row = el.closest('.forms-row');
    const label = row && row.querySelector('.forms-label');
    return !!label && label.textContent.replace('*', '').trim() === FIELD_LABEL;
  }

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;display:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .box { background:#fff; color:#1d2433; border:1px solid #c5ccd6; border-radius:6px;
             box-shadow:0 6px 20px rgba(0,0,0,.18); font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;
             overflow:hidden; min-width:360px; }
      ul { list-style:none; margin:0; padding:4px 0; max-height:300px; overflow-y:auto; }
      li { display:flex; gap:12px; align-items:baseline; padding:6px 10px; cursor:pointer; }
      li.active { background:#e6f0ff; }
      .text { flex:1; }
      .cat { color:#6b7585; font-size:11px; white-space:nowrap; }
      mark { background:none; color:inherit; font-weight:700; text-decoration:underline; text-decoration-color:#4a7fd6; }
      .ph { background:#fff1c2; border-radius:3px; padding:0 3px; }
      .foot { border-top:1px solid #e3e7ec; padding:4px 10px; color:#6b7585; font-size:11px; background:#f7f8fa; }
      .foot.warn { color:#a4262c; background:#fdecec; }
    </style>
    <div class="box"><ul></ul><div class="foot"></div></div>`;
  const list = shadow.querySelector('ul');
  const foot = shadow.querySelector('.foot');
  const HINT = '↑↓ auswählen · Enter/Tab einfügen · Esc schließen · Strg+Leertaste alle';

  function mount() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  }

  function isOpen() {
    return host.style.display !== 'none';
  }

  function hide() {
    host.style.display = 'none';
    results = [];
    active = -1;
  }

  function renderText(el, text, ranges) {
    let pos = 0;
    const push = (s, tag, cls) => {
      if (!s) return;
      if (!tag) { el.appendChild(document.createTextNode(s)); return; }
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      n.textContent = s;
      el.appendChild(n);
    };
    const plain = (s) => {
      const parts = s.split(M.PLACEHOLDER);
      parts.forEach((part, i) => {
        if (i) push('…', 'span', 'ph');
        push(part);
      });
    };
    for (const [a, b] of ranges) {
      plain(text.slice(pos, a));
      push(text.slice(a, b), 'mark');
      pos = b;
    }
    plain(text.slice(pos));
  }

  function render() {
    list.textContent = '';
    results.forEach((r, i) => {
      const li = document.createElement('li');
      if (i === active) li.className = 'active';
      const t = document.createElement('span');
      t.className = 'text';
      renderText(t, r.phrase.text, r.ranges);
      const c = document.createElement('span');
      c.className = 'cat';
      c.textContent = r.phrase.category;
      li.append(t, c);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); accept(i); });
      li.addEventListener('mousemove', () => { if (active !== i) { active = i; highlight(); } });
      list.appendChild(li);
    });
    setFoot(HINT, false);
    position();
  }

  function highlight() {
    [...list.children].forEach((li, i) => li.classList.toggle('active', i === active));
    const el = list.children[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function setFoot(text, warn) {
    foot.textContent = text;
    foot.classList.toggle('warn', warn);
  }

  function position() {
    if (!input) return;
    mount();
    host.style.display = 'block';
    const r = input.getBoundingClientRect();
    const box = shadow.querySelector('.box');
    const width = Math.max(r.width, 360);
    box.style.width = width + 'px';
    const height = box.offsetHeight;
    const below = window.innerHeight - r.bottom;
    const top = below < height + 8 && r.top > below ? r.top - height - 2 : r.bottom + 2;
    host.style.top = Math.max(0, top) + 'px';
    host.style.left = Math.max(0, Math.min(r.left, window.innerWidth - width - 8)) + 'px';
  }

  function update(browseAll) {
    if (!input || dismissed) { hide(); return; }
    const seg = M.getActiveSegment(input.value, input.selectionStart);
    if (!seg || (!seg.query && !browseAll)) { hide(); return; }
    segStart = seg.start;
    results = M.search(phrases, seg.query, seg.query ? MAX_RESULTS : MAX_BROWSE);
    if (!results.length) { hide(); return; }
    active = 0;
    render();
  }

  function accept(i) {
    const r = results[i];
    if (!r || !input) return;
    const next = M.applyPhrase(input.value, segStart, r.phrase.text);
    const max = input.maxLength;
    if (max > 0 && M.finalizeValue(next.value).length > max) {
      setFoot(`Zu lang – das Feld erlaubt max. ${max} Zeichen.`, true);
      return;
    }
    input.value = next.value;
    input.setSelectionRange(next.selStart, next.selEnd);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hide();
  }

  function finalize(el) {
    const v = M.finalizeValue(el.value);
    if (v !== el.value) el.value = v;
  }

  document.addEventListener('focusin', (e) => {
    if (isTarget(e.target)) {
      input = e.target;
      dismissed = false;
    } else if (e.target !== host) {
      input = null;
      hide();
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    if (e.target === input) hide();
  }, true);

  document.addEventListener('input', (e) => {
    if (e.target !== input || e.isComposing) return;
    dismissed = false;
    update(false);
  }, true);

  window.addEventListener('change', (e) => {
    if (isTarget(e.target)) finalize(e.target);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.target !== input) return;

    if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault();
      dismissed = false;
      update(true);
      return;
    }

    if (!isOpen()) {
      if (e.key === 'Enter') finalize(input);
      return;
    }

    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    switch (e.key) {
      case 'ArrowDown':
        stop(); active = (active + 1) % results.length; highlight(); break;
      case 'ArrowUp':
        stop(); active = (active - 1 + results.length) % results.length; highlight(); break;
      case 'PageDown':
        stop(); active = Math.min(results.length - 1, active + 8); highlight(); break;
      case 'PageUp':
        stop(); active = Math.max(0, active - 8); highlight(); break;
      case 'Enter':
        stop(); accept(active); break;
      case 'Tab':
        if (e.shiftKey) { hide(); break; }
        stop(); accept(active); break;
      case 'Escape':
        stop(); dismissed = true; hide(); break;
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target === input) update(false);
  }, true);

  const reposition = () => { if (isOpen()) position(); };
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);
})();
