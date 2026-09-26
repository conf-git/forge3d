// results.js: renders data/results.json as tables. Numbers only come from the JSON.
// Best per column is bold, second best is underlined; both are computed here from the numbers.
import { h } from './slider.js';

const EM = '—';

export function decimalsFor(col, table, j) {
  if (Array.isArray(table.decimals) && Number.isInteger(table.decimals[j])) return table.decimals[j];
  const c = String(col);
  if (/psnr/i.test(c)) return 2;
  if (/cd|chamfer/i.test(c)) return 4;
  if (/lpips|ssim|f@|f-?score|f1|nc\b|normal/i.test(c)) return 3;
  if (/add|ar\b|mm|error/i.test(c)) return 1;
  return 3;
}

const isShown = (c) => c && c.frozen === true && c.pending !== true && typeof c.v === 'number' && Number.isFinite(c.v);

/** returns Map(rowIndex -> 'best'|'second') for one column */
export function rankColumn(table, j, dec) {
  const lower = !!(table.lower_is_better || [])[j];
  const vals = [];
  table.rows.forEach((r, i) => {
    const c = r.cells[j];
    if (isShown(c)) vals.push({ i, s: Number(c.v.toFixed(dec)) });
  });
  const distinct = [...new Set(vals.map((x) => x.s))].sort((a, b) => (lower ? a - b : b - a));
  const out = new Map();
  for (const x of vals) {
    if (x.s === distinct[0]) out.set(x.i, 'best');
    else if (x.s === distinct[1]) out.set(x.i, 'second');
  }
  return out;
}

export function computeDeltas(table) {
  const res = [];
  table.columns.forEach((col, j) => {
    const dec = decimalsFor(col, table, j);
    const lower = !!(table.lower_is_better || [])[j];
    const better = (a, b) => (lower ? a < b : a > b);
    let ours = null, base = null;
    table.rows.forEach((r) => {
      const c = r.cells[j];
      if (!isShown(c)) return;
      const cand = { v: c.v, name: r.method };
      if (r.is_ours) { if (!ours || better(cand.v, ours.v)) ours = cand; }
      else if (!base || better(cand.v, base.v)) base = cand;
    });
    if (!ours || !base) return;
    const o = Number(ours.v.toFixed(dec)), b = Number(base.v.toFixed(dec));
    const state = o === b ? 'tie' : better(o, b) ? 'better' : 'worse';
    const diff = ours.v - base.v;
    const pct = base.v !== 0 ? Math.abs(diff / base.v) * 100 : null;
    res.push({ col, dec, ours, base, state, diff, pct, lower });
  });
  return res;
}

function fmtPct(p) { return p === null ? '' : (p >= 10 ? p.toFixed(0) : p.toFixed(1)) + '%'; }

function buildTable(t) {
  const decs = t.columns.map((c, j) => decimalsFor(c, t, j));
  const ranks = t.columns.map((c, j) => rankColumn(t, j, decs[j]));
  let pendingCells = 0;

  const thead = h('thead', {}, h('tr', {},
    h('th', { class: 'method', scope: 'col', text: 'Method' }),
    ...t.columns.map((c, j) => {
      const low = (t.lower_is_better || [])[j];
      return h('th', { scope: 'col' }, c,
        h('span', { class: 'arr', 'aria-hidden': 'true', text: low ? '↓' : '↑' }),
        h('span', { class: 'sr-only', text: low ? ', lower is better' : ', higher is better' }));
    })));

  const tbody = h('tbody', {}, ...t.rows.map((r, i) => {
    const allPending = r.cells.every((c) => !isShown(c));
    const th = h('th', { class: 'method', scope: 'row' }, r.method,
      allPending ? h('span', { class: 'pend-tag', text: 'pending' }) : null);
    const tds = r.cells.map((c, j) => {
      if (!isShown(c)) {
        pendingCells++;
        return h('td', { class: 'pend' }, EM, h('span', { class: 'sr-only', text: ' pending, not final' }));
      }
      const txt = c.v.toFixed(decs[j]);
      const rk = ranks[j].get(i);
      const inner = rk === 'best' ? h('span', { class: 'b' }, txt, h('span', { class: 'sr-only', text: ' (best)' }))
        : rk === 'second' ? h('span', { class: 'u' }, txt, h('span', { class: 'sr-only', text: ' (second best)' }))
          : txt;
      return h('td', {}, inner);
    });
    return h('tr', { class: r.is_ours ? 'ours' : 'baseline' }, th, ...tds);
  }));

  return { table: h('table', { class: 'res-table' }, h('caption', { class: 'sr-only', text: t.title || t.id }), thead, tbody), pendingCells };
}

