// Ilustraciones propias "recortadas" (sin fondo) en vista 3/4, estilo tienda.
// Son vehículos genéricos (sin marcas ni diseños de fabricante).
// vehicleCutout(tipo, color) → SVG. Tipos: cab-high, cab-mid, cab-low, cab-flat, cab-electric, rigid,
// us-long, us-aero, us-heavy, coach, citybus, double, artic, minibus
(function () {
  const S = 50; // píxeles por metro
  // proyección 3/4: frente hacia la izquierda, costado derecho alejándose hacia la derecha
  const P = (l, w, h) => [w * 0.95 * S + l * 0.42 * S, -h * S - w * 0.05 * S - l * 0.13 * S];
  let uid = 0;

  const hex = (c) => { const n = parseInt(c.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (c, f) => { const [r, g, b] = hex(c); const m = (v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)); return `rgb(${m(r)},${m(g)},${m(b)})`; };

  function build(draw) {
    const parts = []; const pts = [];
    const add = (s, ps) => { parts.push(s); ps.forEach((p) => pts.push(p)); };
    const poly = (ps, fill, extra = '') => add(`<polygon points="${ps.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" ${extra}/>`, ps);
    const api = {
      poly,
      // rectángulo en el plano frontal (l fijo): w0..w1 x h0..h1
      F: (l, w0, w1, h0, h1, fill, extra) => poly([P(l, w0, h0), P(l, w1, h0), P(l, w1, h1), P(l, w0, h1)], fill, extra),
      // rectángulo en el plano lateral (w fijo): l0..l1 x h0..h1
      Sd: (w, l0, l1, h0, h1, fill, extra) => poly([P(l0, w, h0), P(l1, w, h0), P(l1, w, h1), P(l0, w, h1)], fill, extra),
      // rectángulo en el plano superior (h fijo)
      T: (h, l0, l1, w0, w1, fill, extra) => poly([P(l0, w0, h), P(l0, w1, h), P(l1, w1, h), P(l1, w0, h)], fill, extra),
      // caja completa (frente, costado y techo)
      box: (l0, l1, w0, w1, h0, h1, c, opt = {}) => {
        if (!opt.noTop) api.T(h1, l0, l1, w0, w1, opt.top || mix(c, 0.18));
        api.Sd(w1, l0, l1, h0, h1, opt.side || mix(c, -0.1));
        if (!opt.noFront) api.F(l0, w0, w1, h0, h1, opt.front || c);
      },
      wheel: (l, w, r = 0.52, far = false) => {
        const [x, y] = P(l, w, r);
        const rx = r * S * 0.46, ry = r * S;
        add(`<g opacity="${far ? 0.55 : 1}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#15171C"/>
          <ellipse cx="${x + rx * 0.08}" cy="${y}" rx="${rx * 0.55}" ry="${ry * 0.58}" fill="${far ? '#2A2E36' : '#A9B2BF'}"/>
          <ellipse cx="${x + rx * 0.1}" cy="${y}" rx="${rx * 0.22}" ry="${ry * 0.24}" fill="#4B525E"/></g>`, [[x - rx, y - ry], [x + rx, y + ry]]);
      },
      raw: (s, ps = []) => add(s, ps),
      grad: (stops, vertical = true) => { const id = `cg${++uid}`; parts.push(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? 0 : 1}" y2="${vertical ? 1 : 0}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`); return `url(#${id})`; },
    };
    draw(api);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, y0 = Math.min(...ys) - 10, y1 = Math.max(...ys) + 16;
    const shadow = `<ellipse cx="${(x0 + x1) / 2}" cy="${y1 - 12}" rx="${(x1 - x0) / 2.1}" ry="9" fill="rgba(0,0,0,.35)" filter="blur(4px)"/>`;
    return `<svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${shadow}${parts.join('')}</svg>`;
  }

  const W = 2.5;
  const GLASS = ['#0E141E', '#2C3B52'];
  const CHROME = '#C7CFDA', DARK = '#23262D', MID = '#3A3F49';

  // ---------- cabina europea (cabover) + chasis de tractora
  function cabover(c, o = {}) {
    const roof = o.roof || 3.7, cabL = o.cabL || 2.3, axles = o.axles || [4.9], len = o.len || 6.2;
    return build((a) => {
      const glass = a.grad([[0, GLASS[1]], [1, GLASS[0]]]);
      // ruedas del lado lejano
      [1.25, ...axles].forEach((l) => a.wheel(l, 0.15, 0.52, true));
      // chasis
      a.box(cabL - 0.1, len, 0.5, W - 0.4, 0.75, 1.1, DARK, { noFront: true });
      if (o.body) { // carrocería rígida (reparto)
        a.box(cabL + 0.15, len, 0.05, W + 0.02, 1.15, o.body, mix(c, 0.35), { front: mix(c, 0.15) });
        a.Sd(W + 0.02, cabL + 0.5, len - 0.3, o.body - 0.6, o.body - 0.25, mix(c, -0.25));
      } else {
        a.T(1.12, axles[0] - 0.55, axles[0] + 0.45, 0.6, W - 0.6, '#16181D'); // quinta rueda
        a.Sd(W - 0.4, cabL + 0.2, cabL + 1.3, 0.6, 1.05, CHROME); // depósito
        a.Sd(W - 0.38, cabL + 0.2, cabL + 1.3, 0.95, 1.05, '#E3E8EF');
      }
      axles.forEach((l) => { a.Sd(W - 0.3, l - 0.62, l + 0.62, 1.05, 1.18, DARK); a.wheel(l, W - 0.25); });
      // cabina
      a.box(0, cabL, 0, W, 0.62, roof, c);
      if (o.spoiler) a.box(cabL - 0.05, cabL + 0.35, 0.1, W - 0.1, roof - 0.9, roof - 0.05, mix(c, -0.05));
      // frente
      a.F(0, 0.12, W - 0.12, 2.2, roof - 0.32, glass);                                   // parabrisas
      a.F(0, 0.05, W - 0.05, roof - 0.3, roof - 0.08, mix(c, -0.18));                   // visera
      if (o.electric) {
        a.F(0, 0.35, W - 0.35, 1.32, 2.02, mix(c, -0.06)); a.F(0, 0.5, W - 0.5, 1.62, 1.68, MID);
      } else {
        a.F(0, 0.3, W - 0.3, 1.25, 2.05, DARK);
        for (let i = 0; i < 6; i++) a.F(0, 0.36, W - 0.36, 1.33 + i * 0.12, 1.39 + i * 0.12, i % 2 ? MID : CHROME);
      }
      a.F(0, 0.08, 0.62, 0.95, 1.18, '#F7F9FC'); a.F(0, W - 0.62, W - 0.08, 0.95, 1.18, '#F7F9FC');   // faros
      a.F(0, 0.12, 0.55, 1.0, 1.12, '#BFE3FF'); a.F(0, W - 0.55, W - 0.12, 1.0, 1.12, '#BFE3FF');
      a.F(0, 0, W, 0.55, 0.92, MID);                                                      // parachoques
      a.F(0, 0.9, 1.6, 0.66, 0.82, '#F2F2F2');                                            // matrícula
      // costado de la cabina
      a.Sd(W, 0.25, 1.65, 2.25, roof - 0.45, glass);                                       // ventanilla
      a.Sd(W, 0.2, 1.7, 0.95, roof - 0.35, 'none', `stroke="${mix(c, -0.3)}" stroke-width="1.2"`); // puerta
      a.Sd(W, 0.35, 1.25, 0.62, 0.95, DARK);                                               // escalón
      if (roof > 3.5) a.Sd(W, 1.8, cabL - 0.1, roof - 0.9, roof - 0.55, glass);             // ventana litera
      // retrovisor
      const [mx, my] = P(0.15, W + 0.35, 2.3);
      a.raw(`<line x1="${P(0.05, W, 2.8)[0]}" y1="${P(0.05, W, 2.8)[1]}" x2="${mx}" y2="${my - 18}" stroke="${DARK}" stroke-width="2.5"/><rect x="${mx - 4}" y="${my - 30}" width="9" height="30" rx="2" fill="${DARK}"/>`, [[mx + 6, my]]);
      a.wheel(1.25, W - 0.05);
    });
  }

  // ---------- americano de capó largo
  function conventional(c, o = {}) {
    const hood = o.hood || 2.3, sleeperTop = o.sleeper || 3.9, len = o.len || 8.2, axles = o.axles || [6.6, 7.8];
    return build((a) => {
      const glass = a.grad([[0, GLASS[1]], [1, GLASS[0]]]);
      [1.0, ...axles].forEach((l) => a.wheel(l, 0.15, 0.55, true));
      a.box(hood, len, 0.5, W - 0.4, 0.75, 1.1, DARK, { noFront: true });
      a.T(1.12, axles[0] - 0.4, axles[0] + 0.6, 0.6, W - 0.6, '#16181D');
      axles.forEach((l) => { a.Sd(W - 0.3, l - 0.65, l + 0.65, 1.05, 1.2, DARK); a.wheel(l, W - 0.25, 0.55); });
      // cabina y litera
      a.box(hood, hood + 1.5, 0, W, 0.9, 3.25, c);
      a.box(hood + 1.5, hood + (o.aero ? 3.7 : 3.4), 0, W, 0.9, sleeperTop, c, { front: mix(c, -0.04) });
      if (o.aero) a.Sd(W, hood + 3.7, hood + 4.4, 1.2, 2.0, mix(c, -0.15));
      a.F(hood, 0.15, W - 0.15, 2.45, 3.1, glass);
      a.Sd(W, hood + 0.25, hood + 1.25, 2.3, 3.0, glass);
      a.Sd(W, hood + 0.2, hood + 1.35, 1.0, 3.1, 'none', `stroke="${mix(c, -0.3)}" stroke-width="1.2"`);
      a.Sd(W, hood + 2.0, hood + 2.9, 1.8, 3.0, mix(c, -0.2));
      // escapes cromados
      if (!o.aero) { a.Sd(W + 0.05, hood + 1.42, hood + 1.55, 1.0, 4.35, CHROME); a.Sd(0.3, hood + 1.42, hood + 1.55, 3.25, 4.35, CHROME); }
      // capó (más estrecho, con pendiente)
      const hw0 = 0.3, hw1 = W - 0.3, hTop = o.aero ? 2.15 : 2.35;
      a.poly([P(0, hw0, hTop - (o.aero ? 0.25 : 0)), P(0, hw1, hTop - (o.aero ? 0.25 : 0)), P(hood, hw1 + 0.15, hTop + 0.2), P(hood, hw0 - 0.15, hTop + 0.2)], mix(c, 0.18));
      a.poly([P(0, hw1, 1.0), P(hood, hw1 + 0.15, 1.0), P(hood, hw1 + 0.15, hTop + 0.2), P(0, hw1, hTop - (o.aero ? 0.25 : 0))], mix(c, -0.1));
      a.F(0, hw0, hw1, 1.0, hTop - (o.aero ? 0.25 : 0), c);
      // rejilla
      a.F(0, hw0 + 0.15, hw1 - 0.15, 1.15, hTop - (o.aero ? 0.4 : 0.15), o.aero ? DARK : CHROME);
      for (let i = 0; i < 9; i++) a.F(0, hw0 + 0.22, hw1 - 0.22, 1.2 + i * 0.12, 1.25 + i * 0.12, o.aero ? MID : '#8E98A6');
      a.F(0, 0.0, 0.42, 1.05, 1.35, '#F7F9FC'); a.F(0, W - 0.42, W, 1.05, 1.35, '#F7F9FC');
      a.F(0, -0.05, W + 0.05, 0.62, 1.0, CHROME);                                     // parachoques cromado
      // guardabarros delanteros
      a.Sd(W + 0.02, 0.35, 1.7, 0.95, 1.25, mix(c, -0.2));
      a.wheel(1.0, W - 0.05, 0.55);
      const [mx, my] = P(hood + 0.1, W + 0.4, 2.6);
      a.raw(`<rect x="${mx - 3}" y="${my - 34}" width="8" height="34" rx="2" fill="${CHROME}"/>`, [[mx + 6, my]]);
    });
  }

  // ---------- autobuses
  function bus(c, o = {}) {
    const len = o.len || 12, h = o.height || 3.3, low = o.floor || 0.35;
    return build((a) => {
      const glass = a.grad([[0, GLASS[1]], [1, GLASS[0]]]);
      const axles = o.axles || [2.7, len - 2.9];
      axles.forEach((l) => a.wheel(l, 0.15, 0.5, true));
      a.box(0, len, 0, W, low, h, c, { top: mix(c, 0.2) });
      // frente
      if (o.double) {
        a.F(0, 0.1, W - 0.1, 1.2, 2.3, glass); a.F(0, 0.1, W - 0.1, 2.55, h - 0.25, glass);
      } else {
        a.F(0, 0.08, W - 0.08, 1.15, h - (o.coach ? 0.15 : 0.45), glass);
        a.F(0, 0.15, W - 0.15, h - 0.42, h - 0.12, '#101318');                            // indicador de destino
        a.F(0, 0.35, W - 0.35, h - 0.33, h - 0.22, '#FFB020');
      }
      a.F(0, 0.06, 0.55, 0.6, 0.85, '#F7F9FC'); a.F(0, W - 0.55, W - 0.06, 0.6, 0.85, '#F7F9FC');
      a.F(0, 0, W, low, 0.55, mix(c, -0.25));
      // costado: ventanas continuas
      const win = (h0, h1) => { a.Sd(W, o.doorFront ? 1.5 : 0.4, len - 0.4, h0, h1, glass); for (let l = 2.4; l < len - 0.6; l += 1.6) a.Sd(W, l, l + 0.09, h0, h1, mix(c, -0.05)); };
      if (o.double) { win(1.25, 2.25); win(2.55, h - 0.25); } else win(o.coach ? 1.75 : 1.3, h - 0.3);
      if (o.doorFront) a.Sd(W, 0.25, 1.35, low + 0.05, h - 0.4, glass);
      (o.doors || []).forEach((l) => a.Sd(W, l, l + 1.2, low + 0.05, h - 0.4, glass, `stroke="${mix(c, -0.35)}" stroke-width="1"`));
      if (o.coach) { a.Sd(W, 3.5, len - 3.6, 0.5, 1.45, mix(c, -0.12)); for (let l = 3.6; l < len - 3.6; l += 1.8) a.Sd(W, l, l + 0.05, 0.55, 1.4, mix(c, -0.3)); }
      if (o.joint) a.Sd(W + 0.01, o.joint - 0.35, o.joint + 0.35, low, h, '#1A1C22');
      a.Sd(W, 0.2, len - 0.2, low + 0.02, low + 0.22, mix(c, -0.28));
      axles.forEach((l) => a.wheel(l, W - 0.02, 0.5));
      const [mx, my] = P(0.05, W + 0.3, h - 0.5);
      a.raw(`<rect x="${mx - 3}" y="${my - 6}" width="7" height="26" rx="2" fill="${DARK}"/>`, [[mx + 5, my + 20]]);
    });
  }

  function minibus(c) {
    return build((a) => {
      const glass = a.grad([[0, GLASS[1]], [1, GLASS[0]]]);
      [1.1, 5.3].forEach((l) => a.wheel(l, 0.15, 0.4, true));
      a.box(0.9, 7, 0, W - 0.2, 0.45, 2.85, c);
      // morro inclinado
      a.poly([P(0, 0.1, 0.45), P(0, W - 0.3, 0.45), P(0, W - 0.3, 1.25), P(0.9, W - 0.2, 2.75), P(0.9, 0, 2.75), P(0, 0.1, 1.25)], c);
      a.poly([P(0, W - 0.3, 0.45), P(0.9, W - 0.2, 0.45), P(0.9, W - 0.2, 2.75), P(0, W - 0.3, 1.25)], mix(c, -0.1));
      a.poly([P(0.1, 0.2, 1.4), P(0.1, W - 0.4, 1.4), P(0.85, W - 0.3, 2.6), P(0.85, 0.1, 2.6)], glass);
      a.F(0, 0.15, 0.6, 0.85, 1.05, '#F7F9FC'); a.F(0, W - 0.8, W - 0.35, 0.85, 1.05, '#F7F9FC');
      a.Sd(W - 0.2, 1.0, 6.7, 1.6, 2.55, glass);
      for (let l = 2.4; l < 6.6; l += 1.3) a.Sd(W - 0.2, l, l + 0.08, 1.6, 2.55, c);
      [1.1, 5.3].forEach((l) => a.wheel(l, W - 0.2, 0.4));
    });
  }

  const TYPES = {
    'cab-high': (c) => cabover(c, { roof: 3.95, spoiler: true }),
    'cab-mid': (c) => cabover(c, { roof: 3.6 }),
    'cab-low': (c) => cabover(c, { roof: 3.2, cabL: 2.0 }),
    'cab-flat': (c) => cabover(c, { roof: 3.75, axles: [4.6, 5.9], len: 6.8 }),
    'cab-electric': (c) => cabover(c, { roof: 3.8, electric: true, spoiler: true }),
    'cab-6x4': (c) => cabover(c, { roof: 3.6, axles: [4.5, 5.85], len: 6.7 }),
    rigid: (c) => cabover(c, { roof: 3.1, cabL: 2.0, body: 3.75, axles: [5.6], len: 7.6 }),
    'us-long': (c) => conventional(c, { hood: 2.5, sleeper: 3.9 }),
    'us-aero': (c) => conventional(c, { hood: 2.2, sleeper: 4.0, aero: true }),
    'us-heavy': (c) => conventional(c, { hood: 2.4, sleeper: 3.5, axles: [6.4, 7.6] }),
    coach: (c) => bus(c, { len: 12.5, height: 3.6, coach: true, doorFront: true, axles: [2.6, 9.4, 10.7] }),
    citybus: (c) => bus(c, { len: 12, height: 3.15, doors: [0.25, 5.4, 9.6], axles: [2.6, 8.4] }),
    double: (c) => bus(c, { len: 11, height: 4.3, double: true, doors: [0.25, 5.0], axles: [2.5, 8.0] }),
    artic: (c) => bus(c, { len: 18, height: 3.15, doors: [0.25, 5.2, 10.4, 15.6], joint: 11.6, axles: [2.6, 8.4, 16.2] }),
    minibus: (c) => minibus(c),
  };
  // tipo de dibujo para las ilustraciones antiguas
  const LEGACY = { t4x2: 'cab-mid', t4x2long: 'cab-high', t6x2: 'cab-flat', t6x4: 'us-long', t8x4: 'us-heavy', urban: 'rigid' };

  window.CUTOUT_TYPES = Object.keys(TYPES);
  window.vehicleCutout = (type, color = '#F4F6F9') => {
    const t = TYPES[type] || TYPES[LEGACY[type]];
    return t ? t(color) : null;
  };
})();
