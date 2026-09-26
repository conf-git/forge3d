// main.js: page entry. Loads data, wires the core sections, then pulls in optional modules
// (F2 sections and the hero animation). Missing files degrade quietly.
import { initNav } from './nav.js';
import { createProofApp, createHeroCard, createDriftRow } from './slider.js';
import { initResults } from './results.js';

document.documentElement.classList.add('js');

const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);

async function getJSON(path) {
  try {
    const r = await fetch(path, { credentials: 'omit', cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

/* headline numbers: the final value is in the HTML already and is never animated. */
function initCountUp() {
  for (const el of document.querySelectorAll('[data-count]')) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  }
}

/* abstract: clamp to a few lines with a disclosure (full text stays in the HTML for no-JS readers) */
function initAbstract() {
  const p = $('[data-abs]');
  if (!p) return;
  p.classList.add('is-clamped');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'abs-toggle'; btn.textContent = 'Read full abstract';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'abs-text');
  btn.addEventListener('click', () => {
    const open = p.classList.toggle('is-clamped') === false;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Show less' : 'Read full abstract';
  });
  p.after(btn);
}

/* hero animation from js/hero-anim.js (owned elsewhere); tolerant of several export shapes */
async function initHeroAnim() {
  const canvas = $('[data-hero-canvas]');
  if (!canvas) return;
  try {
    const mod = await import('./hero-anim.js');
    const F = mod.ForgeHero || mod.default || window.ForgeHero;
    if (!F) return;
    const opts = { reducedMotion: reduce };
    let inst = null;
    if (typeof F === 'function') {
      try { inst = new F(canvas, opts); } catch (_) { inst = F(canvas, opts); }
    } else {
      const fn = F.init || F.mount || F.start || F.create;
      if (typeof fn === 'function') inst = fn.call(F, canvas, opts);
    }
    if (inst && typeof inst.start === 'function' && !reduce) { try { inst.start(); } catch (_) { /* ignore */ } }
    const cap = $('[data-hero-illus]');
    if (cap) cap.hidden = false;
  } catch (_) { /* animation missing: the static gradient stays */ }
}

async function boot() {
  initNav();
  initCountUp();
  initAbstract();
  initHeroAnim();

  const names = ['content', 'results', 'proof', 'gallery', 'viewer', 'bench'];
  const loaded = await Promise.all(names.map((n) => getJSON(`data/${n}.json`)));
  const data = {};
  names.forEach((n, i) => { if (loaded[i]) data[n] = loaded[i]; });
  const { proof, results } = data;

  const heroWrap = $('[data-hero-card]');
  if (proof) createHeroCard(heroWrap, proof); else if (heroWrap) heroWrap.hidden = true;

  const proofHost = $('[data-proof-app]');
  if (proofHost) {
    if (proof) { createProofApp(proofHost, proof); createDriftRow($('[data-drift]'), proof); }
    else proofHost.replaceChildren(Object.assign(document.createElement('p'), { className: 'prov', textContent: 'Comparison data is not available yet.' }));
  }

  initResults($('[data-results-app]'), results);

  // modules owned by the other front-end role: default export init(root, data); data keys are
  // content, results, proof, gallery, viewer, bench (only the files that loaded)
  for (const name of ['tabs', 'viewer', 'gallery', 'bench']) {
    import(`./${name}.js`)
      .then((m) => (typeof m.default === 'function' ? m.default(document, data) : null))
      .catch(() => { /* module missing or failed: its section keeps the static markup */ });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
