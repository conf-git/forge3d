/* viewer.js (role F2): 'Inspect the mesh'. One lazily created <model-viewer>, variant swap keeps the camera.
   export default init(root, data). Reads data/viewer.json (or data.viewer). */
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
const kindOf = (name) => (/^ours/i.test(name) ? 'ours' : /ground/i.test(name) ? 'gt' : 'baseline');
const fmtMB = (v) => (typeof v === 'number' && isFinite(v) ? `${v.toFixed(v < 10 ? 1 : 0)} MB` : '');

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}
function loadClassic(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); });
}
let libPromise = null;
function loadLib() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  if (!libPromise) {
    libPromise = (async () => {
      await loadClassic('vendor/mv-config.js').catch(() => {}); // decoder paths, must run before the library
      await import(new URL('vendor/model-viewer/model-viewer.min.js', document.baseURI).href);
      await customElements.whenDefined('model-viewer');
    })().catch((e) => { libPromise = null; throw e; });
  }
  return libPromise;
}

export default async function init(root, data) {
  const sec = findSection(root, 'viewer');
  if (!sec || sec.dataset.f2Init) return;
  sec.dataset.f2Init = '1';
  const q = (s) => sec.querySelector(s);
  const stage = q('[data-stage]'), poster = q('[data-poster]'), overlay = q('[data-overlay]'), loadBtn = q('[data-load]');
  const progress = q('[data-progress]'), fill = q('[data-progress-fill]'), plabel = q('[data-progress-label]');
  const fallback = q('[data-fallback]'), prov = q('[data-prov]'), variantsEl = q('[data-variants]');
  const rail = q('[data-rail]'), tools = q('[data-tools]'), rot = q('[data-rot]'), reset = q('[data-reset]');

  let vd;
  try { vd = await getData(data, 'viewer', 'data/viewer.json'); } catch (e) { prov.textContent = 'The viewer data could not be loaded.'; overlay.hidden = true; return; }
  const objects = (vd.objects || []).filter((o) => o && o.variants && o.variants.length);
  if (!objects.length) { prov.textContent = 'No meshes are available yet.'; overlay.hidden = true; return; }

  const webgl = hasWebGL();
  const coarse = matchMedia('(pointer: coarse)').matches || (navigator.connection && navigator.connection.saveData);
  let oi = 0, kind = 'ours', mv = null, wantLive = false, everLoaded = false, pendingKeep = null;

  const slot = (o, k) => o.variants.find((v) => kindOf(v.name) === k);
  const current = () => slot(objects[oi], kind);

  // ---- rail
  const thumbs = objects.map((o, i) => {
    const b = el('button', 'vw-thumb'); b.type = 'button'; b.setAttribute('aria-pressed', i === 0);
    const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 160; im.height = 160; if (o.thumb) im.src = o.thumb;
    b.append(im, el('span', '', o.label || `Object ${i + 1}`)); b.title = o.label || '';
    b.setAttribute('aria-label', `Object ${i + 1}: ${o.label || ''}`);
    b.addEventListener('click', () => selectObject(i));
    rail.appendChild(b); return b;
  });

  // ---- variant buttons (always three slots: ours, ground truth, best baseline)
  const vbtn = {};
  [['ours', 'Ours'], ['gt', 'Ground truth'], ['baseline', 'Best baseline']].forEach(([k, label]) => {
    const b = el('button', 'vw-var'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.kind = k;
    b.append(el('b', '', label), el('small', ''));
    b.addEventListener('click', () => selectVariant(k));
    b.addEventListener('keydown', (e) => {
      const order = ['ours', 'gt', 'baseline'].filter((x) => !vbtn[x].disabled); const i = order.indexOf(k);
      let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = order[(i + 1) % order.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = order[(i - 1 + order.length) % order.length];
      if (j) { e.preventDefault(); selectVariant(j); vbtn[j].focus(); }
    });
    variantsEl.appendChild(b); vbtn[k] = b;
  });

  function paintUI() {
    const o = objects[oi];
    for (const k of ['ours', 'gt', 'baseline']) {
      const v = slot(o, k), b = vbtn[k], sm = b.querySelector('small');
      b.disabled = !v; b.setAttribute('aria-checked', k === kind && !!v); b.tabIndex = (k === kind && v) ? 0 : -1;
      sm.textContent = !v ? 'Not provided' : (k === 'baseline' ? `${v.name}${v.size_mb ? ' · ' + fmtMB(v.size_mb) : ''}` : (v.size_mb ? fmtMB(v.size_mb) : ''));
    }
    thumbs.forEach((t, i) => t.setAttribute('aria-pressed', i === oi));
    const v = current();
    if (v && v.poster) poster.src = v.poster;
    poster.alt = v ? `${o.label || 'Object'}, ${v.name} mesh, static preview` : '';
    prov.textContent = v ? `${o.label || 'Object'} · ${v.name}${v.size_mb ? ' · ' + fmtMB(v.size_mb) : ''} · unlit albedo, shared frame${mv && stage.classList.contains('is-live') ? '' : ' · preview image'}` : '';
    q('[data-load-size]').textContent = v && v.size_mb ? `(${fmtMB(v.size_mb)})` : '';
  }

  function setProgress(p, label) {
    progress.hidden = false; fill.style.width = `${Math.round(p * 100)}%`; plabel.textContent = label;
  }
  function showError(msg) { fallback.textContent = msg; fallback.hidden = false; progress.hidden = true; }

  function applySrc(keepCamera) {
    const v = current(); if (!v || !mv) return;
    if (keepCamera && everLoaded) {
      try { const o = mv.getCameraOrbit(), t = mv.getCameraTarget(); pendingKeep = { orbit: `${o.theta}rad ${o.phi}rad ${o.radius}m`, target: `${t.x}m ${t.y}m ${t.z}m`, fov: mv.getFieldOfView() }; } catch (e) { pendingKeep = null; }
    } else { pendingKeep = null; mv.cameraOrbit = '0deg 75deg 62%'; mv.cameraTarget = 'auto auto auto'; mv.fieldOfView = 'auto'; }
    fallback.hidden = true;
    setProgress(0, `Loading ${fmtMB(v.size_mb) || ''}`.trim());
    mv.alt = `${objects[oi].label || 'Object'}, ${v.name} mesh`;
    mv.src = v.glb;
  }

  async function ensureViewer() {
    wantLive = true;
    if (mv) return;
    if (!webgl) return;
    overlay.hidden = true; setProgress(0, 'Loading viewer');
    try { await loadLib(); } catch (e) { showError('The 3D viewer could not be loaded. Static previews are still shown.'); overlay.hidden = false; return; }
    mv = document.createElement('model-viewer');
    mv.setAttribute('camera-controls', ''); mv.setAttribute('touch-action', 'pan-y');
    mv.setAttribute('shadow-intensity', '0'); mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('camera-orbit', '0deg 75deg 62%'); mv.setAttribute('tone-mapping', 'neutral');
    mv.setAttribute('exposure', '1'); mv.setAttribute('min-camera-orbit', 'auto auto 25%'); mv.setAttribute('loading', 'eager');
    mv.setAttribute('aria-label', '3D mesh viewer');
    // wheel zooms only with Ctrl/Cmd, so the page keeps scrolling over the viewer
    mv.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) e.stopImmediatePropagation(); }, { capture: true, passive: true });
    mv.addEventListener('progress', (e) => { const p = e.detail && e.detail.totalProgress; if (typeof p === 'number') { fill.style.width = `${Math.round(p * 100)}%`; } });
    mv.addEventListener('load', () => {
      if (pendingKeep) { mv.cameraOrbit = pendingKeep.orbit; mv.cameraTarget = pendingKeep.target; try { mv.jumpCameraToGoal(); } catch (e) { /* ignore */ } pendingKeep = null; }
      else { try { mv.jumpCameraToGoal(); } catch (e) { /* ignore */ } }
      mv.dismissPoster && mv.dismissPoster();
      everLoaded = true; progress.hidden = true; stage.classList.add('is-live'); paintUI();
    });
    mv.addEventListener('error', (e) => { showError('This mesh could not be loaded. The preview image is shown instead.'); stage.classList.remove('is-live'); });
    if (rot.checked) mv.setAttribute('auto-rotate', '');
    stage.insertBefore(mv, overlay);
    applySrc(false);
  }

  function selectObject(i) {
    if (i === oi) return;
    oi = i;
    if (!slot(objects[oi], kind)) kind = 'ours';
    if (!slot(objects[oi], kind)) kind = objects[oi].variants[0] ? kindOf(objects[oi].variants[0].name) : 'ours';
    paintUI();
    if (mv) { stage.classList.remove('is-live'); applySrc(false); } else if (wantLive) ensureViewer();
  }
  function selectVariant(k) {
    if (k === kind || !slot(objects[oi], k)) return;
    kind = k; paintUI();
    if (mv) applySrc(true); else if (wantLive || !coarse) { /* posters swap; live loads on demand */ }
  }

  rot.addEventListener('change', () => { if (!mv) return; rot.checked ? mv.setAttribute('auto-rotate', '') : mv.removeAttribute('auto-rotate'); });
  reset.addEventListener('click', () => { if (!mv) return; mv.cameraOrbit = '0deg 75deg 62%'; mv.cameraTarget = 'auto auto auto'; mv.fieldOfView = 'auto'; try { mv.jumpCameraToGoal(); } catch (e) { /* ignore */ } });
  loadBtn.addEventListener('click', ensureViewer);
  poster.addEventListener('click', () => { if (webgl && !mv) ensureViewer(); });

  if (!webgl) {
    overlay.hidden = true; tools.hidden = true;
    fallback.textContent = 'WebGL is not available in this browser, so the interactive viewer is off. Static previews of each mesh are shown; the buttons still switch between them.';
    fallback.hidden = false;
  }
  paintUI();
  if (webgl && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => {
      if (es.some((x) => x.isIntersecting)) { io.disconnect(); if (!coarse) ensureViewer(); }
    }, { threshold: 0.35 });
    io.observe(stage);
  } else if (webgl && !coarse) { ensureViewer(); }
}
