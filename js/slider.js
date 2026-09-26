// slider.js: same-camera comparison slider, proof section app, hero card, drift row.
// No dependencies. All styling goes through CSS variables set with style.setProperty (CSP-safe).

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const SOURCES = {
  ours: { tag: 'FORGE3D', kind: 'ours', word: 'FORGE3D render' },
  baseline: { tag: 'Baseline', kind: 'baseline', word: 'baseline render' },
  gt: { tag: 'Ground truth', kind: 'gt', word: 'ground-truth render' },
};

export class CompareSlider {
  /**
   * @param {HTMLElement} host  element that receives the slider
   * @param {{mini?:boolean, onPage?:(d:number)=>void}} opts
   */
  constructor(host, opts = {}) {
    this.opts = opts;
    this.pos = 50;
    this.mode = 'wipe';
    this.source = 'ours';
    this.pair = null;
    this._nudged = false;
    this._raf = 0;

    this.base = h('img', { alt: 'Input view (rendered benchmark frame)', decoding: 'async', draggable: 'false' });
    this.top = h('img', { alt: '', decoding: 'async', draggable: 'false' });
    this.tagL = h('span', { class: 'cmp-tag cmp-tag-l', text: 'Input view' });
    this.tagR = h('span', { class: 'cmp-tag cmp-tag-r', 'data-kind': 'ours', text: 'FORGE3D' });
    this.handle = h('div', {
      class: 'cmp-handle', role: 'slider', tabindex: '0', 'aria-orientation': 'horizontal',
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '50',
      'aria-label': 'Comparison divider. Input view on the left, render on the right.',
    }, h('span', { class: 'cmp-knob', 'aria-hidden': 'true' }));
    this.topWrap = h('div', { class: 'cmp-top' }, this.top);
    this.root = h('div', { class: 'cmp' + (opts.mini ? ' cmp-mini' : ''), 'data-mode': 'wipe' },
      this.base, this.topWrap, this.tagL, this.tagR, this.handle);
    host.replaceChildren(this.root);

    for (const img of [this.base, this.top]) {
      img.addEventListener('error', () => this.root.classList.add('is-broken'));
      img.addEventListener('load', () => this.root.classList.remove('is-broken'));
    }

    this._bind();
    this.setPos(50);
    if ('ResizeObserver' in window) new ResizeObserver(() => this.setPos(this.pos)).observe(this.root);
  }

  _bind() {
    const root = this.root;
    const move = (e) => {
      const r = root.getBoundingClientRect();
      this.setPos(((e.clientX - r.left) / r.width) * 100);
    };
    let dragging = false;
    root.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'wipe' || (e.pointerType === 'mouse' && e.button !== 0)) return;
      dragging = true;
      this.cancelNudge();
      try { root.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      move(e);
      this.handle.focus({ preventScroll: true });
    });
    root.addEventListener('pointermove', (e) => { if (dragging) move(e); });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (this.pos < 3) this.setPos(0);
      else if (this.pos > 97) this.setPos(100);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    this.handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      let handled = true;
      this.cancelNudge();
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowDown': this.setPos(this.pos - step); break;
        case 'ArrowRight': case 'ArrowUp': this.setPos(this.pos + step); break;
        case 'Home': this.setPos(0); break;
        case 'End': this.setPos(100); break;
        case 'PageUp': if (this.opts.onPage) this.opts.onPage(-1); break;
        case 'PageDown': if (this.opts.onPage) this.opts.onPage(1); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    });
  }

  setPos(p) {
    this.pos = clamp(p, 0, 100);
    const v = Math.round(this.pos * 10) / 10;
    this.root.style.setProperty('--pos', v + '%');
    this.root.style.setProperty('--posx', ((this.root.clientWidth || 0) * this.pos / 100) + 'px');
    const now = Math.round(this.pos);
    this.handle.setAttribute('aria-valuenow', String(now));
    this.handle.setAttribute('aria-valuetext',
      now <= 0 ? 'Render fully shown' : now >= 100 ? 'Input view fully shown' : `Input view shown left of ${now} percent, render to the right`);
  }

  setOpacity(o) {
    this.root.style.setProperty('--op', String(clamp(o, 0, 1)));
  }

  setMode(mode) {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.handle.tabIndex = mode === 'wipe' ? 0 : -1;
    this._tags();
  }

  setPair(pair, source) {
    this.pair = pair;
    if (source) this.source = source;
    const w = pair.w || 1, hgt = pair.h || 1;
    this.root.style.setProperty('--ar', String(w / hgt));
    const box = this.root.closest('.vf') || this.root.parentElement; if (box) box.style.setProperty('--ar', String(w / hgt));
    this.base.width = w; this.base.height = hgt;
    this.top.width = w; this.top.height = hgt;
    if (this.base.getAttribute('src') !== pair.photo) this.base.src = pair.photo;
    this._applySource();
  }

  setSource(source) {
    this.source = source;
    this._applySource();
  }

  _srcName() {
    if (this.source === 'baseline') return (this.pair && this.pair.baseline_name) || 'Baseline';
    return SOURCES[this.source].tag;
  }

  _applySource() {
    if (!this.pair) return;
    const url = this.pair[this.source];
    if (url && this.top.getAttribute('src') !== url) this.top.src = url;
    this.top.alt = `${this._srcName()} render from the same camera`;
    this._tags();
  }

  _tags() {
    const kind = SOURCES[this.source].kind;
    this.tagR.dataset.kind = kind;
    this.tagR.textContent = this._srcName();
    this.tagL.textContent = 'Input view';
  }

  /** one gentle left-right nudge to show it is draggable */
  nudgeOnce(amp = 14, dur = 1500) {
    if (this._nudged || reduceMotion()) return;
    this._nudged = true;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      this.setPos(50 + Math.sin(k * Math.PI * 2) * amp * (1 - k * 0.2));
      if (k < 1) this._raf = requestAnimationFrame(tick);
      else this.setPos(50);
    };
    this._raf = requestAnimationFrame(tick);
  }

  cancelNudge() { this._nudged = true; if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }
}

