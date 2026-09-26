// nav.js: sticky nav that appears after the hero CTAs leave view, scroll-spy, menu dialog, goto links.
const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function targetFor(name) {
  return document.getElementById(name) || document.querySelector(`[data-section="${name}"]`);
}

export function initNav() {
  // every data-section gets an id so anchors work
  document.querySelectorAll('[data-section]').forEach((s) => { if (!s.id) s.id = s.dataset.section; });

  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  const links = [...nav.querySelectorAll('[data-nav-link]')];
  for (const a of links) {
    if (!targetFor(a.dataset.navLink)) a.hidden = true; // section not on the page (yet)
  }
  const live = links.filter((a) => !a.hidden);

  // the slim header is visible from the first paint; is-scrolled only adds a background
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // scroll spy
  const setCurrent = (name) => {
    for (const a of [...live, ...document.querySelectorAll('.menu-links a')]) {
      if (a.dataset.navLink === name) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    }
  };
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setCurrent(e.target.dataset.section);
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    for (const a of live) { const t = targetFor(a.dataset.navLink); if (t) spy.observe(t); }
    // clear highlight while in hero
    const hero = document.querySelector('[data-section="hero"]');
    if (hero) new IntersectionObserver(([e]) => { if (e.isIntersecting) setCurrent(''); }, { threshold: 0.5 }).observe(hero);
  }

  // menu dialog (small screens)
  const dlg = document.querySelector('[data-nav-dialog]');
  const openBtn = document.querySelector('[data-nav-open]');
  if (dlg && openBtn && typeof dlg.showModal === 'function') {
    const box = dlg.querySelector('.menu-links');
    box.replaceChildren(...live.map((a) => {
      const c = a.cloneNode(true);
      c.removeAttribute('hidden');
      c.addEventListener('click', () => dlg.close());
      return c;
    }));
    openBtn.addEventListener('click', () => { dlg.showModal(); openBtn.setAttribute('aria-expanded', 'true'); });
    dlg.addEventListener('close', () => openBtn.setAttribute('aria-expanded', 'false'));
    dlg.querySelector('[data-nav-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  } else if (openBtn) openBtn.hidden = true;

  // rays draw in once
  const rays = document.querySelectorAll('.ray');
  if ('IntersectionObserver' in window && !reduce()) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.2 });
    rays.forEach((r) => io.observe(r));
  } else rays.forEach((r) => r.classList.add('is-in'));

  // goto links: robust to a section id that does not exist yet
  const fallback = { bibtex: 'notes' };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-goto]');
    if (!a) return;
    const name = a.dataset.goto;
    const t = targetFor(name) || targetFor(fallback[name] || '');
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
    try { history.replaceState(null, '', '#' + (t.id || name)); } catch (_) { /* ignore */ }
  });
}
