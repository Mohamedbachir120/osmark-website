/* OsMark scroll scenes. Each pinned act reads its own 0..1 progress from scroll. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const range = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  const vw = () => document.documentElement.clientWidth;
  const vh = () => window.innerHeight;
  const progress = (section) => {
    const r = section.getBoundingClientRect();
    const span = r.height - vh();
    return span > 0 ? clamp(-r.top / span) : 0;
  };

  /* ---------- ACT 1: dive into the laptop screen ---------- */
  const hero = document.querySelector('[data-act="hero"]');
  const stage = hero.querySelector('[data-stage]');
  const screen = hero.querySelector('[data-screen]');
  const heroCopy = hero.querySelector('[data-hero-copy]');
  const IMG_W = 1672, IMG_H = 941;
  // Inner corners of the laptop display in the source image (tl, tr, br, bl).
  const QUAD = [[837, 128], [1584, 108], [1538, 641], [765, 603]];
  const SHOT_W = 1440, SHOT_H = 900;
  let H = {};

  // Solve the projective transform that maps the screenshot rectangle onto the screen quad.
  function homography(w, h, pts) {
    const src = [[0, 0], [w, 0], [w, h], [0, h]];
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = pts[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    for (let c = 0; c < 8; c++) {
      let m = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r;
      [A[c], A[m]] = [A[m], A[c]]; [B[c], B[m]] = [B[m], B[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        B[r] -= f * B[c];
      }
    }
    const s = B.map((b, i) => b / A[i][i]);
    return `matrix3d(${s[0]},${s[3]},0,${s[6]},${s[1]},${s[4]},0,${s[7]},0,0,1,0,${s[2]},${s[5]},0,1)`;
  }

  function layoutHero() {
    const W0 = vw(), H0 = vh();
    const aspect = IMG_W / IMG_H;
    let W, Hh, left, top;
    if (W0 / H0 < 0.9) {
      // Portrait phone: show the whole laptop in the upper part of the frame, copy below it.
      W = W0 / 0.74; Hh = W / aspect;
      left = W0 / 2 - 0.62 * W;
      top = H0 * 0.3 - 0.47 * Hh;
    } else {
      if (W0 / H0 > aspect) { W = W0; Hh = W0 / aspect; } else { Hh = H0; W = H0 * aspect; }
      const fx = parseFloat(stage.dataset.focusX || 0.5);
      left = clamp(W0 / 2 - fx * W, W0 - W, 0);
      top = (H0 - Hh) / 2;
    }
    stage.style.width = W + 'px';
    stage.style.height = Hh + 'px';
    const k = W / IMG_W;
    const quad = QUAD.map(([x, y]) => [x * k, y * k]);
    screen.style.width = SHOT_W + 'px';
    screen.style.height = SHOT_H + 'px';
    screen.style.transform = homography(SHOT_W, SHOT_H, quad);
    const xs = quad.map((q) => q[0]), ys = quad.map((q) => q[1]);
    const sw = Math.max(...xs) - Math.min(...xs), sh = Math.max(...ys) - Math.min(...ys);
    const cx = xs.reduce((a, b) => a + b) / 4, cy = ys.reduce((a, b) => a + b) / 4;
    // End scale: the screen fills about 92% of whichever viewport side runs out first.
    const S = Math.min((W0 * 0.92) / sw, (H0 * 0.92) / sh);
    H = { left, top, cx, cy, S, W0, H0 };
  }

  function renderHero(p) {
    const z = ease(range(p, 0.12, 0.88));
    const s = lerp(1, H.S, z);
    const px = lerp(H.left + H.cx, H.W0 / 2, z);
    const py = lerp(H.top + H.cy, H.H0 / 2, z);
    stage.style.transform = `translate3d(${px - s * H.cx}px, ${py - s * H.cy}px, 0) scale(${s})`;
    screen.style.opacity = range(p, 0.46, 0.6).toFixed(3);
    const c = range(p, 0.04, 0.3);
    heroCopy.style.opacity = (1 - c).toFixed(3);
    heroCopy.style.transform = `translate3d(0, ${-60 * easeOut(c)}px, 0)`;
    heroCopy.style.visibility = c >= 1 ? 'hidden' : 'visible';
    hero.querySelector('.hero-scrim').style.opacity = (1 - c).toFixed(3);
  }

  /* ---------- ACT 2: sideways rail through the shoots ---------- */
  const railAct = document.querySelector('[data-act="rail"]');
  const rail = railAct.querySelector('[data-rail]');
  const shotImgs = [...rail.querySelectorAll('.shot-frame img')];
  let railTravel = 0;
  function layoutRail() {
    railTravel = Math.max(0, rail.scrollWidth - vw());
    if (!reduced) railAct.style.height = railTravel + vh() * 1.15 + 'px';
  }
  function renderRail(p) {
    const t = range(p, 0.04, 0.96);
    rail.style.transform = `translate3d(${-railTravel * t}px, 0, 0)`;
    // Inner parallax: each photo drifts against the rail as it crosses the viewport.
    const W0 = vw();
    shotImgs.forEach((img) => {
      const r = img.parentElement.getBoundingClientRect();
      const d = clamp((r.left + r.width / 2 - W0 / 2) / W0, -1, 1);
      img.style.transform = `translate3d(${d * -5}%, 0, 0)`;
    });
  }

  /* ---------- ACT 3: the phones open out of a slit ---------- */
  const workAct = document.querySelector('[data-act="work"]');
  const workImg = workAct.querySelector('[data-work-img]');
  const workItems = [...workAct.querySelectorAll('[data-work-list] li')];
  let tiltX = 0, tiltY = 0, tx = 0, ty = 0;
  function renderWork(p) {
    const o = ease(range(p, 0.05, 0.55));
    const side = lerp(46, 0, o), vert = lerp(18, 0, o);
    workImg.style.clipPath = `inset(${vert}% ${side}% ${vert}% ${side}% round 18px)`;
    tx = lerp(tx, tiltX, 0.08); ty = lerp(ty, tiltY, 0.08);
    workImg.style.transform = `perspective(1400px) rotateY(${tx * 4}deg) rotateX(${ty * -3}deg) scale(${lerp(1.08, 1, o)})`;
    workItems.forEach((li, i) => li.classList.toggle('on', p > 0.5 + i * 0.06));
  }
  if (!reduced && window.matchMedia('(pointer: fine)').matches) {
    workAct.addEventListener('pointermove', (e) => {
      tiltX = (e.clientX / vw()) * 2 - 1;
      tiltY = (e.clientY / vh()) * 2 - 1;
    });
    workAct.addEventListener('pointerleave', () => { tiltX = 0; tiltY = 0; });
  }

  /* ---------- ACT 5: the close settles into focus ---------- */
  const closeAct = document.querySelector('[data-act="close"]');
  const closeImg = closeAct.querySelector('[data-close-img]');
  const closeCopy = closeAct.querySelector('[data-close-copy]');
  function renderClose(p) {
    const t = easeOut(range(p, 0, 0.6));
    closeImg.style.transform = `scale(${lerp(1.18, 1, t)})`;
    closeImg.style.filter = `brightness(${lerp(0.45, 1, t)}) blur(${lerp(6, 0, t)}px)`;
    const c = range(p, 0.35, 0.65);
    closeCopy.style.opacity = c.toFixed(3);
    closeCopy.style.translate = `0 ${lerp(30, 0, easeOut(c))}px`;
  }

  /* ---------- reveal on enter (services) ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));

  /* ---------- loop ---------- */
  function layout() { layoutHero(); layoutRail(); }
  layout();

  if (reduced) {
    renderHero(0);
    workItems.forEach((li) => li.classList.add('on'));
    closeCopy.style.opacity = 1;
    window.addEventListener('resize', () => { layout(); renderHero(0); });
    return;
  }

  let lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const el = id.length > 1 ? document.querySelector(id) : document.body;
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: 0 });
      });
    });
  }

  const header = document.querySelector('.top');
  function frame(time) {
    header.classList.toggle('solid', window.scrollY > hero.offsetHeight - vh());
    if (lenis) lenis.raf(time);
    renderHero(progress(hero));
    renderRail(progress(railAct));
    renderWork(progress(workAct));
    renderClose(progress(closeAct));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  window.addEventListener('load', layout);
})();
