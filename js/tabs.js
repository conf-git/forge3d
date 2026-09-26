/* tabs.js (role F2): method tabs (with inlined method.svg) and the notes section (limits, disclosures, BibTeX).
   export default init(root, data). Safe to call more than once. */
const KEYS = ['geometry', 'appearance', 'attention'];

function findSection(root, name) {
  const sel = `[data-section="${name}"]`;
  if (root && root.matches && root.matches(sel)) return root;
  return (root && root.querySelector && root.querySelector(sel)) || document.querySelector(sel);
}
async function getData(data, key, path) {
  if (data && data[key]) return data[key];
  const r = await fetch(path, { credentials: 'omit' });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
function sanitizeSvg(text, sheets) {
  // pull <style> blocks out before parsing: the page CSP would reject them as inline styles
  text = text.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => { sheets.push(css); return ''; });
  text = text.replace(/(\s)style=("[^"]*"|'[^']*')/gi, '$1data-f2-style=$2'); // style attributes are applied later through CSSOM
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
  svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach((n) => n.remove());
  svg.querySelectorAll('*').forEach((n) => {
    for (const a of Array.from(n.attributes)) {
      const nm = a.name.toLowerCase();
      if (nm.startsWith('on')) n.removeAttribute(a.name);
      else if (nm === 'style') { n.setAttribute('data-f2-style', a.value); n.removeAttribute('style'); }
      else if ((nm === 'href' || nm === 'xlink:href') && !/^#/.test(a.value.trim())) n.removeAttribute(a.name);
    }
  });
  svg.removeAttribute('width'); svg.removeAttribute('height');
  if (!svg.getAttribute('role')) svg.setAttribute('role', 'img');
  return svg;
}
const layerTokens = (el) => (el.getAttribute('data-layer') || '').toLowerCase().split(/[\s,]+/).filter(Boolean);

/* ---------- method ---------- */
async function initMethod(sec, data) {
  if (!sec || sec.dataset.f2Init) return;
  sec.dataset.f2Init = '1';
  const tabs = Array.from(sec.querySelectorAll('[role="tab"]'));
  const panel = sec.querySelector('[data-panel]');
  const host = sec.querySelector('[data-svg-host]');
  let method = {};
  try { method = (await getData(data, 'content', 'data/content.json')).method || {}; } catch (e) { /* keep static labels */ }

  tabs.forEach((t) => { const m = method[t.dataset.key]; if (m && m.title) t.querySelector('.mt-label').textContent = m.title; });

  function applyLayers(key) {
    if (!host) return;
    host.dataset.active = key;
    host.querySelectorAll('[data-layer]').forEach((el) => {
      const tk = layerTokens(el);
      const mine = tk.includes(key);
      const other = tk.some((x) => KEYS.includes(x));
      el.classList.toggle('is-active', mine);
      el.classList.toggle('is-dim', !mine && other);
    });
  }
  function select(key, focus) {
    const tab = tabs.find((t) => t.dataset.key === key) || tabs[0];
    key = tab.dataset.key;
    tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    const m = method[key] || {};
    panel.setAttribute('aria-labelledby', tab.id);
    panel.dataset.key = key;
    if (m.title) panel.querySelector('[data-title]').textContent = m.title;
    const body = panel.querySelector('[data-body]');
    body.textContent = '';
    String(m.body || '').split(/\n{2,}/).filter(Boolean).forEach((p) => { const el = document.createElement('p'); el.textContent = p; body.appendChild(el); });
    panel.querySelector('[data-caption]').textContent = m.caption || '';
    panel.classList.remove('is-swap'); void panel.offsetWidth; panel.classList.add('is-swap');
    applyLayers(key);
    if (focus) tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t.dataset.key));
    t.addEventListener('keydown', (e) => {
      const n = tabs.length; let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
      if (j !== null) { e.preventDefault(); select(tabs[j].dataset.key, true); }
    });
  });
  select('geometry');

  // inline the diagram so CSS can address its layers
  try {
    const r = await fetch('assets/method/method.svg', { credentials: 'omit' });
    if (!r.ok) throw new Error(String(r.status));
    const sheets = []; const svg = sanitizeSvg(await r.text(), sheets);
    if (!svg) throw new Error('bad svg');
    if (sheets.length && 'adoptedStyleSheets' in document && typeof CSSStyleSheet === 'function') {
      sheets.forEach((css) => { try { const sh = new CSSStyleSheet(); sh.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh]; } catch (e) { /* ignore */ } });
    }
    host.textContent = '';
    host.appendChild(document.importNode(svg, true));
    host.querySelectorAll('[data-f2-style]').forEach((n) => {   // style="" attributes were moved aside (CSP), apply through CSSOM
      n.getAttribute('data-f2-style').split(';').forEach((d) => { const i = d.indexOf(':'); if (i > 0) n.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim()); });
      n.removeAttribute('data-f2-style');
    });
    host.dataset.state = 'ready';
    applyLayers(panel.dataset.key || 'geometry');
  } catch (e) {
    host.dataset.state = 'missing';
    const msg = host.querySelector('[data-svg-msg]');
    if (msg) msg.textContent = 'The diagram is not available. The text on the right describes the same steps.';
  }
}

/* ---------- notes ---------- */
async function initNotes(sec, data) {
  if (!sec || sec.dataset.f2Init) return;
  sec.dataset.f2Init = '1';
  let c;
  try { c = await getData(data, 'content', 'data/content.json'); } catch (e) { return; }
  const fill = (sel, items) => {
    const ul = sec.querySelector(sel); if (!ul) return;
    ul.textContent = '';
    (items || []).forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  };
  fill('[data-limits]', c.limits);
  fill('[data-disclosures]', c.disclosures);
  const faq = Array.isArray(c.faq) ? c.faq.filter((x) => x && x.q && x.a).slice(0, 4) : [];
  if (faq.length) {
    const box = sec.querySelector('[data-faq]'); const list = sec.querySelector('[data-faq-list]');
    faq.forEach((f) => {
      const d = document.createElement('details'); const s = document.createElement('summary'); const p = document.createElement('p');
      s.textContent = f.q; p.textContent = f.a; d.append(s, p); list.appendChild(d);
    });
    box.hidden = false;
  }
}

export default function init(root, data) {
  return Promise.all([
    initMethod(findSection(root, 'method'), data),
    initNotes(findSection(root, 'notes'), data),
  ]);
}
