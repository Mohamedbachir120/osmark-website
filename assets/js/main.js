/* ==========================================================================
   OsMark — interactions
   Scroll position drives the 3D morph; GSAP handles reveals & micro-motion.
   ========================================================================== */
(function () {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = window.matchMedia('(max-width: 899px)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  $('#year').textContent = new Date().getFullYear();

  /* ---------- 3D scene ---------- */
  let scene = null;
  function startScene() {
    if (window.THREE && window.OsScene) {
      scene = window.OsScene.create($('#webgl'), { reduced, mobile: mqMobile.matches });
    }
    if (!scene) document.documentElement.classList.add('no-webgl');
  }

  /* ---------- scroll → morph target ---------- */
  const anchorEls = $$('[data-shape]');
  let anchors = [];
  function measure() {
    const mobile = mqMobile.matches;
    anchors = anchorEls.map((el) => {
      const r = el.getBoundingClientRect();
      const y = mobile && el.dataset.my !== undefined ? el.dataset.my : el.dataset.y || 0;
      return { c: r.top + window.scrollY + r.height / 2, s: +el.dataset.shape, x: +(el.dataset.x || 0), y: +y };
    });
  }

  const header = $('.site-header');
  let scrolled = null;
  function update() {
    const sy = window.scrollY;
    const isScrolled = sy > 20;
    if (isScrolled !== scrolled) { scrolled = isScrolled; header.classList.toggle('is-scrolled', isScrolled); }
    if (!scene || !anchors.length) return;

    const mid = sy + window.innerHeight / 2;
    let i = 0;
    while (i < anchors.length - 1 && mid > anchors[i + 1].c) i++;
    const A = anchors[i], B = anchors[Math.min(i + 1, anchors.length - 1)];
    let t = B === A ? 0 : clamp((mid - A.c) / (B.c - A.c));
    // hold each shape while its section is centred, morph in between
    t = smoothstep(0.2, 0.8, t);
    if (reduced) t = t < 0.5 ? 0 : 1;
    scene.setTarget(A.s + (B.s - A.s) * t, A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t);
  }

  /* ---------- loader & intro ---------- */
  const loader = $('#loader'), pct = $('#loader-pct'), bar = $('#loader-bar');
  const setProgress = (p) => { pct.textContent = Math.round(p) + '%'; bar.style.transform = `scaleX(${p / 100})`; };
  let fake = 0;
  const fakeTimer = setInterval(() => { fake = Math.min(90, fake + Math.random() * 14); setProgress(fake); }, 110);

  const fontsLoaded = document.fonts
    ? Promise.all([
        document.fonts.load('italic 700 100px "Playfair Display"'),
        document.fonts.load('800 100px Inter'),
      ]).catch(() => {})
    : Promise.resolve();
  const fontsReady = Promise.race([fontsLoaded, new Promise((r) => setTimeout(r, 2500))]);

  function splitWords(el) {
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'word';
            const inner = document.createElement('span'); inner.className = 'word-inner';
            inner.textContent = part;
            w.appendChild(inner); frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    el.setAttribute('aria-label', el.textContent.trim());
    walk(el);
  }

  function revealPage() {
    const done = () => loader.classList.add('is-done');
    if (!hasGSAP || reduced) {
      done();
      if (scene) scene.playIntro(0);
      return;
    }
    const heroTitle = $('[data-split]');
    splitWords(heroTitle);
    gsap.set('.hero .word-inner', { yPercent: 110 });
    gsap.set('.hero [data-hero-fade]', { autoAlpha: 0, y: 16 });
    gsap.set('.site-header', { autoAlpha: 0, y: -16 });

    gsap.timeline()
      .to(loader, { autoAlpha: 0, duration: 0.6, ease: 'power2.inOut', delay: 0.15, onComplete: done })
      .add(() => scene && scene.playIntro(2.6), '-=0.35')
      .to('.site-header', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, '<0.5')
      .to('.hero .word-inner', { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06 }, '<0.3')
      .to('.hero [data-hero-fade]', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out', stagger: 0.1 }, '<0.35');
  }

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  function initSmoothScroll() {
    if (window.Lenis && hasGSAP && !reduced) {
      lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    }
  }
  function scrollToEl(el) {
    if (lenis) lenis.scrollTo(el, { duration: 1.4 });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }

  /* ---------- navigation ---------- */
  function initNav() {
    const toggle = $('.nav-toggle');
    const setMenu = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.classList.toggle('menu-open', open);
      if (lenis) open ? lenis.stop() : lenis.start();
      if (open) $('#mobile-menu a').focus();
    };
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); toggle.focus(); }
    });
    mqMobile.addEventListener('change', () => setMenu(false));

    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id.length < 2) return; // placeholder links
        const target = id === '#top' ? document.body : $(id);
        if (!target) return;
        e.preventDefault();
        if (document.body.classList.contains('menu-open')) setMenu(false);
        if (id === '#top') {
          lenis ? lenis.scrollTo(0, { duration: 1.4 }) : window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
        } else {
          scrollToEl(target);
        }
        history.pushState(null, '', id);
      });
    });
  }

  /* ---------- chapter progress ---------- */
  function initChapterNav() {
    const nav = $('.chapter-nav');
    const chapters = $$('.chapter');
    const dots = $$('button', nav);
    dots.forEach((d, i) => d.addEventListener('click', () => scrollToEl(chapters[i])));
    const inView = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const i = chapters.indexOf(en.target);
        en.isIntersecting ? inView.add(i) : inView.delete(i);
      });
      nav.classList.toggle('is-visible', inView.size > 0);
      if (inView.size) {
        const active = Math.max(...inView);
        dots.forEach((d, i) => d.setAttribute('aria-current', String(i === active)));
      }
    }, { rootMargin: '-50% 0px -50% 0px' });
    chapters.forEach((c) => io.observe(c));
  }

  /* ---------- scroll reveals ---------- */
  function initReveals() {
    if (!hasGSAP || reduced) return;
    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 32, autoAlpha: 0, duration: 1, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });
    $$('[data-stagger]').forEach((group) => {
      gsap.from(group.children, {
        y: 28, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09,
        scrollTrigger: { trigger: group, start: 'top 85%', toggleActions: 'play none none reverse' },
      });
    });
    const fill = $('.process-line-fill');
    if (fill) {
      gsap.fromTo(fill, { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: { trigger: '.process-steps', start: 'top 75%', end: 'bottom 60%', scrub: 1 },
      });
    }
  }

  /* ---------- counters ---------- */
  function initCounters() {
    const els = $$('[data-count]');
    const render = (el, v) => {
      const d = +(el.dataset.decimals || 0);
      el.textContent = v.toFixed(d) + (el.dataset.suffix || '');
    };
    if (reduced) return; // final values already in the markup
    els.forEach((el) => render(el, 0));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target, end = +el.dataset.count, dur = 1800, t0 = performance.now();
        const tick = (now) => {
          const p = clamp((now - t0) / dur);
          render(el, end * (1 - Math.pow(2, -10 * p)));
          if (p < 1) requestAnimationFrame(tick); else render(el, end);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- pointer: tilt, magnetic, cursor, scene parallax ---------- */
  function initPointer() {
    window.addEventListener('pointermove', (e) => {
      if (scene) scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });

    if (!finePointer || reduced) return;

    $$('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((0.5 - py) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });

    $$('[data-magnetic]').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.transform = `translate(${(dx * 10).toFixed(1)}px, ${(dy * 8).toFixed(1)}px)`;
      });
      btn.addEventListener('pointerleave', () => { btn.style.transform = ''; });
    });

    if (!hasGSAP) return;
    const cursor = document.createElement('div');
    cursor.className = 'cursor is-hidden';
    cursor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursor);
    const pos = { x: -100, y: -100, tx: -100, ty: -100 };
    window.addEventListener('pointermove', (e) => {
      pos.tx = e.clientX; pos.ty = e.clientY;
      cursor.classList.remove('is-hidden');
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, [data-tilt], select, label'));
    }, { passive: true });
    document.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
    gsap.ticker.add(() => {
      pos.x += (pos.tx - pos.x) * 0.2;
      pos.y += (pos.ty - pos.y) * 0.2;
      cursor.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
    });
  }

  /* ---------- contact form ---------- */
  function initForm() {
    const form = $('#contact-form');
    const status = $('#form-status');
    const rules = {
      name: (v) => v.trim().length >= 2 || 'Please enter your name.',
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Please enter a valid email address.',
      service: (v) => !!v || 'Please choose a service.',
      message: (v) => v.trim().length >= 10 || 'Tell us a little more (at least 10 characters).',
    };
    const validate = (field) => {
      const rule = rules[field.name];
      if (!rule) return true;
      const res = rule(field.value);
      const ok = res === true;
      field.setAttribute('aria-invalid', String(!ok));
      $('#' + field.name + '-error').textContent = ok ? '' : res;
      return ok;
    };
    Object.keys(rules).forEach((name) => {
      const field = form.elements[name];
      field.addEventListener('blur', () => { if (field.value) validate(field); });
      field.addEventListener('input', () => { if (field.getAttribute('aria-invalid') === 'true') validate(field); });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      status.textContent = '';
      const invalid = Object.keys(rules).map((n) => form.elements[n]).filter((f) => !validate(f));
      if (invalid.length) { invalid[0].focus(); return; }

      const btn = form.querySelector('button[type="submit"]');
      const label = btn.querySelector('.btn-label');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      label.textContent = 'Sending…';
      // TODO: connect to your backend / form service (Formspree, Netlify Forms, etc.)
      setTimeout(() => {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        label.textContent = 'Send message';
        form.reset();
        Object.keys(rules).forEach((n) => form.elements[n].removeAttribute('aria-invalid'));
        status.textContent = "Thank you! Your message is on its way. We'll reply within one business day.";
      }, 1200);
    });
  }

  /* ---------- boot ---------- */
  initSmoothScroll();
  initNav();
  initChapterNav();
  initForm();

  fontsReady.then(() => {
    clearInterval(fakeTimer);
    setProgress(100);
    startScene();
    measure();
    update();
    initReveals();
    initCounters();
    initPointer();
    revealPage();

    if (hasGSAP) {
      gsap.ticker.add(update);
      ScrollTrigger.addEventListener('refresh', measure);
    } else {
      window.addEventListener('scroll', update, { passive: true });
    }
    window.addEventListener('resize', () => { measure(); update(); });
    window.addEventListener('load', () => { measure(); if (hasGSAP) ScrollTrigger.refresh(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => measure()).observe(document.body);
  });
})();
