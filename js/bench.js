/* bench.js (role F2): FORGE3DBench block: stats, configuration explorer, 24-viewpoint explorer, object pool.
   export default init(root, data). Reads data/bench.json and data/content.json (bench_blurb). */
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
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const NS = 'http:' + '//www.w3.org/2000/svg'; // SVG namespace id, not a network request
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Number(n).toLocaleString('en-US');

// stat definitions: key in bench.stats -> label. Only keys present with a real value are shown.
const STATS = [
  ['scenes', 'photorealistic scenes', null],
  ['scenes_per_config', 'scenes per configuration', null],
  ['assets', 'unique assets with ground-truth meshes', null],
];

export default async function init(root, data) {
  const sec = findSection(root, 'bench');
  if (!sec || sec.dataset.f2Init) return;
  sec.dataset.f2Init = '1';
  const q = (s) => sec.querySelector(s);
  let b;
  try { b = await getData(data, 'bench', 'data/bench.json'); } catch (e) { q('[data-bc-stats]').appendChild(el('p', 'bc-sub', 'The benchmark data could not be loaded.')); return; }
  try { const c = await getData(data, 'content', 'data/content.json'); q('[data-blurb]').textContent = c.bench_blurb || ''; } catch (e) { /* blurb optional */ }

  /* ---- stats (final values, no count-up) ---- */
  const statsEl = q('[data-bc-stats]'); const st = b.stats || {}; const nums = [];
  const shown = STATS.filter(([k]) => k in st);
  
  shown.forEach(([k, label, detail]) => {
    const v = st[k]; const cell = el('div', 'bc-stat'); const n = el('span', 'bc-num');
    const ok = typeof v === 'number' && isFinite(v);
    if (ok) { n.textContent = fmt(v); n.dataset.to = v; } else if (v == null || v === '') { n.textContent = '—'; n.classList.add('is-dash'); } else { n.textContent = String(v); }
    cell.appendChild(n); cell.appendChild(el('span', 'bc-label', v == null || v === '' ? `${label} (pending)` : label));
    const d = detail && detail(st); if (d) cell.appendChild(el('span', 'bc-detail-txt', d));
    statsEl.appendChild(cell); if (ok) nums.push(n);
  });
  // final values are written into the DOM above; nothing is animated, so no intermediate number is ever shown

  /* ---- configuration explorer ---- */
  const cfgs = b.configs || [];
  const cfgWrap = q('[data-cfgs]'), cfgImg = q('[data-cfg-img]'), cfgCap = q('[data-cfg-cap]'), cfgBlurb = q('[data-cfg-blurb]'), scenesEl = q('[data-scenes]');
  let ci = 0, si = -1;
  const cfgBtns = cfgs.map((c, i) => {
    const bt = el('button', 'bc-cfg'); bt.type = 'button'; bt.setAttribute('aria-pressed', i === 0);
    if (c.tile) { const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 640; im.height = 360; im.src = c.tile; bt.appendChild(im); }
    bt.appendChild(el('span', '', c.label || `${c.env} / ${c.placement}`));
    bt.addEventListener('click', () => { ci = i; si = -1; paintCfg(); });
    cfgWrap.appendChild(bt); return bt;
  });
  function paintCfg() {
    const c = cfgs[ci]; if (!c) return;
    cfgBtns.forEach((x, i) => x.setAttribute('aria-pressed', i === ci));
    cfgBlurb.textContent = c.blurb || '';
    const tiles = c.scene_tiles || [];
    scenesEl.textContent = '';
    tiles.forEach((p, i) => {
      const bt = el('button', 'bc-scene'); bt.type = 'button'; bt.setAttribute('aria-label', `Scene ${i + 1} of ${tiles.length}`); bt.setAttribute('aria-pressed', i === si);
      const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 640; im.height = 360; im.src = p; bt.appendChild(im);
      bt.addEventListener('click', () => { si = i; paintCfg(); });
      scenesEl.appendChild(bt);
    });
    const src = si >= 0 && tiles[si] ? tiles[si] : (c.tile || tiles[0]);
    cfgImg.src = src; cfgImg.alt = `${c.label || 'Configuration'}${si >= 0 ? `, scene ${si + 1}` : ', overview'}`;
    cfgCap.textContent = `Rendered scene · ${c.label || ''}${si >= 0 ? ` · scene ${si + 1} of ${tiles.length}` : ' · overview'}`;
  }
  if (cfgs.length) paintCfg();

  /* ---- 24-viewpoint explorer ---- */
  const vp = b.viewpoints || {}; const frames = (vp.frames || []).slice().sort((x, y) => x.azimuth_deg - y.azimuth_deg);
  const vImg = q('[data-view-img]'), vCap = q('[data-view-cap]'), vRange = q('[data-range]'), vRead = q('[data-readout]'), dial = q('[data-dial]'), vStage = q('[data-view-stage]');
  if (frames.length) {
    const n = frames.length; let idx = 0; let preloaded = false;
    vRange.max = n - 1;
    // dial: ring, one tick per frame (0 deg at top, clockwise), needle
    dial.appendChild(svgEl('circle', { class: 'ring', cx: 0, cy: 0, r: 44 }));
    const ticks = frames.map((f) => {
      const a = (f.azimuth_deg * Math.PI) / 180, s = Math.sin(a), c = -Math.cos(a);
      const t = svgEl('line', { class: 'tick', x1: (s * 40).toFixed(2), y1: (c * 40).toFixed(2), x2: (s * 47).toFixed(2), y2: (c * 47).toFixed(2) }); dial.appendChild(t); return t;
    });
    const needle = svgEl('line', { class: 'needle', x1: 0, y1: 0, x2: 0, y2: -36 }); dial.appendChild(needle);
    dial.appendChild(svgEl('circle', { cx: 0, cy: 0, r: 3, fill: 'var(--amber)' }));
    const zero = svgEl('text', { x: 0, y: -50, 'text-anchor': 'middle' }); zero.textContent = '0°'; dial.appendChild(zero);
    let show = function (i) {
      idx = ((i % n) + n) % n; const f = frames[idx];
      vImg.src = f.path; vImg.alt = `Viewpoint ${idx + 1} of ${n}, azimuth ${Math.round(f.azimuth_deg)} degrees`;
      vRange.value = idx; vRange.setAttribute('aria-valuetext', `Viewpoint ${idx + 1} of ${n}, azimuth ${Math.round(f.azimuth_deg)} degrees`);
      needle.setAttribute('transform', `rotate(${f.azimuth_deg})`);
      ticks.forEach((t, k) => t.classList.toggle('is-cur', k === idx));
      vRead.textContent = `View ${String(idx + 1).padStart(2, '0')} / ${n} · azimuth ${Math.round(f.azimuth_deg)}°`;
      vCap.textContent = `One rendered scene, ${n} calibrated cameras ordered by azimuth`;
    }
    function preload() { if (preloaded) return; preloaded = true; frames.forEach((f) => { const im = new Image(); im.decoding = 'async'; im.src = f.path; }); }
    vRange.addEventListener('input', () => { preload(); show(Number(vRange.value)); });
    q('[data-vprev]').addEventListener('click', () => { preload(); show(idx - 1); });
    q('[data-vnext]').addEventListener('click', () => { preload(); show(idx + 1); });
    // drag to scrub (wraps around)
    let drag = null;
    vStage.addEventListener('pointerdown', (e) => { preload(); drag = { x: e.clientX, i: idx, id: e.pointerId }; vStage.setPointerCapture(e.pointerId); });
    vStage.addEventListener('pointermove', (e) => {
      if (!drag) return; const w = vStage.getBoundingClientRect().width; const per = Math.max(9, w / n);
      const d = Math.round((drag.x - e.clientX) / per); const k = ((drag.i + d) % n + n) % n; if (k !== idx) show(k);
    });
    const end = () => { drag = null; }; vStage.addEventListener('pointerup', end); vStage.addEventListener('pointercancel', end);
    // thumbnail rail: every viewpoint, click to jump
    const rail = el('div', 'bc-vthumbs'); rail.setAttribute('role', 'group'); rail.setAttribute('aria-label', 'All viewpoints');
    const tbtns = frames.map((f, k) => {
      const tb = el('button', 'bc-vthumb'); tb.type = 'button'; tb.setAttribute('aria-label', `Viewpoint ${k + 1}, azimuth ${Math.round(f.azimuth_deg)} degrees`);
      const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 96; im.height = 96; im.src = f.path; tb.appendChild(im);
      tb.addEventListener('click', () => { preload(); show(k); }); rail.appendChild(tb); return tb;
    });
    q('[data-views] .bc-view-ctl').appendChild(rail);
    const _show = show; show = function (i) { _show(i); tbtns.forEach((t, k) => t.classList.toggle('is-cur', k === idx)); };
    show(0);
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { io.disconnect(); preload(); } }, { rootMargin: '300px' }); io.observe(vStage); }
  } else { q('[data-views]').replaceChildren(el('p', 'bc-sub', 'Viewpoint frames are not available yet.')); }

  /* ---- object pool ---- */
  const pool = b.object_pool || []; const poolEl = q('[data-pool]'); const pf = q('[data-pool-filters]');
  if (pool.length) {
    const cfgName = new Map(cfgs.map((c) => [c.id, c.label || c.id]));
    const items = pool.map((o) => { const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 128; im.height = 128; im.src = o.img; im.dataset.cfg = o.cfg; poolEl.appendChild(im); return im; });
    let active = null; const chips = [];
    const mk = (label, id) => { const bt = el('button', 'gl-chip', label); bt.type = 'button'; bt.setAttribute('aria-pressed', id === null); bt.addEventListener('click', () => { active = id; paint(); }); pf.appendChild(bt); chips.push([id, bt]); };
    mk('All', null); [...new Set(pool.map((o) => o.cfg))].forEach((id) => mk(cfgName.get(id) || id, id));
    const sub = q('[data-pool-sub]');
    function paint() {
      let n = 0; items.forEach((im) => { const ok = active === null || im.dataset.cfg === active; im.hidden = !ok; if (ok) n++; });
      chips.forEach(([id, bt]) => bt.setAttribute('aria-pressed', id === active));
      sub.textContent = `Crops of objects placed in the scenes. Showing ${n} of ${pool.length}${active ? ' for ' + (cfgName.get(active) || active) : ''}.`;
    }
    paint();
  } else { q('[data-pool]').closest('.bc-block').hidden = true; }
}
