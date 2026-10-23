// Traducciones de Rutero. Archivo generado por tools/build-i18n.py (edita src/renderer/i18n-data.txt).
// La app está escrita en español; este módulo traduce el texto que aparece en pantalla al idioma elegido.
(function (root) {
  const LANGS = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português', pl: 'Polski' };
  const LOCALES = { es: 'es-ES', en: 'en-GB', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', pl: 'pl-PL' };
  const DATA = /*DATA*/{};
  let lang = 'es', D = null;
  const pick = (locale) => { const l = String(locale || '').slice(0, 2).toLowerCase(); return LANGS[l] ? l : 'en'; };
  const set = (l) => { lang = LANGS[l] ? l : 'es'; D = lang === 'es' ? null : DATA[lang]; };
  function look(s) {
    if (D[s] !== undefined) return D[s];
    const nums = [];
    const k = s.replace(/\d[\d.,:]*/g, (m) => { nums.push(m); return '#'; });
    if (nums.length && D[k] !== undefined) { let i = 0; return D[k].replace(/#/g, () => (nums[i] !== undefined ? nums[i++] : '#')); }
    return null;
  }
  function tr(s) {
    if (!D || s == null) return s;
    const str = String(s); const t = str.trim();
    if (!t || !/\p{L}/u.test(t)) return str;
    let r = look(t);
    if (r === null) {
      const m = t.match(/^([^\p{L}\p{N}¿¡]*)([\s\S]*?)([\s.:…✓✔]*)$/u);
      if (m && (m[1] || m[3]) && m[2]) { let c = look(m[2] + m[3]); if (c !== null) r = m[1] + c; else { c = look(m[2]); if (c !== null) r = m[1] + c + m[3]; } }
    }
    if (r === null) {
      for (const sep of [' · ', ' → ', ': ', ' — ']) {
        if (t.includes(sep)) { const parts = t.split(sep); const out = parts.map((p) => tr(p)); if (out.some((x, i) => x !== parts[i])) { r = out.join(sep); break; } }
      }
    }
    if (r === null) return str;
    return str.replace(t, r);
  }
  // --- traducción automática del DOM
  const done = new WeakMap();
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE']);
  const skip = (el) => !el || SKIP.has(el.tagName) || (el.closest && el.closest('[translate="no"]'));
  function doText(n) {
    const v = n.nodeValue; if (!v || done.get(n) === v || skip(n.parentElement)) return;
    const out = tr(v); done.set(n, out); if (out !== v) n.nodeValue = out;
  }
  function doAttrs(el) {
    if (skip(el)) return;
    for (const a of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute(a); if (!v) continue;
      const key = '__tr_' + a; if (el[key] === v) continue;
      const out = tr(v); el[key] = out; if (out !== v) el.setAttribute(a, out);
    }
  }
  function walk(rootEl) {
    if (rootEl.nodeType === 3) return doText(rootEl);
    if (rootEl.nodeType !== 1 && rootEl.nodeType !== 9) return;
    if (rootEl.nodeType === 1) doAttrs(rootEl);
    const w = document.createTreeWalker(rootEl, 5 /* elementos y texto */);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let obs = null;
  function start(doc) {
    if (!D || obs) return;
    const go = () => {
      walk(doc.body);
      obs = new MutationObserver((ms) => {
        for (const m of ms) {
          if (m.type === 'characterData') doText(m.target);
          else if (m.type === 'attributes') doAttrs(m.target);
          else m.addedNodes.forEach(walk);
        }
      });
      obs.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
      doc.documentElement.lang = lang;
    };
    if (doc.body) go(); else doc.addEventListener('DOMContentLoaded', go);
  }
  const api = { LANGS, LOCALES, pick, set, tr, start, lang: () => lang, locale: () => LOCALES[lang] || 'es-ES' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RI18N = api;
})(typeof window !== 'undefined' ? window : globalThis);
