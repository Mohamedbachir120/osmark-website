/* ==========================================================================
   OsMark — solid PBR models
   Each particle shape has a matching solid model. When a section is in view
   the particles settle and the model "materialises" through a noise dissolve.
   Real image textures can be dropped in via TEXTURES below; otherwise
   everything is drawn procedurally on canvases.
   ========================================================================== */
(function () {
  'use strict';

  // Image textures (paths relative to index.html). Set one to null to fall back
  // to the procedural canvas version.
  const TEXTURES = {
    earth: 'assets/textures/earth.jpg',             // 2:1 equirectangular night map
    earthLights: 'assets/textures/earth-lights.jpg', // city lights (emissive), derived from earth.jpg
    earthRough: 'assets/textures/earth-rough.jpg',   // ocean = glossy, land = rough
    website: null,                                   // 16:10 website screenshot for the browser screen
    app: 'assets/textures/app.jpg',                  // ~9:19.5 app screenshot for the phone screen
    paper: 'assets/textures/paper.jpg',              // seamless square paper texture for the shopping bag
  };

  const TAU = Math.PI * 2;
  const PHI = (1 + Math.sqrt(5)) / 2;

  function create(THREE, renderer, opts) {
    const mobile = !!opts.mobile;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    /* ---------- palette (linear colours for PBR) ---------- */
    const C = (h) => new THREE.Color(h);
    const COL = {
      gold: C('#E9CB8B'), goldDeep: C('#C9A45C'), red: C('#FF3B4E'), redDeep: C('#C21F33'),
      cream: C('#F5EFE3'), blue: C('#4F7FE0'), sky: C('#9CB9F5'), navy: C('#0B1630'), ink: C('#121A2C'),
    };

    /* ---------- dissolve shader patch ---------- */
    const NOISE = /* glsl */ `
      float osHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float osNoise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(osHash(i), osHash(i + vec3(1,0,0)), f.x), mix(osHash(i + vec3(0,1,0)), osHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(osHash(i + vec3(0,0,1)), osHash(i + vec3(1,0,1)), f.x), mix(osHash(i + vec3(0,1,1)), osHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      float osFbm(vec3 p) { return 0.6 * osNoise(p) + 0.3 * osNoise(p * 2.1) + 0.1 * osNoise(p * 4.3); }
    `;
    function dissolve(material, u) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uReveal = u.uReveal;
        shader.uniforms.uEdge = u.uEdge;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vOsPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOsPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vOsPos;\nuniform float uReveal;\nuniform vec3 uEdge;\n' + NOISE)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            float osN = osFbm(vOsPos * 1.6);
            float osT = uReveal * 1.12 - 0.06;
            if (osN > osT) discard;`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += uEdge * smoothstep(osT - 0.06, osT, osN) * step(uReveal, 0.999) * 3.0;`);
      };
      material.customProgramCacheKey = () => 'osDissolve';
      return material;
    }

    /* ---------- material factory ---------- */
    function makeMats(u) {
      const P = (o) => dissolve(new THREE.MeshPhysicalMaterial(o), u);
      return {
        P,
        gold: () => P({ color: COL.gold, metalness: 1, roughness: 0.22 }),
        goldBrushed: () => P({ color: COL.goldDeep, metalness: 1, roughness: 0.38 }),
        red: () => P({ color: COL.red, metalness: 0.05, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }),
        redDeep: () => P({ color: COL.redDeep, metalness: 0.05, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 }),
        cream: () => P({ color: COL.cream, metalness: 0, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
        sky: () => P({ color: COL.sky, metalness: 0.1, roughness: 0.3, clearcoat: 1 }),
        graphite: () => P({ color: COL.ink, metalness: 0.85, roughness: 0.32 }),
      };
    }

    /* ---------- canvas helpers ---------- */
    function canvasTex(w, h, draw, srgb = true) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      draw(ctx, w, h);
      const t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }
    // swaps a procedural texture for an image once it has loaded
    function loadInto(material, key, slot = 'map', { emissive = false, srgb = true } = {}) {
      if (!TEXTURES[key]) return;
      new THREE.TextureLoader().load(TEXTURES[key], (t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
        if (key === 'paper') { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
        material[slot] = t;
        if (emissive) material.emissiveMap = t;
        material.needsUpdate = true;
      });
    }
    const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    function roundShape(w, h, r) {
      const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    function slab(w, h, r, depth, bevel = 0.03) {
      const g = new THREE.ExtrudeGeometry(roundShape(w, h, r), {
        depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10,
      });
      g.translate(0, 0, -depth / 2);
      return g;
    }
    // rounded-rect flat geometry with 0–1 UVs (for screens)
    function screenGeo(w, h, r) {
      const g = new THREE.ShapeGeometry(roundShape(w, h, r), 12);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
      return g;
    }
    const tube = (pts, radius, segs = 64, closed = false) =>
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), segs, radius, 12, closed);
    const line = (a, b, radius) => tube([new THREE.Vector3(...a), new THREE.Vector3(...b)], radius, 2);
    const mesh = (g, m, parent, pos, rot) => {
      const o = new THREE.Mesh(g, m);
      if (pos) o.position.set(...pos);
      if (rot) o.rotation.set(...rot);
      if (parent) parent.add(o);
      return o;
    };

    /* ---------- 0 · wordmark: canvas text → contours → bevelled extrusion ---------- */
    function traceText() {
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

      // marching squares on a padded grid, iso = 128 alpha
      const S = 2, gw = Math.ceil(W / S) + 2, gh = Math.ceil(H / S) + 2;
      const val = new Float32Array(gw * gh);
      for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
        const x = Math.min(W - 1, (i - 1) * S), y = Math.min(H - 1, (j - 1) * S);
        val[j * gw + i] = data[(y * W + x) * 4 + 3] / 255;
      }
      const v = (i, j) => val[j * gw + i];
      const lerp = (a, b) => (0.5 - a) / (b - a);
      const pts = new Map();
      const pt = (key, i, j, horiz) => {
        if (!pts.has(key)) {
          const t = horiz ? lerp(v(i, j), v(i + 1, j)) : lerp(v(i, j), v(i, j + 1));
          pts.set(key, horiz ? [i + t, j] : [i, j + t]);
        }
        return key;
      };
      const adj = new Map();
      const link = (a, b) => {
        (adj.get(a) || adj.set(a, []).get(a)).push(b);
        (adj.get(b) || adj.set(b, []).get(b)).push(a);
      };
      for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
        const tl = v(i, j) > 0.5, tr = v(i + 1, j) > 0.5, br = v(i + 1, j + 1) > 0.5, bl = v(i, j + 1) > 0.5;
        const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
        if (idx === 0 || idx === 15) continue;
        const T = () => pt(`h${i},${j}`, i, j, true), B = () => pt(`h${i},${j + 1}`, i, j + 1, true);
        const L = () => pt(`v${i},${j}`, i, j, false), R = () => pt(`v${i + 1},${j}`, i + 1, j, false);
        switch (idx) {
          case 1: case 14: link(L(), B()); break;
          case 2: case 13: link(B(), R()); break;
          case 3: case 12: link(L(), R()); break;
          case 4: case 11: link(T(), R()); break;
          case 6: case 9: link(T(), B()); break;
          case 7: case 8: link(L(), T()); break;
          case 5: link(L(), T()); link(B(), R()); break;
          case 10: link(T(), R()); link(L(), B()); break;
        }
      }
      // stitch into loops
      const seen = new Set(), loops = [];
      for (const start of adj.keys()) {
        if (seen.has(start)) continue;
        const loop = [];
        let prev = null, cur = start;
        while (cur && !seen.has(cur)) {
          seen.add(cur); loop.push(pts.get(cur));
          const n = adj.get(cur);
          const next = n[0] !== prev && !seen.has(n[0]) ? n[0] : n[1] !== prev && !seen.has(n[1]) ? n[1] : null;
          prev = cur; cur = next;
        }
        if (loop.length > 8) loops.push(loop);
      }
      const s = 7.6 / total;
      const toWorld = ([gx, gy]) => new THREE.Vector2(((gx - 1) * S - W / 2) * s, -((gy - 1) * S - H * 0.5) * s);
      const area = (l) => { let a = 0; for (let k = 0; k < l.length; k++) { const p = l[k], q = l[(k + 1) % l.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };
      const inside = (p, l) => {
        let c = false;
        for (let a = 0, b = l.length - 1; a < l.length; b = a++) {
          if ((l[a].y > p.y) !== (l[b].y > p.y) && p.x < ((l[b].x - l[a].x) * (p.y - l[a].y)) / (l[b].y - l[a].y) + l[a].x) c = !c;
        }
        return c;
      };
      const wl = loops.map((l) => l.filter((_, k) => k % 2 === 0).map(toWorld)).filter((l) => Math.abs(area(l)) > 0.002);
      // nesting depth decides outer vs hole
      const info = wl.map((l, k) => {
        const parents = wl.filter((o, m) => m !== k && inside(l[0], o));
        return { l, depth: parents.length, parents };
      });
      const shapes = new Map();
      info.filter((o) => o.depth % 2 === 0).forEach((o) => shapes.set(o.l, new THREE.Shape(o.l)));
      info.filter((o) => o.depth % 2 === 1).forEach((o) => {
        const parent = o.parents.reduce((best, p) => (!best || Math.abs(area(p)) < Math.abs(area(best)) ? p : best), null);
        const sh = shapes.get(parent);
        if (sh) sh.holes.push(new THREE.Path(o.l));
      });
      const split = (x0 + w1 + gap / 2 - W / 2) * s;
      const os = [], mark = [];
      shapes.forEach((sh, l) => {
        const cx = l.reduce((a, p) => a + p.x, 0) / l.length;
        (cx < split ? os : mark).push(sh);
      });
      const ux0 = (x0 + w1 + gap - W / 2) * s, ux1 = (x0 + total - W / 2) * s, uy = -(base + 26 - H * 0.5) * s;
      return { os, mark, underline: [ux0, ux1, uy] };
    }
    function modelText(M) {
      const g = new THREE.Group();
      const { os, mark, underline } = traceText();
      const ext = (shapes) => {
        const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.018, bevelSegments: 3, curveSegments: 4 });
        geo.translate(0, 0, -0.13);
        geo.computeVertexNormals();
        return geo;
      };
      if (os.length) mesh(ext(os), M.gold(), g);
      if (mark.length) mesh(ext(mark), M.cream(), g);
      const [a, b, y] = underline;
      mesh(new THREE.CapsuleGeometry(0.045, b - a, 8, 16), M.red(), g, [(a + b) / 2, y, 0], [0, 0, Math.PI / 2]);
      return g;
    }

    /* ---------- 1 · globe ---------- */
    function earthTexture() {
      // procedural continents on an equirectangular map
      const w = mobile ? 512 : 1024, h = w / 2;
      const hash = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
      const noise = (x, y, z) => {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        let fx = x - ix, fy = y - iy, fz = z - iz;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
        const l = (a, b, t) => a + (b - a) * t;
        return l(l(l(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), l(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
                 l(l(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), l(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
      };
      const land = new Uint8Array(w * h);
      const color = canvasTex(w, h, (ctx) => {
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
          const lat = (0.5 - y / h) * Math.PI;
          for (let x = 0; x < w; x++) {
            const lon = (x / w) * TAU;
            const px = Math.cos(lat) * Math.cos(lon) * 1.6 + 5, py = Math.sin(lat) * 1.6 + 5, pz = Math.cos(lat) * Math.sin(lon) * 1.6 + 5;
            const n = noise(px, py, pz) * 0.55 + noise(px * 2.3, py * 2.3, pz * 2.3) * 0.3 + noise(px * 5, py * 5, pz * 5) * 0.15;
            const k = (y * w + x) * 4;
            const isLand = n > 0.53, coast = Math.abs(n - 0.53) < 0.012;
            land[y * w + x] = isLand ? 255 : 0;
            const polar = Math.abs(lat) > 1.25;
            if (polar) { img.data[k] = 205; img.data[k + 1] = 214; img.data[k + 2] = 230; }
            else if (isLand) { const d = (n - 0.53) * 3; img.data[k] = 46 + d * 60; img.data[k + 1] = 78 + d * 70; img.data[k + 2] = 140 + d * 60; }
            else { const d = (0.53 - n) * 1.6; img.data[k] = 10 - d * 6; img.data[k + 1] = 22 - d * 10; img.data[k + 2] = 52 - d * 18; }
            if (coast) { img.data[k] = 120; img.data[k + 1] = 160; img.data[k + 2] = 230; }
            img.data[k + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      });
      const rough = canvasTex(w, h, (ctx) => {
        const img = ctx.createImageData(w, h);
        for (let i = 0; i < w * h; i++) { const r = land[i] ? 200 : 70; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = r; img.data[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
      }, false);
      // gold graticule + city lights glow
      const glow = canvasTex(w, h, (ctx) => {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(233,203,139,0.55)'; ctx.lineWidth = w / 900;
        for (let d = -60; d <= 60; d += 20) { const y = (0.5 - d / 180) * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        for (let d = 0; d < 360; d += 22.5) { const x = (d / 360) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let i = 0; i < (mobile ? 500 : 1400); i++) {
          const x = (Math.random() * w) | 0, y = ((0.18 + Math.random() * 0.64) * h) | 0;
          if (!land[y * w + x]) continue;
          ctx.fillStyle = Math.random() < 0.15 ? 'rgba(255,59,78,0.9)' : 'rgba(255,214,150,0.85)';
          ctx.fillRect(x, y, w / 700, w / 700);
        }
      });
      return { color, rough, glow };
    }
    function modelGlobe(M, u) {
      const g = new THREE.Group();
      const R = 2.3;
      const tilt = new THREE.Group();
      tilt.rotation.set(0.35, 0, -0.25, 'ZYX');
      g.add(tilt);
      const tex = earthTexture();
      const earthMat = M.P({
        map: tex.color, roughnessMap: tex.rough, roughness: 1, metalness: 0.05,
        emissive: new THREE.Color(1, 1, 1), emissiveMap: tex.glow, emissiveIntensity: 0.9,
        envMapIntensity: 0.22,
      });
      if (TEXTURES.earth) { earthMat.color.setRGB(1.7, 1.7, 1.9); earthMat.emissiveIntensity = 1.8; }
      loadInto(earthMat, 'earth');
      loadInto(earthMat, 'earthLights', 'emissiveMap');
      loadInto(earthMat, 'earthRough', 'roughnessMap', { srgb: false });
      const earth = mesh(new THREE.SphereGeometry(R, mobile ? 64 : 96, mobile ? 48 : 64), earthMat, tilt);

      // atmosphere rim
      const atmo = new THREE.ShaderMaterial({
        uniforms: { uReveal: u.uReveal, uColor: { value: new THREE.Color('#6f9cff') } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uReveal; uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uColor * f * 1.4, f * uReveal); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      });
      mesh(new THREE.SphereGeometry(R * 1.12, 64, 48), atmo, g);

      const orbits = [];
      const ring = (rx, tx, tz, mat, sats) => {
        const og = new THREE.Group();
        og.rotation.set(tx, 0, tz, 'ZYX');
        g.add(og);
        const spin = new THREE.Group();
        og.add(spin);
        mesh(new THREE.TorusGeometry(rx, 0.022, 12, 220), mat, og, null, [Math.PI / 2, 0, 0]);
        sats.forEach((a) => {
          const sg = new THREE.Group();
          sg.position.set(Math.cos(a) * rx, 0, Math.sin(a) * rx);
          mesh(new THREE.SphereGeometry(0.12, 24, 16), M.red(), sg);
          mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 48), M.cream(), sg, null, [1.2, 0.3, 0]);
          spin.add(sg);
        });
        orbits.push(spin);
      };
      ring(3.2, 1.2, 0.4, M.gold(), [0.6, 3.4]);
      ring(3.65, 1.4, -0.6, M.goldBrushed(), [1.9, 4.6, 5.8]);
      g.userData.tick = (t) => {
        earth.rotation.y = -2.0 + Math.sin(t * 0.06) * 0.9; // sway over Americas, Atlantic, Europe & Africa
        orbits[0].rotation.y = -t * 0.12;
        orbits[1].rotation.y = -t * 0.08;
      };
      return g;
    }

    /* ---------- 2 · golden-ratio construction ---------- */
    function modelGolden(M) {
      const g = new THREE.Group();
      const b = Math.log(PHI) / (Math.PI / 2), a = 0.034, tMax = 4.5 * Math.PI;
      const pts = [];
      for (let i = 0; i <= 260; i++) {
        const th = (i / 260) * tMax, r = a * Math.exp(b * th);
        pts.push(new THREE.Vector3(r * Math.cos(th), r * Math.sin(th), (th / tMax - 0.5) * 1.4));
      }
      // tapered spiral: thicker as it grows
      const spiral = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 1, 16, false);
      const p = spiral.attributes.position, n = spiral.attributes.normal;
      const center = new THREE.Vector3(), segs = 401, ring = 17;
      for (let s = 0; s < segs; s++) {
        const rad = 0.018 + (s / (segs - 1)) * 0.09;
        center.set(0, 0, 0);
        for (let k = 0; k < ring; k++) center.add(new THREE.Vector3().fromBufferAttribute(p, s * ring + k));
        center.divideScalar(ring);
        for (let k = 0; k < ring; k++) {
          const i = s * ring + k;
          p.setXYZ(i, center.x + n.getX(i) * rad, center.y + n.getY(i) * rad, center.z + n.getZ(i) * rad);
        }
      }
      p.needsUpdate = true;
      mesh(spiral, M.gold(), g);
      const circ = (r, x, y, z, m, t = 0.03) => mesh(new THREE.TorusGeometry(r, t, 16, 160), m, g, [x, y, z]);
      circ(2.6, 0, 0, -0.6, M.cream(), 0.028);
      circ(1.6, 1.0, 0, -0.2, M.red(), 0.04);
      circ(0.99, 1.0, 0.6, 0.2, M.cream(), 0.032);
      circ(0.62, 0.62, 0.6, 0.5, M.gold(), 0.03);
      circ(0.38, 0.62, 0.83, 0.8, M.red(), 0.028);
      const guide = M.sky();
      mesh(line([-3.4, 0, 0], [3.4, 0, 0], 0.014), guide, g);
      mesh(line([0, -3.2, 0], [0, 3.2, 0], 0.014), guide, g);
      const faint = M.P({ color: COL.cream, roughness: 0.4, metalness: 0.2 });
      mesh(line([-2.3, -2.3, -0.3], [2.3, 2.3, 0.3], 0.01), faint, g);
      mesh(line([-2.3, 2.3, 0.3], [2.3, -2.3, -0.3], 0.01), faint, g);
      // small gold nodes where guides cross circles
      const node = new THREE.SphereGeometry(0.06, 20, 14), nm = M.gold();
      [[2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6], [2.6, 0], [-0.6, 0]].forEach(([x, y]) => mesh(node, nm, g, [x, y, x === -0.6 ? -0.2 : -0.6]));
      return g;
    }

    /* ---------- 3 · browser window ---------- */
    function websiteTexture() {
      return canvasTex(1600, 1000, (ctx, w, h) => {
        const k = w / 6.1; // px per world unit on the 6.1 × 3.9 screen
        const X = (x) => (x + 3.05) * k, Y = (y) => (1.95 - y) * k;
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0f1b38'); bg.addColorStop(1, '#070d1e');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        // toolbar
        ctx.fillStyle = '#16213f'; ctx.fillRect(0, 0, w, Y(1.55));
        ctx.fillStyle = 'rgba(245,239,227,0.12)'; rr(ctx, X(-1.0), Y(2.03), 2.4 * k, 0.3 * k, 0.15 * k); ctx.fill();
        ctx.fillStyle = 'rgba(245,239,227,0.5)'; ctx.font = `${0.14 * k}px Inter, sans-serif`; ctx.fillText('osmark.agency', X(-0.8), Y(1.83));
        ctx.fillStyle = 'rgba(245,239,227,0.15)'; ctx.fillRect(0, Y(1.55), w, 3);
        // hero block
        const hg = ctx.createLinearGradient(X(-2.8), 0, X(0), 0);
        hg.addColorStop(0, '#FF3B4E'); hg.addColorStop(1, '#C21F33');
        ctx.fillStyle = hg; rr(ctx, X(-2.8), Y(1.2), 2.8 * k, 1.3 * k, 0.1 * k); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `italic 700 ${0.32 * k}px "Playfair Display", Georgia, serif`;
        ctx.fillText('Grow', X(-2.55), Y(0.62));
        ctx.font = `800 ${0.32 * k}px Inter, sans-serif`; ctx.fillText('faster.', X(-1.65), Y(0.62));
        // text lines + button
        ctx.fillStyle = '#F5EFE3'; ctx.fillRect(X(0.6), Y(1.03), 2.2 * k, 0.07 * k);
        ctx.fillStyle = 'rgba(245,239,227,0.55)'; ctx.fillRect(X(0.6), Y(0.78), 1.8 * k, 0.05 * k); ctx.fillRect(X(0.6), Y(0.53), 1.4 * k, 0.05 * k);
        ctx.fillStyle = '#E9CB8B'; rr(ctx, X(0.6), Y(0.22), 1.1 * k, 0.34 * k, 0.17 * k); ctx.fill();
        ctx.fillStyle = '#0b1630'; ctx.font = `700 ${0.13 * k}px Inter, sans-serif`; ctx.fillText('Start now', X(0.78), Y(0.0));
        // card shadows (real cards float above)
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        [-2.1, 0, 2.1].forEach((x) => { rr(ctx, X(x - 0.9), Y(-0.48), 1.85 * k, 1.25 * k, 0.12 * k); ctx.fill(); });
      });
    }
    function cardTexture() {
      return canvasTex(370, 250, (ctx, w, h) => {
        ctx.fillStyle = '#F5EFE3'; ctx.fillRect(0, 0, w, h);
        const gr = ctx.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, '#9CB9F5'); gr.addColorStop(1, '#4F7FE0');
        ctx.fillStyle = gr; rr(ctx, 16, 16, w - 32, h * 0.46, 12); ctx.fill();
        ctx.fillStyle = '#0b1630'; ctx.fillRect(18, h * 0.62, w * 0.6, 14);
        ctx.fillStyle = 'rgba(11,22,48,0.4)'; ctx.fillRect(18, h * 0.76, w * 0.75, 9); ctx.fillRect(18, h * 0.85, w * 0.5, 9);
      });
    }
    function modelBrowser(M) {
      const g = new THREE.Group();
      mesh(slab(6.4, 4.2, 0.28, 0.14, 0.04), M.graphite(), g);
      const screenMat = M.P({ color: 0xffffff, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.55 });
      screenMat.map = screenMat.emissiveMap = websiteTexture();
      loadInto(screenMat, 'website', 'map', { emissive: true });
      mesh(screenGeo(6.1, 3.9, 0.16), screenMat, g, [0, 0, 0.115]);
      // traffic lights
      const dot = new THREE.CylinderGeometry(0.085, 0.085, 0.04, 32);
      [[-2.85, M.red()], [-2.58, M.gold()], [-2.31, M.cream()]].forEach(([x, m]) => mesh(dot, m, g, [x, 1.88, 0.13], [Math.PI / 2, 0, 0]));
      // floating cards
      const cardMat = M.P({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
      cardMat.map = cardTexture();
      const cardGeo = slab(1.75, 1.15, 0.1, 0.05, 0.025);
      const front = screenGeo(1.75, 1.15, 0.1);
      const edgeMat = M.gold();
      [-2.1, 0, 2.1].forEach((x, i) => {
        const cg = new THREE.Group();
        cg.position.set(x, -1.05, 0.55);
        cg.userData.base = cg.position.y; cg.userData.ph = i * 1.3;
        mesh(cardGeo, edgeMat, cg);
        mesh(front, cardMat, cg, [0, 0, 0.051]);
        g.add(cg);
      });
      // </> glyph
      const glyph = new THREE.Group(), gm = M.red();
      const x = 2.55, y = 2.55, z = 1.3;
      [[[x + 0.25, y + 0.25, z], [x, y, z], [x + 0.25, y - 0.25, z]], [[x + 0.55, y - 0.3, z], [x + 0.8, y + 0.3, z]], [[x + 1.1, y + 0.25, z], [x + 1.35, y, z], [x + 1.1, y - 0.25, z]]]
        .forEach((path) => {
          for (let k = 0; k < path.length - 1; k++) mesh(line(path[k], path[k + 1], 0.055), gm, glyph);
          path.forEach((q) => mesh(new THREE.SphereGeometry(0.055, 16, 12), gm, glyph, q));
        });
      g.add(glyph);
      g.userData.tick = (t) => {
        g.children.forEach((c) => { if (c.userData.base !== undefined) c.position.y = c.userData.base + Math.sin(t * 1.1 + c.userData.ph) * 0.05; });
        glyph.position.y = Math.sin(t * 0.9) * 0.06;
      };
      return g;
    }

    /* ---------- 4 · phone ---------- */
    function appTexture() {
      return canvasTex(560, 1200, (ctx, w, h) => {
        const k = w / 2.1, X = (x) => (x + 1.05) * k, Y = (y) => (2.25 - y) * k;
        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#13234a'); bg.addColorStop(1, '#060b19');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(245,239,227,0.85)'; ctx.font = `600 ${0.13 * k}px Inter, sans-serif`;
        ctx.fillText('9:41', X(-0.85), Y(2.02));
        ctx.fillStyle = '#F5EFE3'; ctx.font = `800 ${0.2 * k}px Inter, sans-serif`; ctx.fillText('Good morning', X(-0.85), Y(1.75));
        // tile wells (3D icons sit on top)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { rr(ctx, X((c - 1) * 0.66 - 0.24), Y(1.3 - r * 0.66 + 0.24), 0.48 * k, 0.48 * k, 0.12 * k); ctx.fill(); }
        // bottom card
        const cg = ctx.createLinearGradient(X(-0.8), 0, X(0.8), 0);
        cg.addColorStop(0, 'rgba(233,203,139,0.55)'); cg.addColorStop(1, 'rgba(201,164,92,0.25)');
        ctx.fillStyle = cg; rr(ctx, X(-0.8), Y(-1.32), 1.6 * k, 0.36 * k, 0.1 * k); ctx.fill();
        ctx.fillStyle = '#F5EFE3'; ctx.fillRect(X(-0.65), Y(-1.45), 0.8 * k, 0.05 * k);
        ctx.fillStyle = 'rgba(245,239,227,0.8)'; rr(ctx, X(-0.45), Y(-2.03), 0.9 * k, 0.04 * k, 0.02 * k); ctx.fill();
      });
    }
    function modelPhone(M) {
      const g = new THREE.Group();
      mesh(slab(2.4, 4.8, 0.4, 0.2, 0.05), M.goldBrushed(), g);
      mesh(slab(2.3, 4.7, 0.36, 0.27, 0.02), M.graphite(), g);
      const screenMat = M.P({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.55 });
      screenMat.map = screenMat.emissiveMap = appTexture();
      loadInto(screenMat, 'app', 'map', { emissive: true });
      mesh(screenGeo(2.1, 4.5, 0.3), screenMat, g, [0, 0, 0.158]);
      mesh(new THREE.CapsuleGeometry(0.09, 0.52, 6, 16), M.P({ color: 0x05070d, roughness: 0.2, metalness: 0.5 }), g, [0, 2.05, 0.165], [0, 0, Math.PI / 2]);
      // app icons
      const icon = slab(0.42, 0.42, 0.11, 0.04, 0.02), mats = [M.gold(), M.red(), M.sky()];
      if (!TEXTURES.app) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) mesh(icon, mats[(r + c) % 3], g, [(c - 1) * 0.66, 1.3 - r * 0.66, 0.2]);
      }
      // notification bubbles
      const bubble = (w, x, y, z, m, ph) => {
        const bg = new THREE.Group();
        bg.position.set(x, y, z);
        bg.userData.base = y; bg.userData.ph = ph;
        mesh(slab(w, 0.55, 0.22, 0.08, 0.04), m, bg);
        mesh(new THREE.CapsuleGeometry(0.035, w * 0.5, 4, 12), M.cream(), bg, [0.1, 0.06, 0.08], [0, 0, Math.PI / 2]);
        mesh(new THREE.CapsuleGeometry(0.025, w * 0.32, 4, 12), M.cream(), bg, [-0.02, -0.1, 0.08], [0, 0, Math.PI / 2]);
        mesh(new THREE.SphereGeometry(0.12, 24, 16), M.cream(), bg, [-w / 2 + 0.24, 0, 0.05]);
        g.add(bg);
      };
      bubble(1.9, 1.75, 1.35, 0.9, M.gold(), 0);
      bubble(1.7, -1.8, -0.6, 0.7, M.red(), 1.7);
      g.userData.tick = (t) => {
        g.children.forEach((c) => { if (c.userData.base !== undefined) c.position.y = c.userData.base + Math.sin(t * 1.2 + c.userData.ph) * 0.06; });
      };
      return g;
    }

    /* ---------- 5 · shopping bag ---------- */
    function paperTextures() {
      const N = 512;
      const fibre = (ctx, base) => {
        ctx.fillStyle = base; ctx.fillRect(0, 0, N, N);
        for (let i = 0; i < 2600; i++) {
          const x = Math.random() * N, y = Math.random() * N, l = 4 + Math.random() * 18, a = Math.random() * TAU;
          ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
          ctx.lineWidth = 0.6 + Math.random();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
        }
      };
      const color = canvasTex(N, N, (ctx) => fibre(ctx, '#B81C30'));
      const bump = canvasTex(N, N, (ctx) => fibre(ctx, '#808080'), false);
      [color, bump].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); });
      return { color, bump };
    }
    function modelBag(M) {
      const g = new THREE.Group();
      const hw = 1.4, top = 0.9, bot = -1.7, hd = 0.6, H = top - bot;
      const paper = paperTextures();
      const paperMat = (k = 1) => {
        const m = M.P({ color: new THREE.Color(k, k, k), map: paper.color, bumpMap: paper.bump, bumpScale: 0.6, roughness: 0.62, sheen: 0.4, sheenColor: COL.red, side: THREE.DoubleSide });
        loadInto(m, 'paper');
        return m;
      };
      const side = paperMat(0.78), back = paperMat(0.9), bottom = paperMat(0.6);
      const front = paperMat(1);
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      const body = new THREE.BoxGeometry(hw * 2, H, hd * 2, 1, 1, 1);
      mesh(body, [side, side, hidden, bottom, front, back], g, [0, (top + bot) / 2, 0]);
      // folded top hem
      const hem = M.P({ color: COL.redDeep, roughness: 0.55, side: THREE.DoubleSide });
      mesh(new THREE.BoxGeometry(hw * 2 + 0.02, 0.14, 0.02), hem, g, [0, top - 0.07, hd + 0.005]);
      mesh(new THREE.BoxGeometry(hw * 2 + 0.02, 0.14, 0.02), hem, g, [0, top - 0.07, -hd - 0.005]);
      // gusset crease lines on the sides
      const crease = M.P({ color: COL.redDeep, roughness: 0.7 });
      [-hw - 0.004, hw + 0.004].forEach((x) => mesh(new THREE.BoxGeometry(0.005, H * 0.92, 0.012), crease, g, [x, (top + bot) / 2 + 0.05, 0]));
      // rope handles
      const handle = (z, m) => {
        const pts = [];
        for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * 0.65, top - 0.12 + Math.sin(a) * 0.97, z)); }
        mesh(tube(pts, 0.045, 80), m, g);
        [-0.65, 0.65].forEach((x) => mesh(new THREE.TorusGeometry(0.07, 0.025, 10, 24), M.gold(), g, [x, top - 0.12, z + Math.sign(z) * 0.01]));
      };
      handle(hd + 0.03, M.gold());
      handle(-hd - 0.03, M.goldBrushed());
      // embossed gold logo (ring + dot) on the front
      const logoY = -0.45, logoZ = hd + 0.012;
      mesh(new THREE.TorusGeometry(0.48, 0.055, 20, 96), M.gold(), g, [-0.08, logoY, logoZ]);
      mesh(new THREE.SphereGeometry(0.13, 32, 20), M.red(), g, [0.42, logoY + 0.42, logoZ + 0.03]);
      // price tag on a string
      const tag = new THREE.Group();
      tag.position.set(1.95, top - 0.4, hd + 0.05);
      const tagShape = roundShape(0.55, 0.8, 0.1);
      const hole = new THREE.Path(); hole.absarc(0, 0.27, 0.06, 0, TAU, true); tagShape.holes.push(hole);
      const tagGeo = new THREE.ExtrudeGeometry(tagShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
      mesh(tagGeo, M.cream(), tag, null, null);
      mesh(new THREE.CapsuleGeometry(0.025, 0.25, 4, 12), M.redDeep(), tag, [0, -0.05, 0.035], [0, 0, Math.PI / 2]);
      mesh(new THREE.CapsuleGeometry(0.018, 0.15, 4, 12), M.P({ color: COL.ink, roughness: 0.5 }), tag, [0, -0.2, 0.035], [0, 0, Math.PI / 2]);
      g.add(tag);
      mesh(tube([new THREE.Vector3(0.65, top, hd + 0.03), new THREE.Vector3(1.3, top + 0.05, hd + 0.08), new THREE.Vector3(1.95, top - 0.13, hd + 0.06)], 0.012, 24), M.P({ color: COL.cream, roughness: 0.8 }), g);
      // coins
      const coinGeo = new THREE.CylinderGeometry(1, 1, 0.22, 64);
      const rimGeo = new THREE.TorusGeometry(0.88, 0.05, 12, 64);
      const coinFace = M.goldBrushed(), coinRim = M.gold();
      const coins = [];
      [[0.32, -2.35, 1.3, 0.5, 0], [0.32, 2.5, -1.3, 0.8, 1.4], [0.25, -2.1, -1.6, -0.4, 2.6]].forEach(([r, x, y, z, ph]) => {
        const c = new THREE.Group();
        c.position.set(x, y, z); c.scale.setScalar(r); c.userData.ph = ph;
        mesh(coinGeo, coinFace, c, null, [Math.PI / 2, 0, 0]);
        mesh(rimGeo, coinRim, c, [0, 0, 0.11]);
        mesh(rimGeo, coinRim, c, [0, 0, -0.11]);
        g.add(c); coins.push(c);
      });
      g.userData.tick = (t) => {
        coins.forEach((c) => { c.rotation.y = t * 0.9 + c.userData.ph; c.rotation.x = Math.sin(t * 0.7 + c.userData.ph) * 0.25; });
        tag.rotation.z = Math.sin(t * 1.3) * 0.08;
      };
      return g;
    }

    /* ---------- 7 · portal ring ---------- */
    function modelTorus(M) {
      const g = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.rotation.x = 0.35;
      g.add(tilt);
      const geo = new THREE.TorusGeometry(2.4, 0.55, mobile ? 48 : 64, mobile ? 160 : 240);
      const p = geo.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const u = Math.atan2(p.getY(i), p.getX(i)), t = (Math.sin(u) + 1) / 2;
        c.copy(COL.red).lerp(COL.gold, t);
        cols.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const ringMat = M.P({ vertexColors: true, metalness: 0.75, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0.25 });
      const ring = mesh(geo, ringMat, tilt);
      mesh(new THREE.TorusGeometry(1.45, 0.035, 16, 200), M.cream(), tilt);
      const beads = new THREE.Group();
      const bead = new THREE.SphereGeometry(0.07, 20, 14), bm = M.gold();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; mesh(bead, bm, beads, [Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0]); }
      tilt.add(beads);
      g.userData.tick = (t) => { ring.rotation.z = t * 0.15; beads.rotation.z = -t * 0.25; };
      return g;
    }

    /* ---------- assemble ---------- */
    const builders = { 0: modelText, 1: modelGlobe, 2: modelGolden, 3: modelBrowser, 4: modelPhone, 5: modelBag, 7: modelTorus };
    const models = {};
    Object.keys(builders).forEach((k) => {
      const u = { uReveal: { value: 0 }, uEdge: { value: new THREE.Color('#E9CB8B').multiplyScalar(1.4) } };
      const M = makeMats(u);
      const group = builders[k](M, u);
      group.visible = false;
      models[k] = { group, u };
    });
    return models;
  }

  /* ---------- studio environment for reflections ---------- */
  function studioEnvironment(THREE, renderer) {
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(20, 14, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0a1430'), side: THREE.BackSide }));
    env.add(room);
    const panel = (w, h, color, k, pos, look) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos);
      m.lookAt(...look);
      env.add(m);
    };
    panel(8, 5, '#fff3dc', 9, [-5, 5, 6], [0, 0, 0]);    // warm key softbox
    panel(3, 10, '#8fb2ff', 6, [8, 0, -2], [0, 0, 0]);   // cool rim strip
    panel(10, 1.2, '#E9CB8B', 4, [0, -6, 3], [0, 0, 0]); // gold floor bounce
    panel(4, 4, '#ffffff', 5, [3, 6.5, 3], [0, 0, 0]);   // top fill
    panel(2, 6, '#FF3B4E', 2.5, [-9, 0, -4], [0, 0, 0]); // brand red kicker
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
    return tex;
  }

  window.OsModels = { create, studioEnvironment };
})();
