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

  // Solve the projective transform that sends four source points onto four target points.
  function solveH(src, dst) {
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
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
    return B.map((b, i) => b / A[i][i]);
  }
  const applyH = (s, [x, y]) => {
    const w = s[6] * x + s[7] * y + 1;
    return [(s[0] * x + s[1] * y + s[2]) / w, (s[3] * x + s[4] * y + s[5]) / w];
  };
  // CSS matrix3d that maps a w by h element onto the quad pts (tl, tr, br, bl).
  function homography(w, h, pts) {
    const s = solveH([[0, 0], [w, 0], [w, h], [0, h]], pts);
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
      const fx = Number.parseFloat(stage.dataset.focusX || '0.5');
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
    const cx = xs.reduce((a, b) => a + b, 0) / 4;
    const cy = ys.reduce((a, b) => a + b, 0) / 4;
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

  /* ---------- ACT 3b: one plot, from a line on a map to a lit building ---------- */
  const buildAct = document.querySelector('[data-act="build"]');
  const bStage = buildAct.querySelector('[data-build-stage]');
  const bFrames = [...bStage.querySelectorAll('.build-frame')];
  const bPlan = buildAct.querySelector('[data-build-plan]');
  const bIntro = buildAct.querySelector('[data-build-intro]');
  const bHud = buildAct.querySelector('[data-build-hud]');
  const bFloor = buildAct.querySelector('[data-build-floor]');
  const bCaption = buildAct.querySelector('.build-caption');
  const bName = buildAct.querySelector('[data-build-name]');
  const bText = buildAct.querySelector('[data-build-text]');
  const bSteps = buildAct.querySelector('[data-build-steps]');
  const bStepItems = [...bSteps.children];
  const bBar = buildAct.querySelector('[data-build-bar]');
  const B_W = 1536, B_H = 1024;
  // The plot boundary in the plan (bl, tl, tr, br) and the same corners in the photos.
  const PLAN_PLOT = [[362, 758], [362, 177], [1050, 177], [1050, 758]];
  const PHOTO_PLOT = [[545, 975], [205, 755], [845, 670], [1395, 800]];
  const PLAN_RECT = [[0, 0], [B_W, 0], [B_W, B_H], [0, B_H]];
  const planToPhoto = solveH(PLAN_PLOT, PHOTO_PLOT);
  const PLAN_LANDED = PLAN_RECT.map((pt) => applyH(planToPhoto, pt));
  // Each frame arrives over the one below it: a fade, or a wipe that grows from the ground up.
  const B_IN = [
    null,
    null,
    [0.21, 0.28, 'fade'], // blueprint
    [0.31, 0.39, 'fade'], // foundations
    [0.42, 0.52, 'wipe'], // five-storey frame
    [0.54, 0.64, 'wipe'], // ten storeys, brick
    [0.66, 0.74, 'wipe'], // facade
    [0.76, 0.84, 'fade'], // finished
    [0.88, 0.96, 'fade'], // night
  ];
  const B_STEPS = [
    [0, 'The plot', 'Every project starts as a line on a cadastral map.'],
    [0.14, 'The site', 'We film the land, the street and the view buyers will wake up to.'],
    [0.23, 'The design', 'Renders and 3D walkthroughs sell flats that do not exist yet.'],
    [0.34, 'Foundations', 'Pre-sales campaigns go live as the first concrete is poured.'],
    [0.46, 'Frame', 'Monthly progress films keep every buyer confident.'],
    [0.58, 'Walls', 'Social ads and site visits fill the last floors.'],
    [0.69, 'Facade', 'The launch website and sales office content go live.'],
    [0.79, 'Handover', 'Photography and film for the keys ceremony.'],
    [0.9, 'Home', 'Lights on, families in, and the next project already selling.'],
  ];
  let BL = {};
  let bStep = -1;

  // Video mode: when the section carries a video, scroll scrubs it instead of stacking stills.
  const bVideo = buildAct.querySelector('[data-build-video]');
  const V_STEPS = [0, 0.07, 0.13, 0.18, 0.32, 0.4, 0.5, 0.72, 0.85];
  let vTime = 0;
  if (bVideo && !reduced) {
    buildAct.classList.add('has-video');
    // Download the whole clip and play it from memory: scrubbing then works even on hosts
    // that do not answer byte-range requests (many shared/cPanel servers), where a plain src
    // stays frozen on the first frame.
    const url = vw() < 700 ? bVideo.dataset.srcSm : bVideo.dataset.src;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status))))
      .then((blob) => { bVideo.src = URL.createObjectURL(blob); })
      .catch(() => { bVideo.src = url; })
      .finally(() => bVideo.load());
  }

  function renderBuildVideo(p) {
    const v = range(p, 0.03, 0.97);
    const d = bVideo.duration;
    if (d) {
      vTime = lerp(vTime, v * (d - 0.05), 0.25);
      if (!bVideo.seeking && Math.abs(bVideo.currentTime - vTime) > 1 / 60) bVideo.currentTime = vTime;
    }
    bVideo.style.transform = `scale(${lerp(1.04, 1, ease(v))})`;
    const c = range(p, 0.02, 0.08);
    bIntro.style.opacity = (1 - c).toFixed(3);
    bIntro.style.visibility = c >= 1 ? 'hidden' : 'visible';
    bIntro.style.translate = `0 ${-40 * easeOut(c)}px`;
    const h = range(p, 0.07, 0.12).toFixed(3);
    bHud.style.opacity = h;
    bSteps.style.opacity = h;
    bBar.style.transform = `scaleX(${p.toFixed(4)})`;
    const floors = Math.round(lerp(0, 4, range(v, 0.3, 0.36)) + lerp(0, 5, range(v, 0.36, 0.46)));
    bFloor.textContent = 'R+' + floors;
    let i = 0;
    while (i < V_STEPS.length - 1 && v >= V_STEPS[i + 1]) i++;
    setStep(i);
  }

  function layoutBuild() {
    const W0 = vw(), H0 = vh();
    const aspect = B_W / B_H;
    let W, Hh, left, top;
    if (W0 / H0 < 0.9) {
      // Portrait phone: the building fills the upper frame, the caption sits below it.
      W = W0 * 1.75; Hh = W / aspect;
      left = W0 / 2 - 0.51 * W;
      top = Math.max(64, H0 * 0.42 - Hh / 2);
    } else {
      if (W0 / H0 > aspect) { W = W0; Hh = W0 / aspect; } else { Hh = H0; W = H0 * aspect; }
      left = (W0 - W) / 2;
      const k = W / B_W;
      // Keep the roof (y 30) clear of the header and the building's base (y 830) on screen.
      top = clamp(Math.min(84 - 30 * k, H0 - 40 - 830 * k), H0 - Hh, 84);
    }
    bStage.style.width = W + 'px';
    bStage.style.height = Hh + 'px';
    BL = { W0, H0, left, top, k: W / B_W };
  }

  function renderBuildStatic() {
    // Without motion the finished building sits right of the headline instead of behind it.
    const shift = BL.W0 / BL.H0 >= 0.9 ? BL.W0 * 0.2 : 0;
    bStage.style.transform = `translate3d(${BL.left + shift}px, ${BL.top}px, 0)`;
  }

  function setStep(i) {
    if (i === bStep) return;
    bStep = i;
    const [, name, text] = B_STEPS[i];
    bName.textContent = name;
    bText.textContent = text;
    bCaption.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 500, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
    bStepItems.forEach((li, j) => {
      li.classList.toggle('on', j === i);
      li.classList.toggle('done', j < i);
    });
  }

  // A wipe reveals the frame from the ground up behind a soft edge; a fade just raises its opacity.
  function paintFrame(img, kind, t) {
    let mask = '';
    let opacity = t;
    if (kind === 'wipe') {
      opacity = t > 0 ? 1 : 0;
      if (t > 0 && t < 1) {
        const edge = lerp(-30, 100, ease(t));
        mask = `linear-gradient(to top, #000 ${edge}%, transparent ${edge + 30}%)`;
      }
    }
    img.style.opacity = opacity.toFixed(3);
    img.style.webkitMaskImage = mask;
    img.style.maskImage = mask;
  }

  function renderBuild(p) {
    const { left, top, k } = BL;
    // Camera: close on the empty plot, then pull back and up as the building rises, then a slow push at night.
    const out = ease(range(p, 0.38, 0.74));
    const s = lerp(1.16, 1, out) * lerp(1, 1.03, ease(range(p, 0.84, 1)));
    const fx = lerp(800, 768, out), fy = lerp(800, 620, out);
    const ax = left + fx * k, ay = top + fy * k;
    bStage.style.transform = `translate3d(${ax - s * fx * k}px, ${ay - s * fy * k}px, 0) scale(${s})`;

    // The flat plan tilts down until its plot sits on the real plot, then dissolves into the photo.
    const m = ease(range(p, 0.05, 0.17));
    const fade = range(p, 0.12, 0.19);
    if (fade < 1) {
      const quad = PLAN_RECT.map((pt, i) => [lerp(pt[0], PLAN_LANDED[i][0], m) * k, lerp(pt[1], PLAN_LANDED[i][1], m) * k]);
      bPlan.style.transform = homography(B_W, B_H, quad);
      bPlan.style.opacity = (1 - fade).toFixed(3);
      bPlan.style.visibility = 'visible';
    } else {
      bPlan.style.visibility = 'hidden';
    }

    for (let i = 2; i < bFrames.length + 1; i++) {
      const [a, b, kind] = B_IN[i];
      paintFrame(bFrames[i - 1], kind, range(p, a, b));
    }

    // Copy and HUD.
    const c = range(p, 0.02, 0.08);
    bIntro.style.opacity = (1 - c).toFixed(3);
    bIntro.style.visibility = c >= 1 ? 'hidden' : 'visible';
    bIntro.style.translate = `0 ${-40 * easeOut(c)}px`;
    const h = range(p, 0.07, 0.12).toFixed(3);
    bHud.style.opacity = h;
    bSteps.style.opacity = h;
    bBar.style.transform = `scaleX(${p.toFixed(4)})`;
    const floors = Math.round(lerp(0, 4, range(p, 0.42, 0.52)) + lerp(0, 5, range(p, 0.54, 0.64)));
    bFloor.textContent = 'R+' + floors;
    let i = 0;
    while (i < B_STEPS.length - 1 && p >= B_STEPS[i + 1][0]) i++;
    setStep(i);
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
  function layout() { layoutHero(); layoutRail(); layoutBuild(); }
  layout();

  if (reduced) {
    renderHero(0);
    bFrames.forEach((img, i) => { img.style.opacity = i === 6 ? 1 : 0; });
    renderBuildStatic();
    workItems.forEach((li) => li.classList.add('on'));
    closeCopy.style.opacity = 1;
    window.addEventListener('resize', () => { layout(); renderHero(0); renderBuildStatic(); });
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
    if (buildAct.classList.contains('has-video')) renderBuildVideo(progress(buildAct));
    else renderBuild(progress(buildAct));
    renderClose(progress(closeAct));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });
  window.addEventListener('load', layout);
})();
