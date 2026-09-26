/* gallery.js (role F2): 'Against the field'. Rows x tiles from data/gallery.json, tag filters, calm failure marks, lightbox.
   export default init(root, data). */
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
const kindOf = (c) => (/^ours$|^forge3d/i.test(c) ? 'ours' : /^(input|observation)/i.test(c) || /^(gt|ground)/i.test(c) ? 'ref' : 'baseline');
// tag groups, in display order; unknown tags go to 'Other'
const GROUPS = [['Environment', ['Factory', 'Park']], ['Placement', ['Ground', 'Table', 'Robot table']]];

export default async function init(root, data) {
  const sec = findSection(root, 'gallery');
  if (!sec || sec.dataset.f2Init) return;
  sec.dataset.f2Init = '1';
  const q = (s) => sec.querySelector(s);
  const rowsEl = q('[data-rows]'), headEl = q('[data-head]'), filtersEl = q('[data-filters]'), countEl = q('[data-gl-count]');
  const dlg = q('[data-dialog]'), lbImg = q('[data-lb-img]'), lbCap = q('[data-lb-cap]');

  let g;
  try { g = await getData(data, 'gallery', 'data/gallery.json'); } catch (e) { rowsEl.appendChild(el('p', 'gl-empty', 'The gallery data could not be loaded.')); return; }
  const cols = g.columns || [], rows = g.rows || [];
  const canon = new Map(GROUPS.flatMap(([, l]) => l).map((t) => [t.toLowerCase(), t]));
  rows.forEach((r) => { r.tags = (r.tags || []).map((t) => canon.get(String(t).toLowerCase()) || t); });
  if (!rows.length) { rowsEl.appendChild(el('p', 'gl-empty', 'No examples are available yet.')); return; }
  sec.style.setProperty('--gl-cols', cols.length);

  // Pixal3D pending note: only when it is not a column
  const pix = q('[data-pixal]'); if (pix && cols.some((c) => /pixal/i.test(c))) pix.remove();
  // best-baseline rule from proof.json when available (keeps wording in one place)
  try {
    const p = data && data.proof; const rule = p && p.pairs && p.pairs[0] && p.pairs[0].best_baseline_rule;
    const li = sec.querySelector('[data-notes] li'); if (rule && li) li.textContent = rule;
  } catch (e) { /* keep static text */ }

  // display-only exposure lift, identical for every column
  const expo = q('[data-expo]'), tbl = q('[data-table]');
  if (expo && tbl) {
    const setLift = () => { tbl.classList.toggle('is-lifted', expo.checked); dlg.classList.toggle('is-lifted', expo.checked); };
    expo.addEventListener('change', setLift); setLift();
  }

  // header row (desktop)
  cols.forEach((c) => { const h = el('div', 'gl-th', c); h.dataset.kind = kindOf(c); headEl.appendChild(h); });

  // rows
  const view = []; // {row, li, tiles:[{btn, col, path}]}
  rows.forEach((r, ri) => {
    const li = el('article', 'gl-row'); li.setAttribute('aria-label', `Example ${ri + 1}`);
    const meta = el('div', 'gl-meta'); meta.appendChild(el('span', 'gl-rowno', `Example ${String(ri + 1).padStart(2, '0')}`));
    (r.tags || []).forEach((t) => meta.appendChild(el('span', 'gl-tag', t)));
    if (r.note) meta.appendChild(el('span', 'gl-note', r.note));
    const grid = el('div', 'gl-tiles'); const tiles = [];
    cols.forEach((c) => {
      const path = r.cells && r.cells[c]; const k = kindOf(c); const failed = (r.failure_of || []).includes(c);
      const b = el('button', 'gl-tile'); b.type = 'button'; b.dataset.kind = k; if (failed) b.dataset.fail = '1';
      b.setAttribute('aria-label', `${c}, example ${ri + 1}${failed ? ', visible failure' : ''}${path ? '' : ', not available'}`);
      if (path) {
        const im = new Image(); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.width = 640; im.height = 640; im.src = path;
        im.addEventListener('load', () => im.classList.add('is-in')); if (im.complete) im.classList.add('is-in');
        im.addEventListener('error', () => { im.remove(); b.appendChild(el('span', 'gl-na', 'Image missing')); b.disabled = true; });
        b.appendChild(im);
      } else { b.appendChild(el('span', 'gl-na', '— not available')); b.disabled = true; }
      b.appendChild(el('span', 'gl-lab', c));
      if (failed) b.appendChild(el('span', 'gl-fail', 'Visible failure'));
      const rec = { btn: b, col: c, path, failed };
      b.addEventListener('click', () => open(ri, tiles.indexOf(rec)));
      grid.appendChild(b); tiles.push(rec);
    });
    li.append(meta, grid); rowsEl.appendChild(li); view.push({ row: r, li, tiles });
  });

  // filters: chips, OR inside a group, AND across groups
  const present = new Set(rows.flatMap((r) => r.tags || []));
  const groups = GROUPS.map(([n, list]) => [n, list.filter((t) => present.has(t))]).filter(([, l]) => l.length);
  const known = new Set(GROUPS.flatMap(([, l]) => l)); const other = [...present].filter((t) => !known.has(t));
  if (other.length) groups.push(['Other', other]);
  const sel = new Map(groups.map(([n]) => [n, new Set()]));
  const chips = [];
  groups.forEach(([n, list]) => {
    const wrap = el('div', 'gl-group'); wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', n);
    wrap.appendChild(el('span', 'gl-group-label', n));
    list.forEach((t) => {
      const b = el('button', 'gl-chip', t); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { const s = sel.get(n); s.has(t) ? s.delete(t) : s.add(t); apply(); });
      wrap.appendChild(b); chips.push([n, t, b]);
    });
    filtersEl.appendChild(wrap);
  });
  const clear = el('button', 'gl-chip', 'Clear filters'); clear.type = 'button'; clear.hidden = true;
  clear.addEventListener('click', () => { sel.forEach((s) => s.clear()); apply(); });
  filtersEl.appendChild(clear);
  function apply() {
    let n = 0;
    chips.forEach(([g2, t, b]) => b.setAttribute('aria-pressed', sel.get(g2).has(t)));
    clear.hidden = ![...sel.values()].some((s) => s.size);
    view.forEach((v) => {
      const tags = v.row.tags || [];
      const ok = groups.every(([gn, list]) => { const s = sel.get(gn); return !s.size || [...s].some((t) => tags.includes(t)); });
      v.li.hidden = !ok; if (ok) n++;
    });
    countEl.textContent = `Showing ${n} of ${view.length} examples`;
    if (!n) { if (!rowsEl.querySelector('.gl-empty')) rowsEl.appendChild(el('p', 'gl-empty', 'No example matches this combination of filters.')); }
    else rowsEl.querySelectorAll('.gl-empty').forEach((x) => x.remove());
  }
  apply();

  // lightbox
  let cur = { r: 0, c: 0 };
  const usable = (r) => view[r].tiles.map((t, i) => (t.path ? i : -1)).filter((i) => i >= 0);
  function paint() {
    const t = view[cur.r].tiles[cur.c];
    lbImg.src = t.path; lbImg.alt = `${t.col}, example ${cur.r + 1}`;
    lbCap.textContent = `Example ${String(cur.r + 1).padStart(2, '0')} · ${t.col}${t.failed ? ' · visible failure' : ''}${(view[cur.r].row.tags || []).length ? ' · ' + view[cur.r].row.tags.join(', ') : ''}`;
  }
  function step(d) { const u = usable(cur.r); if (!u.length) return; const i = u.indexOf(cur.c); cur.c = u[(i + d + u.length) % u.length]; paint(); }
  function open(r, c) { cur = { r, c }; paint(); if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
  q('[data-prev]').addEventListener('click', () => step(-1));
  q('[data-next]').addEventListener('click', () => step(1));
  q('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } });
}