function preload(urls) { for (const u of urls) if (u) { const i = new Image(); i.decoding = 'async'; i.src = u; } }

/* ------------------------------------------------------------------ proof app */
export function createProofApp(root, proof) {
  const all = (proof && proof.pairs) || [];
  const pairs = all.filter((p) => !p.drift && p.kind !== 'drift');
  const list = pairs.length ? pairs : all;
  if (!list.length) {
    root.replaceChildren(h('p', { class: 'prov', text: 'Comparison data is not available yet.' }));
    return null;
  }

  let idx = 0;
  let source = 'ours';
  let mode = 'wipe';

  const holder = h('div', { class: 'cmp-holder' });
  const vf = h('div', { class: 'vf' }, holder);
  const slider = new CompareSlider(holder, { onPage: (d) => go(idx + d) });
  // the holder is replaced by the slider root: re-attach the aspect ratio holder
  const frameHolder = h('div', { class: 'cmp-holder' }, slider.root);
  vf.replaceChildren(frameHolder);

  const objBtns = list.map((p, i) => h('button', {
    type: 'button', class: 'thumb-btn', 'aria-pressed': i === 0 ? 'true' : 'false',
    'aria-label': p.label || `Example ${i + 1}`, title: p.label || `Example ${i + 1}`,
    onclick: () => go(i),
  }, p.thumb ? h('img', { src: p.thumb, alt: '', width: '56', height: '56', decoding: 'async' }) : `${i + 1}`));
  const objGroup = h('div', { class: 'ctl-group', role: 'group', 'aria-label': 'Example' },
    h('span', { class: 'ctl-label', text: 'Example' }), h('div', { class: 'thumb-strip' }, ...objBtns));

  const bOurs = h('button', { type: 'button', 'data-kind': 'ours', 'aria-pressed': 'true', onclick: () => setSource('ours') }, 'FORGE3D');
  const bBase = h('button', { type: 'button', 'data-kind': 'baseline', 'aria-pressed': 'false', onclick: () => setSource('baseline') }, 'Best baseline');
  const bGt = h('button', { type: 'button', 'data-kind': 'gt', 'aria-pressed': 'false', onclick: () => setSource('gt') }, 'Ground truth');
  const srcGroup = h('div', { class: 'ctl-group' }, h('span', { class: 'ctl-label', text: 'Right side' }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Which render is shown next to the input view' }, bOurs, bBase, bGt));

  const mWipe = h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => setMode('wipe') }, 'Wipe');
  const mOver = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setMode('overlay') }, 'Overlay');
  const modeGroup = h('div', { class: 'ctl-group' }, h('span', { class: 'ctl-label', text: 'View' }),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Comparison mode' }, mWipe, mOver));

  const opInput = h('input', { type: 'range', min: '0', max: '100', value: '50', id: 'proof-opacity', 'aria-label': 'Render opacity over the input view' });
  const opVal = h('output', { class: 'mono-val', for: 'proof-opacity', text: '50%' });
  const opRow = h('div', { class: 'opacity-row', hidden: true }, h('label', { for: 'proof-opacity', text: 'Render opacity' }), opInput, opVal);
  opInput.addEventListener('input', () => {
    slider.setOpacity(opInput.value / 100);
    opVal.textContent = opInput.value + '%';
  });
  slider.setOpacity(0.5);

  const prov = h('p', { class: 'prov', 'aria-live': 'polite' });

  // side cards
  const legendL = h('li', {}, h('span', { class: 'sw sw-photo' }), 'Left of the divider: input view (rendered benchmark frame)');
  const legendSw = h('span', { class: 'sw sw-ours' });
  const legendR = h('li', {}, legendSw, h('span', { class: 'legend-r' }, 'Right of the divider: FORGE3D render'));
  const iouLine = h('p', { class: 'iou-line' });
  const ruleLine = h('p', { class: 'rule-line' });
  const side = h('aside', { class: 'proof-side', 'aria-label': 'How to read the comparison' },
    h('div', { class: 'side-card' }, h('h3', { text: 'Reading the frame' }),
      h('ul', { class: 'legend' }, legendL, legendR), iouLine),
    h('div', { class: 'side-card' }, h('h3', { text: 'Best baseline' }), ruleLine),
    proof.selection_rule ? h('div', { class: 'side-card' }, h('h3', { text: 'Selection' }), h('p', { text: proof.selection_rule + '.' })) : null,
    h('div', { class: 'side-card' }, h('h3', { text: 'Alignment protocol' }),
      h('p', { text: 'Baselines are registered to the ground-truth frame before rendering. FORGE3D is not re-aligned, which favours the baselines. FORGE3D also uses depth the baselines do not receive.' }),
      h('p', { text: 'Keys: arrows move the divider, Home and End go to the edges, Page Up and Down switch example.' })));

  const controls = h('div', { class: 'proof-controls-row' },
    objGroup, h('div', { class: 'proof-controls' }, srcGroup, modeGroup));
  const main = h('div', { class: 'proof-main' }, h('div', { class: 'proof-frame' }, vf, opRow, prov));

  root.replaceChildren(controls, main, side);
  root.classList.add('is-ready');

  function refresh() {
    const p = list[idx];
    bBase.textContent = 'Best baseline' + (p.baseline_name ? `: ${p.baseline_name}` : '');
    bBase.disabled = !p.baseline;
    bGt.disabled = !p.gt;
    bOurs.disabled = !p.ours;
    const name = source === 'baseline' ? (p.baseline_name || 'Baseline') : source === 'gt' ? 'Ground truth' : 'FORGE3D';
    legendSw.className = 'sw sw-' + source;
    root.querySelector('.legend-r').textContent = mode === 'overlay'
      ? `Overlaid on the input view: ${name} render (opacity slider)`
      : `Right of the divider: ${name} render`;
    const rule = (p.best_baseline_rule || 'lowest CD-L1 on this object').replace(/\.+$/, '');
    ruleLine.replaceChildren(
      'Chosen per object: ', h('span', { class: 'baseline-name', text: p.baseline_name || 'not provided' }), `. Rule: ${rule}.`);
    if (typeof p.overlay_iou === 'number') {
      const bits = ['Silhouette IoU vs the input object mask (front view): FORGE3D ', h('span', { class: 'mono-val', text: p.overlay_iou.toFixed(2) })];
      if (typeof p.baseline_overlay_iou === 'number') bits.push(`, ${p.baseline_name || 'best baseline'} `, h('span', { class: 'mono-val', text: p.baseline_overlay_iou.toFixed(2) }));
      bits.push('. A weak, silhouette-only proxy.');
      iouLine.replaceChildren(...bits);
    } else iouLine.textContent = '';
    const parts = [];
    if (p.caption) parts.push(p.caption);
    parts.push('All layers are rendered from the same calibrated camera.');
    prov.textContent = parts.join(' ') + ` Showing: ${name}.`;
    objBtns.forEach((b, i) => b.setAttribute('aria-pressed', i === idx ? 'true' : 'false'));
    for (const [b, k] of [[bOurs, 'ours'], [bBase, 'baseline'], [bGt, 'gt']]) b.setAttribute('aria-pressed', k === source ? 'true' : 'false');
    mWipe.setAttribute('aria-pressed', mode === 'wipe' ? 'true' : 'false');
    mOver.setAttribute('aria-pressed', mode === 'overlay' ? 'true' : 'false');
    opRow.hidden = mode !== 'overlay';
  }
  function go(i) {
    idx = (i + list.length) % list.length;
    if (!list[idx][source]) source = 'ours';
    slider.setPair(list[idx], source);
    refresh();
    preload([list[(idx + 1) % list.length].photo]);
  }
  function setSource(s) {
    if (!list[idx][s]) return;
    source = s; slider.setSource(s); refresh();
  }
  function setMode(m) { mode = m; slider.setMode(m); refresh(); }

  go(0);
  return { go, slider };
}

