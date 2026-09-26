/* hero-anim.js : dependency-free hero visual (canvas 2D) + method-diagram layer helper.
 *
 *   ForgeHero.mount(canvas, opts)  -> instance {seek(t), play(), pause(), destroy()}
 *   ForgeHero.destroy([canvas])    -> destroy one instance (or all)
 *   ForgeMethod.setLayer(svg, "geometry"|"appearance"|"attention"|"all")
 *
 * Illustrative visualization, not model output: camera cards send thin rays to one point,
 * where a low-poly mesh forms. No network, no storage, no cookies.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var registry = [];

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hex2rgb(h) {
    h = (h || '').trim();
    if (h.charAt(0) !== '#') return null;
    if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
    if (h.length !== 7) return null;
    var n = parseInt(h.slice(1), 16);
    return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function cssColor(el, name, fallback) {
    var v = '';
    try { v = getComputedStyle(el).getPropertyValue(name); } catch (e) {}
    return hex2rgb(v) || fallback;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round); }

  /* ---- vector helpers ---- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* ---- static scene (built once) ---- */
  function buildScene() {
    var R = 2.15, cams = [];
    var az = [-150, -100, -52, -8, 34, 80, 125, 168];
    var el = [22, -8, 34, 4, 26, -14, 14, 30];
    for (var i = 0; i < az.length; i++) {
      var a = az[i] * Math.PI / 180, e = el[i] * Math.PI / 180;
      var c = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
      var right = norm(cross([0, 1, 0], c)), up = cross(c, right);
      var P = [c[0] * R, c[1] * R, c[2] * R], hw = 0.34, hh = 0.25, corners = [];
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
        corners.push([P[0] + right[0] * hw * s[0] + up[0] * hh * s[1],
                      P[1] + right[1] * hw * s[0] + up[1] * hh * s[1],
                      P[2] + right[2] * hw * s[0] + up[2] * hh * s[1]]);
      });
      cams.push({ c: c, P: P, corners: corners, right: right, up: up, hw: hw, hh: hh });
    }
    // low-poly lathe (a gourd-like object), deterministic jitter
    var rnd = mulberry(7), S = 12;
    var prof = [[0.0, -0.74], [0.36, -0.66], [0.52, -0.38], [0.46, -0.06], [0.28, 0.16], [0.24, 0.36], [0.34, 0.56], [0.2, 0.72], [0.0, 0.78]];
    var verts = [];
    for (var i2 = 0; i2 < prof.length; i2++) {
      var ring = [];
      for (var j = 0; j < S; j++) {
        var th = j / S * TAU + (i2 % 2) * 0.26;
        var r = prof[i2][0] * (i2 === 0 || i2 === prof.length - 1 ? 1 : 1 + (rnd() - 0.5) * 0.14);
        ring.push([r * Math.cos(th), prof[i2][1] + (i2 === 0 || i2 === prof.length - 1 ? 0 : (rnd() - 0.5) * 0.05), r * Math.sin(th)]);
      }
      verts.push(ring);
    }
    var faces = [];
    for (var i3 = 0; i3 < prof.length - 1; i3++) {
      for (var j2 = 0; j2 < S; j2++) {
        var j3 = (j2 + 1) % S;
        var A = verts[i3][j2], B = verts[i3][j3], C = verts[i3 + 1][j3], D = verts[i3 + 1][j2];
        if (i3 > 0) faces.push([A, B, D]);
        if (i3 < prof.length - 2) faces.push([B, C, D]);
        if (i3 === 0) faces.push([B, C, D]);
        if (i3 === prof.length - 2) faces.push([A, B, D]);
      }
    }
    faces = faces.map(function (f, k) {
      var cen = [(f[0][0] + f[1][0] + f[2][0]) / 3, (f[0][1] + f[1][1] + f[2][1]) / 3, (f[0][2] + f[1][2] + f[2][2]) / 3];
      var n = norm(cross(sub(f[1], f[0]), sub(f[2], f[0])));
      if (dot(n, [cen[0], 0, cen[2]]) < 0 && Math.abs(cen[1]) < 0.7) n = [-n[0], -n[1], -n[2]];
      else if (Math.abs(cen[1]) >= 0.7 && n[1] * cen[1] < 0) n = [-n[0], -n[1], -n[2]];
      var thr = 0.62 * (1 - (cen[1] + 0.78) / 1.56) + 0.38 * rnd();
      return { v: f, cen: cen, n: n, thr: thr };
    });
    return { R: R, cams: cams, faces: faces };
  }
  var SCENE = null;

  var DEFAULTS = {
    fps: 30,            // frame cap
    loop: 10,           // seconds per cycle
    scale: 1,           // overall size multiplier
    anchor: null,       // {x, y} fractions of the canvas for the convergence point; auto if null
    dprCap: 2,
    staticAt: 0.82,     // cycle position drawn when motion is disabled
    forceStatic: false, // draw one frame only
    colors: null        // {amber, ember, text, surface} rgb arrays, otherwise read from CSS variables
  };

  function mount(canvas, options) {
    if (!canvas || !canvas.getContext) return null;
    destroy(canvas);
    if (!SCENE) SCENE = buildScene();
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    if (options) for (k in options) o[k] = options[k];

    var ctx = canvas.getContext('2d');
    var col = o.colors || {};
    var amber = col.amber || cssColor(canvas, '--amber', [245, 184, 75]);
    var ember = col.ember || cssColor(canvas, '--ember', [255, 107, 74]);
    var text = col.text || cssColor(canvas, '--text', [237, 241, 244]);
    var surface = col.surface || cssColor(canvas, '--raised', [22, 28, 36]);
    var W = 0, H = 0, dpr = 1;
    var raf = 0, running = false, visible = true, docVisible = !document.hidden;
    var tNow = 0, lastTs = 0, lastDraw = 0, seeked = false;
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var reduced = !!(mq && mq.matches) || !!o.forceStatic;
    var ro = null, io = null;

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, o.dprCap);
      W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(tNow);
    }

    /* projection state, refreshed per frame */
    var cx, cy, f, yaw, pitch, cyaw, syaw, cp, sp;
    function setView(t) {
      var narrow = W < 640;
      var ax = o.anchor ? o.anchor.x : (narrow ? 0.5 : 0.62);
      var ay = o.anchor ? o.anchor.y : 0.5;
      cx = W * ax; cy = H * ay;
      f = 1.55 * Math.min(W * (narrow ? 0.82 : 0.9), H) * o.scale;
      yaw = 0.55 + 0.32 * Math.sin(t * 0.33);
      pitch = 0.3;
      cyaw = Math.cos(yaw); syaw = Math.sin(yaw); cp = Math.cos(pitch); sp = Math.sin(pitch);
    }
    function rot(p) {
      var x = p[0] * cyaw + p[2] * syaw, z = -p[0] * syaw + p[2] * cyaw, y = p[1];
      var y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      return [x, y2, z2];
    }
    function proj(q) {
      var d = 7 - q[2], s = f / d;
      return [cx + q[0] * s, cy - q[1] * s, q[2]];
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      setView(t);
      var L = o.loop, u = reduced ? o.staticAt : ((t % L) / L);
      var fade = sstep(0, 0.1, u) * (1 - sstep(0.94, 1, u));
      var F = sstep(0.22, 0.78, u);
      var lw = Math.max(1, W / 900);

      var center = proj(rot([0, 0, 0]));
      // convergence glow
      var glow = (0.55 * sstep(0.1, 0.4, u) * (1 - 0.65 * F) + 0.08) * fade;
      var gr = f / 7 * 0.9;
      var g = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], gr);
      g.addColorStop(0, rgba(amber, 0.30 * glow)); g.addColorStop(1, rgba(amber, 0));
      ctx.fillStyle = g; ctx.fillRect(center[0] - gr, center[1] - gr, gr * 2, gr * 2);

      var cams = SCENE.cams, items = [];
      // rays + cards
      for (var i = 0; i < cams.length; i++) {
        var cam = cams[i];
        var P = proj(rot(cam.P));
        var tgtW = [-cam.c[0] * 0, 0, 0];
        var endW = [cam.c[0] * 0.66, cam.c[1] * 0.66, cam.c[2] * 0.66]; // ray stops near the mesh surface
        var E = proj(rot(endW));
        var camA = fade * sstep(0.02 + i * 0.012, 0.16 + i * 0.012, u);
        var head = clamp((u - 0.12 - i * 0.022) / 0.3, 0, 1);
        var depthShade = 0.55 + 0.45 * sstep(-2.3, 2.3, rot(cam.P)[2]);
        // frustum edges (faint)
        for (var c = 0; c < 4; c++) {
          var Cp = proj(rot(cam.corners[c]));
          var ex = Cp[0] + (E[0] - Cp[0]) * head, ey = Cp[1] + (E[1] - Cp[1]) * head;
          ctx.strokeStyle = rgba(amber, 0.3 * camA * depthShade);
          ctx.lineWidth = lw * 0.8;
          ctx.beginPath(); ctx.moveTo(Cp[0], Cp[1]); ctx.lineTo(ex, ey); ctx.stroke();
        }
        // central ray
        var hx = P[0] + (E[0] - P[0]) * head, hy = P[1] + (E[1] - P[1]) * head;
        ctx.strokeStyle = rgba(amber, 0.5 * camA * depthShade);
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(P[0], P[1]); ctx.lineTo(hx, hy); ctx.stroke();
        // travelling pulse
        if (head >= 1 || u > 0.4) {
          var s = ((u * 2.4 - i * 0.137) % 1 + 1) % 1;
          var env = sstep(0.14, 0.3, u) * (1 - sstep(0.8, 0.9, u)) * camA;
          if (reduced) { s = 0.55 + (i % 3) * 0.12; env = camA; }
          var s0 = Math.max(0, s - 0.14);
          var px0 = P[0] + (E[0] - P[0]) * s0, py0 = P[1] + (E[1] - P[1]) * s0;
          var px1 = P[0] + (E[0] - P[0]) * s, py1 = P[1] + (E[1] - P[1]) * s;
          var lg = ctx.createLinearGradient(px0, py0, px1, py1);
          lg.addColorStop(0, rgba(amber, 0)); lg.addColorStop(1, rgba(amber, 0.85 * env * depthShade));
          ctx.strokeStyle = lg; ctx.lineWidth = lw * 1.6;
          ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px1, py1); ctx.stroke();
        }
        items.push({ z: rot(cam.P)[2], cam: cam, a: camA, shade: depthShade });
      }

      // mesh
      var faces = SCENE.faces, vis = [];
      for (var j = 0; j < faces.length; j++) {
        var fc = faces[j];
        var a = clamp((F * 1.22 - fc.thr) / 0.2, 0, 1) * fade;
        var nr = rot(fc.n);
        var cr = rot(fc.cen);
        if (a <= 0.001) {
          // observation dots precede the surface
          var pd = clamp((F * 1.22 - fc.thr + 0.3) / 0.25, 0, 1) * fade;
          if (pd > 0.01 && nr[2] > -0.15) {
            var pp = proj(cr);
            ctx.fillStyle = rgba(amber, 0.7 * pd);
            ctx.beginPath(); ctx.arc(pp[0], pp[1], Math.max(1, lw * 1.2), 0, TAU); ctx.fill();
          }
          continue;
        }
        if (nr[2] < 0) continue;
        vis.push({ f: fc, a: a, n: nr, z: cr[2] });
      }
      vis.sort(function (p, q) { return p.z - q.z; });
      var Ld = norm([-0.45, 0.75, 0.6]);
      var dark = mix(surface, [8, 10, 14], 0.4), light = mix(text, amber, 0.18);
      for (var m = 0; m < vis.length; m++) {
        var vf = vis[m], q = vf.f.v;
        var lam = clamp(dot(vf.n, Ld), 0, 1);
        var body = mix(dark, light, 0.06 + 0.5 * lam);
        var p0 = proj(rot(q[0])), p1 = proj(rot(q[1])), p2 = proj(rot(q[2]));
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath();
        ctx.fillStyle = rgba(body, 0.92 * vf.a);
        ctx.fill();
        ctx.strokeStyle = rgba(amber, 0.42 * vf.a);
        ctx.lineWidth = lw * 0.8; ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // camera cards on top (far first)
      items.sort(function (p, q) { return p.z - q.z; });
      for (var n = 0; n < items.length; n++) {
        var it = items[n], cm = it.cam, A = Math.min(1, it.a * it.shade * 2.2);
        if (A <= 0.01) continue;
        var pts = cm.corners.map(function (cc) { return proj(rot(cc)); });
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (var v = 1; v < 4; v++) ctx.lineTo(pts[v][0], pts[v][1]);
        ctx.closePath();
        ctx.fillStyle = rgba(surface, 0.72 * A); ctx.fill();
        ctx.strokeStyle = rgba(text, 0.42 * A); ctx.lineWidth = lw; ctx.stroke();
        // inset "photo" area
        var ins = 0.62, mid = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2];
        ctx.beginPath();
        for (var w = 0; w < 4; w++) {
          var ix = mid[0] + (pts[w][0] - mid[0]) * ins, iy = mid[1] + (pts[w][1] - mid[1]) * ins;
          if (w === 0) ctx.moveTo(ix, iy); else ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(mix(surface, amber, 0.16), 0.75 * A); ctx.fill();
        // corner ticks (registration-frame nod)
        ctx.strokeStyle = rgba(amber, 0.85 * A); ctx.lineWidth = lw * 1.2;
        for (var t2 = 0; t2 < 4; t2++) {
          var a0 = pts[t2], a1 = pts[(t2 + 1) % 4], a3 = pts[(t2 + 3) % 4];
          ctx.beginPath();
          ctx.moveTo(a0[0] + (a3[0] - a0[0]) * 0.22, a0[1] + (a3[1] - a0[1]) * 0.22);
          ctx.lineTo(a0[0], a0[1]);
          ctx.lineTo(a0[0] + (a1[0] - a0[0]) * 0.22, a0[1] + (a1[1] - a0[1]) * 0.22);
          ctx.stroke();
        }
      }
    }

    /* ---- loop control ---- */
    function frame(ts) {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(frame);
      var minGap = 1000 / o.fps;
      if (ts - lastDraw < minGap - 1) return;
      if (!lastTs) lastTs = ts;
      tNow += Math.min((ts - lastTs) / 1000, 0.1);
      lastTs = ts; lastDraw = ts;
      draw(tNow);
    }
    function shouldRun() { return !reduced && visible && docVisible && !seeked; }
    function sync() {
      var want = shouldRun();
      if (want && !running) { running = true; lastTs = 0; raf = requestAnimationFrame(frame); }
      else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    }
    function onVis() { docVisible = !document.hidden; sync(); }
    function onMq() { reduced = !!(mq && mq.matches) || !!o.forceStatic; draw(tNow); sync(); }

    document.addEventListener('visibilitychange', onVis);
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(canvas); } else window.addEventListener('resize', resize);
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (es) { visible = es[es.length - 1].isIntersecting; sync(); }, { threshold: 0.01 });
      io.observe(canvas);
    }
    canvas.setAttribute('aria-hidden', 'true');
    resize();
    sync();

    var inst = {
      canvas: canvas,
      seek: function (sec) { seeked = true; reduced = false; tNow = sec; sync(); draw(tNow); },  // paused, for tests / stills
      play: function () { seeked = false; sync(); },
      pause: function () { seeked = true; sync(); },
      isRunning: function () { return running; },
      destroy: function () {
        running = false; if (raf) cancelAnimationFrame(raf); raf = 0;
        document.removeEventListener('visibilitychange', onVis);
        if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        if (io) io.disconnect();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        var ix = registry.indexOf(inst); if (ix >= 0) registry.splice(ix, 1);
      }
    };
    registry.push(inst);
    return inst;
  }

  function destroy(canvas) {
    var list = registry.slice();
    for (var i = 0; i < list.length; i++) if (!canvas || list[i].canvas === canvas) list[i].destroy();
  }

  /* ---- method diagram helper ---- */
  function setLayer(svg, layer) {
    if (!svg) return;
    svg.setAttribute('data-layer', layer || 'all');
    var members = svg.querySelectorAll('[data-layer]');
    for (var i = 0; i < members.length; i++) {
      var el = members[i], name = el.getAttribute('data-layer');
      el.classList.remove('is-active', 'is-dim');
      if (!layer || layer === 'all') continue;
      if (name === layer) el.classList.add('is-active'); else el.classList.add('is-dim');
    }
  }

  window.ForgeHero = { mount: mount, destroy: destroy };
  window.ForgeMethod = { setLayer: setLayer };
})();
