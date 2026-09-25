/* ==========================================================================
   OsMark — WebGL particle scene
   One particle system that morphs between shapes tied to each service:
   0 wordmark · 1 globe (marketing) · 2 golden-ratio grid (branding)
   3 browser (web) · 4 phone (apps) · 5 shopping bag (e-commerce)
   6 open field (ambient) · 7 portal ring (contact)
   ========================================================================== */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // Shader outputs raw sRGB values, so keep colours as plain 0–1 sRGB triplets.
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const dim = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  const COL = {
    gold: hex('#E9CB8B'),
    goldDeep: hex('#C9A45C'),
    red: hex('#FF3B4E'),
    redDeep: hex('#C21F33'),
    cream: hex('#F5EFE3'),
    blue: hex('#4F7FE0'),
    sky: hex('#9CB9F5'),
  };

  function palette(...entries) {
    const total = entries.reduce((s, e) => s + e[1], 0);
    return () => {
      let r = Math.random() * total;
      for (const [c, w] of entries) if ((r -= w) <= 0) return c;
      return entries[0][0];
    };
  }
  const solid = (c) => () => c;

  /* ---------- geometry helpers (each returns a point generator) ---------- */
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };

  const onCircle = (r, cx = 0, cy = 0, z = 0) => () => {
    const a = Math.random() * TAU;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  };
  const inCircle = (r, cx = 0, cy = 0, z = 0) => () => {
    const a = Math.random() * TAU, rr = r * Math.sqrt(Math.random());
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z];
  };
  const onSegment = (a, b) => () => {
    const t = Math.random();
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t];
  };
  const inRect = (w, h, cx = 0, cy = 0, z = 0) => () => [cx + rand(-w / 2, w / 2), cy + rand(-h / 2, h / 2), z];
  const onRoundRect = (w, h, r, cx = 0, cy = 0, z = 0) => {
    const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI * r) / 2;
    const segs = [sw, sh, sw, sh, arc, arc, arc, arc];
    const total = segs.reduce((s, v) => s + v, 0);
    const hw = w / 2, hh = h / 2;
    const corners = [[hw - r, hh - r], [-hw + r, hh - r], [-hw + r, -hh + r], [hw - r, -hh + r]];
    return () => {
      let d = Math.random() * total, k = 0;
      while (k < 7 && d > segs[k]) { d -= segs[k]; k++; }
      switch (k) {
        case 0: return [cx - hw + r + d, cy + hh, z];
        case 1: return [cx + hw, cy + hh - r - d, z];
        case 2: return [cx + hw - r - d, cy - hh, z];
        case 3: return [cx - hw, cy - hh + r + d, z];
        default: {
          const j = k - 4, a = j * (Math.PI / 2) + (d / arc) * (Math.PI / 2);
          return [cx + corners[j][0] + Math.cos(a) * r, cy + corners[j][1] + Math.sin(a) * r, z];
        }
      }
    };
  };

  /* parts: [weight, pointFn, colourFn, jitter] */
  function build(N, parts) {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const total = parts.reduce((s, p) => s + p[0], 0);
    for (let i = 0; i < N; i++) {
      let r = Math.random() * total, k = 0;
      while (k < parts.length - 1 && r > parts[k][0]) { r -= parts[k][0]; k++; }
      const part = parts[k];
      const p = part[1](), c = part[2](), j = part[3] === undefined ? 0.02 : part[3];
      const i3 = i * 3;
      pos[i3] = p[0] + rand(-j, j); pos[i3 + 1] = p[1] + rand(-j, j); pos[i3 + 2] = p[2] + rand(-j, j);
      col[i3] = c[0]; col[i3 + 1] = c[1]; col[i3 + 2] = c[2];
    }
    return { pos, col };
  }

  /* ---------- 0 · wordmark "OsMark" sampled from a 2D canvas ---------- */
  function shapeText(N) {
    const W = 1400, H = 360;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const f1 = 'italic 700 250px "Playfair Display", Georgia, serif';
    const f2 = '800 228px Inter, system-ui, sans-serif';
    ctx.font = f1; const w1 = ctx.measureText('Os').width;
    ctx.font = f2; const w2 = ctx.measureText('Mark').width;
    const gap = 18, total = w1 + gap + w2, x0 = (W - total) / 2, base = H * 0.74;
    ctx.fillStyle = '#fff';
    ctx.font = f1; ctx.fillText('Os', x0, base);
    ctx.font = f2; ctx.fillText('Mark', x0 + w1 + gap, base);

    const data = ctx.getImageData(0, 0, W, H).data;
    const os = [], mark = [];
    const split = x0 + w1 + gap / 2;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        if (data[(y * W + x) * 4 + 3] > 140) (x < split ? os : mark).push(x, y);
      }
    }
    const s = 7.6 / total;
    const toWorld = (arr) => () => {
      if (!arr.length) return [rand(-4, 4), rand(-1, 1), 0];
      const k = ((Math.random() * (arr.length / 2)) | 0) * 2;
      return [(arr[k] - W / 2) * s, -(arr[k + 1] - H * 0.5) * s, rand(-0.18, 0.18)];
    };
    const ux0 = (x0 + w1 + gap - W / 2) * s, ux1 = (x0 + total - W / 2) * s, uy = -(base + 26 - H * 0.5) * s;
    return build(N, [
      [os.length || 1, toWorld(os), palette([COL.gold, 6], [COL.goldDeep, 2], [COL.cream, 1]), 0.015],
      [mark.length || 1, toWorld(mark), palette([COL.cream, 6], [COL.gold, 1], [COL.red, 1]), 0.015],
      [(os.length + mark.length) * 0.06, onSegment([ux0, uy, 0], [ux1, uy, 0]), solid(COL.red), 0.03],
    ]);
  }

  /* ---------- 1 · globe with campaign orbits (marketing & reach) ---------- */
  function shapeGlobe(N) {
    const R = 2.3;
    const tilt = (p) => rotZ(rotX(p, 0.35), -0.25);
    const lats = [-60, -40, -20, 0, 20, 40, 60].map((d) => (d * Math.PI) / 180);
    const lons = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 8);
    const lat = () => {
      const phi = pick(lats), a = Math.random() * TAU, r = R * Math.cos(phi);
      return tilt([Math.cos(a) * r, R * Math.sin(phi), Math.sin(a) * r]);
    };
    const lon = () => {
      const th = pick(lons), a = Math.random() * TAU;
      return tilt([R * Math.cos(a) * Math.cos(th), R * Math.sin(a), R * Math.cos(a) * Math.sin(th)]);
    };
    const dust = () => {
      const u = rand(-1, 1), a = Math.random() * TAU, r = Math.sqrt(1 - u * u) * R;
      return [Math.cos(a) * r, u * R, Math.sin(a) * r];
    };
    const orbit = (rx, tx, tz) => () => {
      const a = Math.random() * TAU;
      return rotZ(rotX([Math.cos(a) * rx, 0, Math.sin(a) * rx], tx), tz);
    };
    const sats = [
      [3.2, 1.2, 0.4, 0.6], [3.2, 1.2, 0.4, 3.4], [3.65, 1.4, -0.6, 1.9],
      [3.65, 1.4, -0.6, 4.6], [3.65, 1.4, -0.6, 5.8],
    ].map(([rx, tx, tz, a]) => rotZ(rotX([Math.cos(a) * rx, 0, Math.sin(a) * rx], tx), tz));
    const sat = () => {
      const s = pick(sats), u = rand(-1, 1), a = Math.random() * TAU, r = Math.sqrt(1 - u * u) * 0.11;
      return [s[0] + Math.cos(a) * r, s[1] + u * 0.11, s[2] + Math.sin(a) * r];
    };
    return build(N, [
      [30, lat, palette([COL.sky, 3], [COL.blue, 2], [COL.cream, 1])],
      [30, lon, palette([COL.sky, 3], [COL.blue, 2])],
      [10, dust, solid(dim(COL.sky, 0.55)), 0.04],
      [12, orbit(3.2, 1.2, 0.4), palette([COL.gold, 4], [COL.goldDeep, 1])],
      [12, orbit(3.65, 1.4, -0.6), palette([COL.gold, 3], [COL.cream, 1])],
      [6, sat, solid(COL.red), 0.01],
    ]);
  }

  /* ---------- 2 · golden-ratio logo construction grid (branding) ---------- */
  function shapeGolden(N) {
    const b = Math.log(PHI) / (Math.PI / 2), a = 0.034, tMax = 4.5 * Math.PI;
    const eMax = Math.exp(b * tMax) - 1;
    const spiral = () => {
      const th = Math.log(1 + Math.random() * eMax) / b; // even density along the curve
      const r = a * Math.exp(b * th);
      return [r * Math.cos(th), r * Math.sin(th), (th / tMax - 0.5) * 1.4];
    };
    return build(N, [
      [34, spiral, palette([COL.gold, 5], [COL.goldDeep, 2], [COL.cream, 1]), 0.025],
      [16, onCircle(2.6, 0, 0, -0.6), solid(dim(COL.cream, 0.8))],
      [11, onCircle(1.6, 1.0, 0, -0.2), solid(COL.red)],
      [7, onCircle(0.99, 1.0, 0.6, 0.2), solid(COL.cream)],
      [5, onCircle(0.62, 0.62, 0.6, 0.5), solid(COL.gold)],
      [3, onCircle(0.38, 0.62, 0.83, 0.8), solid(COL.red)],
      [7, onSegment([-3.4, 0, 0], [3.4, 0, 0]), solid(dim(COL.sky, 0.7))],
      [7, onSegment([0, -3.2, 0], [0, 3.2, 0]), solid(dim(COL.sky, 0.7))],
      [5, onSegment([-2.3, -2.3, -0.3], [2.3, 2.3, 0.3]), solid(dim(COL.cream, 0.5))],
      [5, onSegment([-2.3, 2.3, 0.3], [2.3, -2.3, -0.3]), solid(dim(COL.cream, 0.5))],
    ]);
  }

  /* ---------- 3 · layered browser window (web development) ---------- */
  function shapeBrowser(N) {
    const code = (x, y, z) => [
      onSegment([x + 0.25, y + 0.25, z], [x, y, z]), onSegment([x, y, z], [x + 0.25, y - 0.25, z]),
      onSegment([x + 0.55, y - 0.3, z], [x + 0.8, y + 0.3, z]),
      onSegment([x + 1.1, y + 0.25, z], [x + 1.35, y, z]), onSegment([x + 1.35, y, z], [x + 1.1, y - 0.25, z]),
    ];
    const glyphs = code(2.55, 2.55, 1.3);
    const cards = [-2.1, 0, 2.1];
    return build(N, [
      [30, onRoundRect(6.4, 4.2, 0.28, 0, 0, 0), palette([COL.cream, 3], [COL.gold, 2])],
      [8, onSegment([-3.2, 1.55, 0], [3.2, 1.55, 0]), solid(dim(COL.cream, 0.8))],
      [1.2, inCircle(0.09, -2.85, 1.88, 0.02), solid(COL.red), 0.005],
      [1.2, inCircle(0.09, -2.58, 1.88, 0.02), solid(COL.gold), 0.005],
      [1.2, inCircle(0.09, -2.31, 1.88, 0.02), solid(COL.cream), 0.005],
      [4, onRoundRect(2.4, 0.3, 0.15, 0.2, 1.88, 0), solid(dim(COL.cream, 0.6))],
      [14, inRect(2.8, 1.3, -1.4, 0.55, 0.35), palette([COL.red, 3], [COL.redDeep, 2])],
      [4, onSegment([0.6, 1.0, 0.2], [2.8, 1.0, 0.2]), solid(COL.cream)],
      [3.5, onSegment([0.6, 0.75, 0.2], [2.4, 0.75, 0.2]), solid(dim(COL.cream, 0.7))],
      [3, onSegment([0.6, 0.5, 0.2], [2.0, 0.5, 0.2]), solid(dim(COL.cream, 0.7))],
      [4, onRoundRect(1.1, 0.34, 0.17, 1.15, 0.05, 0.3), solid(COL.gold)],
      ...cards.map((x) => [7, onRoundRect(1.85, 1.25, 0.12, x, -1.05, 0.55), palette([COL.gold, 3], [COL.cream, 1])]),
      ...cards.map((x) => [3, inRect(1.5, 0.45, x, -0.8, 0.55), solid(dim(COL.sky, 0.8))]),
      ...glyphs.map((g) => [2.2, g, solid(COL.red), 0.02]),
    ]);
  }

  /* ---------- 4 · phone with app grid & notifications (apps) ---------- */
  function shapePhone(N) {
    const tiles = [];
    const tileCols = [COL.gold, COL.red, COL.sky];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        tiles.push([2.2, inRect(0.44, 0.44, (c - 1) * 0.66, 1.3 - r * 0.66, 0.12), solid(tileCols[(r + c) % 3]), 0.01]);
      }
    }
    return build(N, [
      [30, onRoundRect(2.4, 4.8, 0.4, 0, 0, 0), palette([COL.cream, 3], [COL.gold, 1])],
      [10, onRoundRect(2.1, 4.5, 0.3, 0, 0, 0.03), solid(dim(COL.cream, 0.45))],
      [3, onRoundRect(0.7, 0.18, 0.09, 0, 2.05, 0.05), solid(COL.cream)],
      ...tiles,
      [3, onSegment([-0.45, -2.05, 0.05], [0.45, -2.05, 0.05]), solid(COL.cream)],
      [3, inRect(1.6, 0.36, 0, -1.5, 0.12), solid(dim(COL.gold, 0.6))],
      [10, onRoundRect(1.9, 0.55, 0.2, 1.75, 1.35, 0.9), solid(COL.gold)],
      [3, onSegment([1.1, 1.35, 0.9], [2.3, 1.35, 0.9]), solid(dim(COL.cream, 0.8))],
      [9, onRoundRect(1.7, 0.55, 0.2, -1.8, -0.6, 0.7), solid(COL.red)],
      [3, onSegment([-2.35, -0.6, 0.7], [-1.3, -0.6, 0.7]), solid(dim(COL.cream, 0.8))],
    ]);
  }

  /* ---------- 5 · shopping bag with OsMark logo, tag & coins (e-commerce) ---------- */
  function shapeBag(N) {
    const hw = 1.4, top = 0.9, bot = -1.7, hd = 0.6;
    const V = [];
    for (const sx of [-1, 1]) for (const y of [bot, top]) for (const sz of [-1, 1]) V.push([sx * hw, y, sz * hd]);
    const edges = [];
    for (let i = 0; i < V.length; i++) {
      for (let j = i + 1; j < V.length; j++) {
        const diff = [0, 1, 2].filter((k) => V[i][k] !== V[j][k]).length;
        if (diff === 1) edges.push([V[i], V[j]]);
      }
    }
    const edge = () => { const [a, b] = pick(edges); return onSegment(a, b)(); };
    const handle = (z) => () => { const a = Math.random() * Math.PI; return [Math.cos(a) * 0.65, top + Math.sin(a) * 0.85, z]; };
    const sideFace = () => [pick([-hw, hw]), rand(bot, top), rand(-hd, hd)];
    const bottom = () => [rand(-hw, hw), bot, rand(-hd, hd)];
    const logoZ = hd + 0.02, logoY = -0.45;
    return build(N, [
      [22, edge, palette([COL.gold, 4], [COL.goldDeep, 1])],
      [22, inRect(hw * 2, top - bot, 0, (top + bot) / 2, hd), palette([COL.redDeep, 3], [COL.red, 1]), 0.01],
      [8, inRect(hw * 2, top - bot, 0, (top + bot) / 2, -hd), solid(dim(COL.redDeep, 0.7)), 0.01],
      [8, sideFace, solid(dim(COL.red, 0.75)), 0.01],
      [4, bottom, solid(dim(COL.redDeep, 0.6)), 0.01],
      [7, handle(hd), solid(COL.gold), 0.03],
      [5, handle(-hd), solid(COL.goldDeep), 0.03],
      [7, onCircle(0.48, -0.08, logoY, logoZ), solid(COL.gold), 0.035],
      [2, inCircle(0.13, 0.42, logoY + 0.42, logoZ), solid(COL.cream), 0.005],
      [4, onRoundRect(0.55, 0.8, 0.1, 1.95, top - 0.4, hd + 0.05), solid(COL.cream)],
      [1.5, onSegment([0.65, top, hd], [1.95, top, hd + 0.05]), solid(dim(COL.cream, 0.6))],
      [4, onCircle(0.32, -2.35, 1.3, 0.5), solid(COL.gold)],
      [2, inCircle(0.18, -2.35, 1.3, 0.5), solid(COL.goldDeep)],
      [4, onCircle(0.32, 2.5, -1.3, 0.8), solid(COL.gold)],
      [2, inCircle(0.18, 2.5, -1.3, 0.8), solid(COL.goldDeep)],
      [3, onCircle(0.25, -2.1, -1.6, -0.4), solid(COL.gold)],
    ]);
  }

  /* ---------- 6 · open field (ambient) ---------- */
  function shapeField(N) {
    const p = palette([dim(COL.gold, 0.7), 4], [dim(COL.cream, 0.55), 3], [dim(COL.red, 0.7), 1], [dim(COL.sky, 0.6), 2]);
    return build(N, [[1, () => [rand(-11, 11), rand(-6.5, 6.5), rand(-9, 3)], p, 0]]);
  }

  /* ---------- 7 · portal ring (contact) ---------- */
  function shapeTorus(N) {
    const R = 2.4, r = 0.55;
    const us = []; // hands each point's ring angle to its colour fn (called right after)
    const surface = () => {
      const u = Math.random() * TAU, v = Math.random() * TAU;
      const p = rotX([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v)], 0.35);
      us.push(u);
      return p;
    };
    // colour follows the ring: red → gold around the loop
    const ringCol = () => {
      const u = us.pop() || 0, t = (Math.sin(u) + 1) / 2;
      return [COL.red[0] + (COL.gold[0] - COL.red[0]) * t, COL.red[1] + (COL.gold[1] - COL.red[1]) * t, COL.red[2] + (COL.gold[2] - COL.red[2]) * t];
    };
    const sparks = () => {
      const u = rand(-1, 1), a = Math.random() * TAU, rr = rand(3.4, 4.4), q = Math.sqrt(1 - u * u);
      return [Math.cos(a) * q * rr, u * rr * 0.7, Math.sin(a) * q * rr * 0.4];
    };
    return build(N, [
      [70, surface, ringCol, 0.015],
      [12, () => rotX(onCircle(1.45)(), 0.35), solid(COL.cream)],
      [18, sparks, palette([COL.gold, 3], [COL.cream, 2], [COL.red, 1]), 0.02],
    ]);
  }

  /* ---------- shaders ---------- */
  const vertexShader = /* glsl */ `
    attribute vec3 aColor;
    attribute float aScale;
    uniform float uTime;
    uniform float uSize;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * aScale / -mv.z;
      vColor = aColor;
      vAlpha = 0.6 + 0.4 * sin(uTime * 1.6 + aScale * 40.0);
    }
  `;
  const fragmentShader = /* glsl */ `
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.05, d);
      gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
    }
  `;

  /* ---------- scene ---------- */
  function create(canvas, opts) {
    const reduced = !!opts.reduced;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      return null;
    }
    const N = opts.mobile ? 4200 : 9000;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 0, 11);

    const builders = [shapeText, shapeGlobe, shapeGolden, shapeBrowser, shapePhone, shapeBag, shapeField, shapeTorus];
    const shapes = builders.map((fn) => fn(N));
    const FIELD = 6, LAST = shapes.length - 1;

    const position = new Float32Array(shapes[FIELD].pos);
    const color = new Float32Array(shapes[FIELD].col);
    const aScale = new Float32Array(N), delay = new Float32Array(N), phase = new Float32Array(N), dir = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      aScale[i] = rand(0.55, 1.6);
      delay[i] = Math.random();
      phase[i] = Math.random() * TAU;
      const u = rand(-1, 1), a = Math.random() * TAU, q = Math.sqrt(1 - u * u), m = rand(0.3, 1.1);
      dir[i * 3] = Math.cos(a) * q * m; dir[i * 3 + 1] = u * m; dir[i * 3 + 2] = Math.sin(a) * q * m;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage);
    const colAttr = new THREE.BufferAttribute(color, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aColor', colAttr);
    geo.setAttribute('aScale', new THREE.BufferAttribute(aScale, 1));

    const makeMaterial = (size, opacity) => new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: size * renderer.getPixelRatio() }, uOpacity: { value: opacity } },
      vertexShader, fragmentShader,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mat = makeMaterial(opts.mobile ? 30 : 34, 0.85);
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    const group = new THREE.Group();
    group.add(points);
    scene.add(group);

    // distant star shell for depth
    const S = opts.mobile ? 700 : 1400;
    const sPos = new Float32Array(S * 3), sCol = new Float32Array(S * 3), sScale = new Float32Array(S);
    const sPal = palette([dim(COL.cream, 0.6), 3], [dim(COL.gold, 0.6), 2], [dim(COL.sky, 0.5), 2]);
    for (let i = 0; i < S; i++) {
      const u = rand(-1, 1), a = Math.random() * TAU, q = Math.sqrt(1 - u * u), r = rand(18, 40), c = sPal();
      sPos.set([Math.cos(a) * q * r, u * r, Math.sin(a) * q * r], i * 3);
      sCol.set(c, i * 3);
      sScale[i] = rand(0.4, 1.2);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
    sGeo.setAttribute('aScale', new THREE.BufferAttribute(sScale, 1));
    const sMat = makeMaterial(70, 0.7);
    const stars = new THREE.Points(sGeo, sMat);
    scene.add(stars);

    const state = { v: 0, tv: 0, x: 0, tx: 0, y: 0, ty: 0, mx: 0, my: 0, tmx: 0, tmy: 0, intro: reduced ? 1 : 0 };
    let scale = 1, xFactor = 1;

    function resize() {
      const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      scale = aspect < 1 ? Math.min(0.8, Math.max(0.38, aspect * 0.9)) : Math.min(1, aspect / 1.55);
      xFactor = aspect < 1 ? 0 : aspect < 1.3 ? 0.6 : 1;
    }
    resize();

    const ease = (e) => (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);
    const easeOut = (e) => 1 - Math.pow(1 - e, 3);
    const damp = (rate, dt) => (reduced ? 1 : 1 - Math.exp(-rate * dt));
    const clock = new THREE.Clock();

    function frame() {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      state.v += (state.tv - state.v) * damp(3.2, dt);
      state.x += (state.tx * xFactor - state.x) * damp(2.6, dt);
      state.y += (state.ty - state.y) * damp(2.6, dt);
      state.mx += (state.tmx - state.mx) * damp(2.5, dt);
      state.my += (state.tmy - state.my) * damp(2.5, dt);

      const v = Math.max(0, Math.min(LAST, state.v));
      const a = Math.floor(v), b = Math.min(a + 1, LAST), tt = v - a;
      const A = shapes[a], B = shapes[b], F = shapes[FIELD];
      const intro = state.intro, wob = reduced ? 0 : 0.035;

      for (let i = 0; i < N; i++) {
        const i3 = i * 3;
        const e = ease(clamp01((tt - delay[i] * 0.4) / 0.6));
        const bulge = Math.sin(e * Math.PI) * 0.9;
        let x = A.pos[i3] + (B.pos[i3] - A.pos[i3]) * e + dir[i3] * bulge;
        let y = A.pos[i3 + 1] + (B.pos[i3 + 1] - A.pos[i3 + 1]) * e + dir[i3 + 1] * bulge;
        let z = A.pos[i3 + 2] + (B.pos[i3 + 2] - A.pos[i3 + 2]) * e + dir[i3 + 2] * bulge;
        if (intro < 1) {
          const ie = easeOut(clamp01((intro - delay[i] * 0.45) / 0.55));
          x = F.pos[i3] + (x - F.pos[i3]) * ie;
          y = F.pos[i3 + 1] + (y - F.pos[i3 + 1]) * ie;
          z = F.pos[i3 + 2] + (z - F.pos[i3 + 2]) * ie;
        }
        if (wob) {
          x += Math.sin(t * 0.9 + phase[i]) * wob;
          y += Math.cos(t * 0.7 + phase[i] * 1.3) * wob;
        }
        position[i3] = x; position[i3 + 1] = y; position[i3 + 2] = z;
        color[i3] = A.col[i3] + (B.col[i3] - A.col[i3]) * e;
        color[i3 + 1] = A.col[i3 + 1] + (B.col[i3 + 1] - A.col[i3 + 1]) * e;
        color[i3 + 2] = A.col[i3 + 2] + (B.col[i3 + 2] - A.col[i3 + 2]) * e;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      const idle = reduced ? 0 : 1;
      group.position.set(state.x, state.y, 0);
      group.scale.setScalar(scale);
      group.rotation.y = Math.sin(t * 0.25) * 0.28 * idle + state.mx * 0.35;
      group.rotation.x = Math.sin(t * 0.2) * 0.05 * idle - state.my * 0.18;
      stars.rotation.y = t * 0.008 * idle;
      stars.rotation.x = state.my * 0.04;
      mat.uniforms.uTime.value = t;
      sMat.uniforms.uTime.value = t;
      renderer.render(scene, camera);
    }

    renderer.setAnimationLoop(frame);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { renderer.setAnimationLoop(null); clock.stop(); }
      else { clock.start(); renderer.setAnimationLoop(frame); }
    });
    window.addEventListener('resize', resize);

    return {
      setTarget(v, x, y) {
        state.tv = v; state.tx = x; state.ty = y;
        if (!state.ready) { state.ready = true; state.v = v; state.x = x * xFactor; state.y = y; } // no drift on first frame
      },
      setPointer(nx, ny) { state.tmx = nx; state.tmy = ny; },
      playIntro(duration) {
        if (!duration || reduced || !window.gsap) { state.intro = 1; return; }
        window.gsap.to(state, { intro: 1, duration, ease: 'none' });
      },
    };
  }

  window.OsScene = { create };
})();