function buildPanel(t, active) {
  const { table, pendingCells } = buildTable(t);
  const meta = h('div', { class: 'res-meta' },
    t.dataset ? h('span', {}, h('b', { text: 'Set' }), t.dataset) : null,
    t.views != null ? h('span', {}, h('b', { text: 'Views' }), String(t.views)) : null,
    t.n_objects != null ? h('span', {}, h('b', { text: 'Objects' }), String(t.n_objects)) : null,
    t.protocol ? h('span', { class: 'res-protocol' }, h('b', { text: 'Protocol' }), t.protocol) : null);

  const wrap = h('div', { class: 'tbl-wrap', role: 'region', tabindex: '0', 'aria-label': `${t.title || t.id}: results table, scrolls horizontally` }, table);

  const legend = h('div', { class: 'res-legend' },
    h('span', {}, h('span', { class: 'b', text: 'Bold' }), ' best in column'),
    h('span', {}, h('span', { class: 'u', text: 'Underline' }), ' second best'),
    h('span', {}, '↓ lower is better, ↑ higher is better'),
    h('span', {}, `${EM} not final`));

  const pending = pendingCells
    ? h('p', { class: 'pending-note' }, `${EM} marks a value that is not final yet, so no number is shown. It is never estimated. `
      + `${pendingCells} cell${pendingCells === 1 ? '' : 's'} pending in this table.`)
    : null;

  const ds = computeDeltas(t);
  const deltas = ds.length ? h('div', { class: 'deltas-wrap' },
    h('h4', { text: 'FORGE3D vs best baseline, per column (computed from the cells above)' }),
    h('ul', { class: 'deltas' }, ...ds.map((d) => h('li', { class: `delta d-${d.state}`, title: `Absolute difference ${d.diff >= 0 ? '+' : ''}${d.diff.toFixed(d.dec)}` },
      h('span', { class: 'd-col', text: d.col }),
      h('span', { class: 'd-res' },
        h('span', { class: 'd-word', text: d.state === 'tie' ? 'tied' : d.state === 'better' ? 'better' : 'worse' }),
        d.state !== 'tie' && d.pct !== null ? h('span', { class: 'd-pct', text: fmtPct(d.pct) }) : null),
      h('span', { class: 'd-vals' }, h('b', { text: d.ours.v.toFixed(d.dec) }), ' vs ', d.base.v.toFixed(d.dec), ` (${d.base.name})`))))) : null;

  const notes = (t.notes && t.notes.length) ? h('ul', { class: 'res-notes' }, ...t.notes.map((n) => h('li', { text: n }))) : null;

  return h('div', { class: 'res-panel', role: 'tabpanel', id: `res-panel-${t.id}`, 'aria-labelledby': `res-tab-${t.id}`, hidden: active ? null : true },
    h('div', { class: 'res-head' }, h('h3', { text: t.title || t.id })), meta, wrap, legend, pending, deltas, notes);
}

export function initResults(host, data) {
  const tables = (data && data.tables) || [];
  if (!host) return;
  if (!tables.length) { host.replaceChildren(h('p', { class: 'prov', text: 'Results are not available yet.' })); return; }

  const tabs = tables.map((t, i) => h('button', {
    type: 'button', class: 'tab', role: 'tab', id: `res-tab-${t.id}`, 'aria-controls': `res-panel-${t.id}`,
    'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1', text: t.title || t.id,
  }));
  const panels = tables.map((t, i) => buildPanel(t, i === 0));

  const select = (i, focus) => {
    tabs.forEach((b, k) => { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
    panels.forEach((p, k) => { p.hidden = k !== i; });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => select(i, false));
    b.addEventListener('keydown', (e) => {
      const n = tabs.length;
      let to = null;
      if (e.key === 'ArrowRight') to = (i + 1) % n;
      else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = n - 1;
      if (to !== null) { e.preventDefault(); select(to, true); }
    });
  });

  host.replaceChildren(
    tables.length > 1 ? h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Result tables' }, ...tabs) : null,
    ...panels);
  if (tables.length === 1) { panels[0].hidden = false; panels[0].removeAttribute('role'); }
}
