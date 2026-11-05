(function (root) {
  'use strict';

  const SEP = ';';
  const PLACEHOLDER = '_';

  function normalizeWithMap(s) {
    let text = '';
    const map = [];
    for (let i = 0; i < s.length; i++) {
      let n = s[i].toLowerCase();
      n = n === 'ß' ? 'ss' : n.normalize('NFD').replace(/[̀-ͯ]/g, '');
      for (let k = 0; k < n.length; k++) {
        text += n[k];
        map.push(i);
      }
    }
    return { text, map };
  }

  function normalize(s) {
    return normalizeWithMap(s).text;
  }

  function parsePhrases(source, defaultCategory) {
    const out = [];
    const seen = new Set();
    let category = defaultCategory || '';
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const header = /^\[(.+)\]$/.exec(line);
      if (header) {
        category = header[1].trim();
        continue;
      }
      const text = line.replace(/[;,\s]+$/, '').replace(/\s+/g, ' ');
      if (!text) continue;
      const key = normalize(text);
      if (seen.has(key)) continue;
      seen.add(key);
      const { text: norm, map } = normalizeWithMap(text);
      out.push({ text, category, norm, map, order: out.length });
    }
    return out;
  }

  function isWordStart(norm, idx) {
    return idx === 0 || !/[a-z0-9]/.test(norm[idx - 1]);
  }

  function search(phrases, query, limit) {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    const results = [];
    for (const p of phrases) {
      let score = 0;
      let lastIdx = -1;
      const ranges = [];
      let ok = true;
      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        let idx = -1;
        let firstIdx = -1;
        for (let i = p.norm.indexOf(tok); i !== -1; i = p.norm.indexOf(tok, i + 1)) {
          if (firstIdx === -1) firstIdx = i;
          if (isWordStart(p.norm, i)) { idx = i; break; }
        }
        const wordStart = idx !== -1;
        if (!wordStart) idx = firstIdx;
        if (idx === -1) { ok = false; break; }
        score += wordStart ? 3 : 1;
        if (t === 0 && idx === 0) score += 3;
        if (idx > lastIdx) score += 1;
        lastIdx = idx;
        ranges.push([p.map[idx], p.map[idx + tok.length - 1] + 1]);
      }
      if (ok) results.push({ phrase: p, score, ranges: mergeRanges(ranges) });
    }
    results.sort((a, b) =>
      b.score - a.score ||
      a.phrase.text.length - b.phrase.text.length ||
      a.phrase.order - b.phrase.order);
    return limit ? results.slice(0, limit) : results;
  }

  function mergeRanges(ranges) {
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  }

  function getActiveSegment(value, caret) {
    const lastSep = value.lastIndexOf(SEP);
    if (caret != null && caret <= lastSep) return null;
    const start = lastSep + 1;
    return { start, query: value.slice(start).trim() };
  }

  function applyPhrase(value, segStart, phrase) {
    let prefix = value.slice(0, segStart).trimEnd();
    if (prefix) prefix += ' ';
    const newValue = prefix + phrase + SEP + ' ';
    const ph = phrase.indexOf(PLACEHOLDER);
    if (ph !== -1) {
      const pos = prefix.length + ph;
      return { value: newValue, selStart: pos, selEnd: pos + 1 };
    }
    return { value: newValue, selStart: newValue.length, selEnd: newValue.length };
  }

  function finalizeValue(value) {
    return value.replace(/\s*;\s*$/, '');
  }

  const api = { parsePhrases, search, getActiveSegment, applyPhrase, finalizeValue, normalize, SEP, PLACEHOLDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WeclappPhraseMatcher = api;
})(typeof self !== 'undefined' ? self : this);