/* ------------------------------------------------------------------ hero card */
/* The hero card is a rotatable 3D mesh: the poster (a render) is shown at once, the self-hosted
   model-viewer and the GLB load when the browser is idle, and the input view stays as a small inset. */
function heroLoadClassic(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
}
let heroLib = null;
function heroLoadLib() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!heroLib) {
    heroLib = (async () => {
      await heroLoadClassic('vendor/mv-config.js').catch(() => {});
      await import(new URL('vendor/model-viewer/model-viewer.min.js', document.baseURI).href);
      await customElements.whenDefined('model-viewer');
    })().catch((e) => { heroLib = null; throw e; });
  }
  return heroLib;
}
function heroHasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
export function createHeroCard(wrap, proof) {
  if (!wrap) return null;
  const body = wrap.querySelector('[data-hero-card-body]');
  const prov = wrap.querySelector('[data-hero-prov]');
  const all = (proof && proof.pairs) || [];
  const pairs = all.filter((p) => !p.drift && p.kind !== 'drift');
  const pair = pairs.find((p) => p.hero) || pairs[0] || all[0];
  if (!pair) { wrap.hidden = true; return null; }
  const stage = h('div', { class: 'hero-3d' },
    h('img', { class: 'h3d-poster', src: pair.ours, width: pair.w || 1200, height: pair.h || 1200, alt: 'FORGE3D reconstruction of the object in the input view', decoding: 'async' }),
    h('figure', { class: 'h3d-inset' },
      h('img', { src: pair.photo, alt: 'Input view', width: 240, height: 240, decoding: 'async' }),
      h('figcaption', { text: 'Input view' })));
  body.replaceChildren(stage);
  if (prov) prov.textContent = 'Drag to rotate the FORGE3D mesh.';
  if (!heroHasWebGL()) return null;

  const start = async () => {
    try {
      if (!pair.hero_glb) return;
      await heroLoadLib();
      const mv = document.createElement('model-viewer');
      mv.setAttribute('camera-controls', ''); mv.setAttribute('touch-action', 'pan-y');
      mv.setAttribute('shadow-intensity', '0'); mv.setAttribute('interaction-prompt', 'none');
      mv.setAttribute('camera-orbit', '20deg 74deg 112%'); mv.setAttribute('tone-mapping', 'neutral');
      mv.setAttribute('exposure', '1'); mv.setAttribute('min-camera-orbit', 'auto auto 40%'); mv.setAttribute('loading', 'eager');
      mv.setAttribute('aria-label', 'Rotatable 3D mesh of the FORGE3D reconstruction');
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduce) { mv.setAttribute('auto-rotate', ''); mv.setAttribute('auto-rotate-delay', '0'); mv.setAttribute('rotation-per-second', '24deg'); }
      // the wheel zooms only with Ctrl/Cmd, so the page keeps scrolling over the card
      mv.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) e.stopImmediatePropagation(); }, { capture: true, passive: true });
      mv.addEventListener('load', () => { try { mv.jumpCameraToGoal(); } catch (e) { /* ignore */ } stage.classList.add('is-live'); });
      mv.alt = 'Rotatable 3D mesh';
      mv.src = pair.hero_glb;
      stage.prepend(mv);
    } catch (e) { /* keep the static poster */ }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 }); else setTimeout(start, 800);
  return null;
}

/* ------------------------------------------------------------------ drift row */
export function createDriftRow(section, proof) {
  if (!section) return;
  const row = section.querySelector('[data-drift-row]');
  const all = (proof && proof.pairs) || [];
  const items = (proof && proof.drift_pairs) || all.filter((p) => p.drift || p.kind === 'drift');
  const chosen = items.filter((p) => p.photo && p.baseline).slice(0, 2);
  if (!chosen.length) { section.hidden = true; return; }
  row.replaceChildren(...chosen.map((p) => {
    const host = h('div', { class: 'cmp-holder is-solo' });
    const s = new CompareSlider(host, { mini: true });
    s.setPair(p, 'baseline');
    const name = p.baseline_name || 'Baseline';
    return h('figure', { class: 'drift-item' },
      h('div', { class: 'vf' }, host),
      h('figcaption', { class: 'prov' }, `${name}. ${p.caption || ''} Same calibrated camera as the input view.`.trim()));
  }));
  section.hidden = false;
}
