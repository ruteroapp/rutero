/* Rutero — interfaz principal */
const K = window.rutero;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const S = {
  page: 'dash', data: null, live: null, profile: null, bus: null,
  jobsFilter: 'all', rank: { scope: 'drivers', metric: 'km', period: 'week' },
  tmpTab: 'servers', companyTab: 'overview', company: null, lastJobKey: null,
};

// ------------------------------------------------------------------ formato
const LOC = () => (window.RI18N ? RI18N.locale() : 'es-ES');
const nf = (n, d = 0) => Number(n || 0).toLocaleString(LOC(), { maximumFractionDigits: d, minimumFractionDigits: d });
const gameOf = () => (S.live && S.live.game) || 'ets2';
const cur = (g) => ((g || gameOf()) === 'ats' ? '$' : '€');
const money = (n, g) => `${n < 0 ? '−' : ''}${nf(Math.abs(n))} ${cur(g)}`;
const imperial = () => { const u = S.data && S.data.settings.units; return u === 'mph' || (u === 'auto' && gameOf() === 'ats'); };
const spd = (kmh) => Math.round(imperial() ? kmh * 0.621371 : kmh);
const spdUnit = () => (imperial() ? 'mph' : 'km/h');
const dist = (km, d = 0) => `${nf(imperial() ? km * 0.621371 : km, d)} ${imperial() ? 'mi' : 'km'}`;
const dateStr = (t) => !t || isNaN(new Date(t)) ? "—" : new Date(t).toLocaleString(LOC(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const dayStr = (t) => !t || isNaN(new Date(t)) ? "—" : new Date(t).toLocaleDateString(LOC(), { day: '2-digit', month: 'short' });
const ago = (t) => {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'ahora'; if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`; return `hace ${Math.floor(s / 86400)} d`;
};
const dur = (min) => { min = Math.max(0, Math.round(min)); const h = Math.floor(min / 60); return h ? `${h} h ${min % 60} min` : `${min} min`; };
const gameClock = (abs) => { const d = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][Math.floor(abs / 1440) % 7]; return `${d} ${String(Math.floor(abs / 60) % 24).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`; };
const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const MARKET = { cargo_market: 'Mercado de cargas', quick_job: 'Trabajo rápido', freight_market: 'Mercado de fletes', external_contracts: 'Contratos externos', external_market: 'Contratos externos', online: 'World of Trucks' };
const pct = (v) => `${Math.round((v || 0) * 100)}%`;

function toast({ title, body, kind = 'info' }) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<b>${esc(title)}</b><span class="muted">${esc(body || '')}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5200);
}
const err = (e) => toast({ title: 'Algo ha fallado', body: e.message || String(e), kind: 'warn' });
async function act(btn, fn) {
  const b = btn; const old = b && b.innerHTML;
  if (b) { b.disabled = true; b.innerHTML = 'Un momento…'; }
  try { return await fn(); } catch (e) { err(e); } finally { if (b && b.isConnected) { b.disabled = false; b.innerHTML = old; } }
}
function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  $$('[data-close]', bg).forEach((b) => b.onclick = () => bg.remove());
  if (onMount) onMount(bg, () => bg.remove());
  return bg;
}

// ------------------------------------------------------------------ fotos
// Lee el archivo como data: (las URL blob: estaban bloqueadas por la CSP y por eso no se podían subir fotos)
function chooseFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
    inp.style.display = 'none'; document.body.appendChild(inp);
    inp.onchange = () => { const f = inp.files[0]; inp.remove(); resolve(f || null); };
    inp.click();
  });
}
function fileToImage(f) {
  return new Promise((resolve, reject) => {
    if (!f) return resolve(null);
    if (!/^image\//.test(f.type)) return reject(new Error('Ese archivo no es una imagen'));
    if (f.size > 25 * 1024 * 1024) return reject(new Error('La imagen pesa demasiado (máx. 25 MB)'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('No se pudo leer la imagen'));
    fr.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('No se pudo abrir la imagen')); img.src = fr.result; };
    fr.readAsDataURL(f);
  });
}
// Encaja el JPEG por debajo de un tamaño máximo (Firestore admite ~1 MB por documento)
function exportCanvas(c, maxKB) {
  let q = 0.9, out = c.toDataURL('image/jpeg', q);
  while (out.length * 0.75 > maxKB * 1024 && q > 0.45) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
  return out;
}
// Recortador: el usuario elige qué parte se ve (arrastrar = mover, rueda o barra = zoom)
function cropImage({ w, h, round = false, title = 'Ajusta la imagen', maxKB = 300, file = null }) {
  return new Promise(async (resolve) => {
    let img;
    try { img = await fileToImage(file || await chooseFile()); } catch (e) { err(e); return resolve(null); }
    if (!img) return resolve(null);
    const VW = Math.round(Math.min(640, window.innerWidth * 0.8, window.innerHeight * 0.55 * w / h)), VH = VW * h / w;
    const base = Math.max(VW / img.width, VH / img.height); // escala mínima que cubre el marco
    let zoom = 1, x = 0, y = 0, done = false;
    const clamp = () => {
      const s = base * zoom, iw = img.width * s, ih = img.height * s;
      x = Math.min(0, Math.max(VW - iw, x)); y = Math.min(0, Math.max(VH - ih, y));
    };
    const center = () => { const s = base * zoom; x = (VW - img.width * s) / 2; y = (VH - img.height * s) / 2; };
    center();
    modal(`<div class="card-title"><h2>${esc(title)}</h2><button class="btn sm ghost" data-close>✕</button></div>
      <div class="muted" style="margin:-4px 0 12px">Arrastra la imagen para elegir qué parte se ve. Usa la rueda del ratón o la barra para hacer zoom.</div>
      <div class="crop-stage ${round ? 'round' : ''}" style="width:${VW}px;height:${VH}px"><canvas width="${Math.round(VW * 2)}" height="${Math.round(VH * 2)}"></canvas><div class="crop-grid"></div></div>
      <div class="row crop-tools"><span>➖</span><input type="range" id="cz" min="1" max="4" step="0.01" value="1"><span>➕</span>
        <button class="btn sm ghost" id="cr-reset">↺ Centrar</button><button class="btn sm ghost" id="cr-other">📁 Otra imagen</button></div>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="cr-ok">✔ Usar imagen</button></div>`,
    (bg, close) => {
      bg.querySelector('.modal').classList.add('wide', 'crop-modal');
      const cv = bg.querySelector('canvas'), ctx = cv.getContext('2d'), stage = bg.querySelector('.crop-stage'), zr = bg.querySelector('#cz');
      const draw = () => { clamp(); ctx.clearRect(0, 0, cv.width, cv.height); const s = base * zoom * 2; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, x * 2, y * 2, img.width * s, img.height * s); };
      const setZoom = (z, cx = VW / 2, cy = VH / 2) => {
        z = Math.min(4, Math.max(1, z)); const k = z / zoom;
        x = cx - (cx - x) * k; y = cy - (cy - y) * k; zoom = z; zr.value = z; draw();
      };
      draw();
      let drag = null;
      stage.onpointerdown = (e) => { drag = { px: e.clientX, py: e.clientY, x, y }; stage.setPointerCapture(e.pointerId); stage.classList.add('drag'); };
      stage.onpointermove = (e) => { if (!drag) return; x = drag.x + e.clientX - drag.px; y = drag.y + e.clientY - drag.py; draw(); };
      stage.onpointerup = stage.onpointercancel = () => { drag = null; stage.classList.remove('drag'); };
      stage.onwheel = (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top); };
      zr.oninput = () => setZoom(Number(zr.value));
      bg.querySelector('#cr-reset').onclick = () => { zoom = 1; zr.value = 1; center(); draw(); };
      bg.querySelector('#cr-other').onclick = async () => {
        const f = await chooseFile(); if (!f) return;
        done = true; close(); resolve(await cropImage({ w, h, round, title, maxKB, file: f }));
      };
      bg.querySelector('#cr-ok').onclick = () => {
        const out = document.createElement('canvas'); out.width = w; out.height = h;
        const k = w / VW, s = base * zoom * k, o = out.getContext('2d');
        o.imageSmoothingQuality = 'high'; o.fillStyle = '#111'; o.fillRect(0, 0, w, h);
        o.drawImage(img, x * k, y * k, img.width * s, img.height * s);
        done = true; close(); resolve(exportCanvas(out, maxKB));
      };
      new MutationObserver((_, ob) => { if (!bg.isConnected) { ob.disconnect(); if (!done) resolve(null); } }).observe(document.body, { childList: true });
    });
  });
}
const pickImage = (size = 256, title = 'Ajusta tu foto') => cropImage({ w: size, h: size, title, maxKB: 90 });
const pickLogo = () => cropImage({ w: 256, h: 256, title: 'Ajusta el logo de la empresa', maxKB: 90 });
// banner panorámico 4:1 (ficha de la empresa, apartado de buses…)
const pickBanner = (w = 1200, h = 300, title = 'Elige qué parte del banner se ve') => cropImage({ w, h, title, maxKB: 260 });
// cabecera con banner (apartado de buses)
function bannerHero(img, title, sub, actions = '', kicker = 'Modo autobús') {
  return `<div class="bus-hero ${img ? 'has-img' : ''}" ${img ? `style="--banner:url('${esc(img)}')"` : ''}>
    <div class="bh-txt"><div class="bh-kicker">🚌 ${esc(kicker)}</div><h1>${esc(title)}</h1><div class="bh-sub">${esc(sub)}</div></div>
    ${actions ? `<div class="bh-act">${actions}</div>` : ''}</div>`;
}
const avatar = (photo, name, size = 38, bg = 'var(--panel2)', color = 'var(--text)') =>
  `<div class="avatar" style="width:${size}px;height:${size}px;background:${bg};color:${color};font-size:${Math.round(size / 2.6)}px">${photo ? `<img src="${esc(photo)}" alt="">` : esc(initials(name))}</div>`;
const FINES = {
  speeding: 'Exceso de velocidad', speeding_camera: 'Radar de velocidad', red_signal: 'Saltarse un semáforo en rojo', crash: 'Accidente',
  wrong_way: 'Circular en sentido contrario', avoid_sleeping: 'No descansar', no_lights: 'Circular sin luces', avoid_weighing: 'Evitar la báscula',
  illegal_trailer: 'Remolque no permitido', avoid_inspection: 'Evitar una inspección', illegal_border_crossing: 'Cruce ilegal de frontera',
  hard_shoulder_violation: 'Circular por el arcén', damaged_vehicle_usage: 'Vehículo dañado', generic: 'Infracción',
};
const fineName = (k) => FINES[k] || (k ? k.replace(/_/g, ' ') : 'Infracción');

// ------------------------------------------------------------------ navegación
const NAV = [
  ['dash', 'Panel', 'dash'], ['jobs', 'Trabajos', 'jobs'], ['fines', 'Multas', 'fine'], ['stats', 'Estadísticas', 'stats'], ['bus', 'Autobús', 'bus'],
  '—Comunidad', ['company', 'Mi empresa', 'company'], ['wallet', 'Cartera', 'wallet'], ['ranking', 'Ranking', 'ranking'], ['achievements', 'Logros y nivel', 'trophy'], ['tmp', 'TruckersMP', 'globe'],
  '—', ['settings', 'Ajustes', 'settings'],
];
function renderSide() {
  const p = S.profile;
  const name = (p && ((p.online && p.online.name) || p.local.name)) || 'Conductor';
  const prog = p ? Math.min(1, (p.xp - p.xpThis) / Math.max(1, p.xpNext - p.xpThis)) : 0;
  $('#side').innerHTML = NAV.map((n) => {
    if (typeof n === 'string') return n.length > 1 ? `<div class="sep"></div><div class="label">${n.slice(1)}</div>` : '<div class="sep"></div>';
    const label = n[0] === 'bus' && S.data && S.data.busName ? `<span translate="no">${esc(S.data.busName)}</span>` : n[1];
    return `<button class="nav ${S.page === n[0] ? 'active' : ''}" data-page="${n[0]}">${ICONS[n[2]]}${label}${n[0] === 'bus' && S.data && !S.data.busUnlocked ? '<span class="nav-lock">🔒</span>' : ''}</button>`;
  }).join('') + `
    <div class="me-card">
      <div class="row" style="gap:10px">
        <div id="side-photo" title="Cambiar foto" style="cursor:pointer">${avatar(p && p.photo, name, 40, 'linear-gradient(135deg,var(--accent),var(--accent2))', '#fff')}</div>
        <div style="min-width:0"><div class="name">${esc(name)}</div>
        <div class="sub">Nivel ${p ? p.level : 1} · ${esc(p ? p.rank : 'Novato')}</div></div>
      </div>
      <div class="xpbar"><i style="width:${prog * 100}%"></i></div>
      <div class="row between" style="margin-top:10px"><span class="muted" style="font-size:12px">Cartera</span><b class="mono">${p ? money(p.wallet) : '—'}</b></div>
      ${p && p.online && p.online.companyName ? `<div class="row between" style="margin-top:4px"><span class="muted" style="font-size:12px">Empresa</span><span class="tag">${esc(p.online.companyTag || p.online.companyName)}</span></div>` : ''}
    </div>`;
  $$('[data-page]').forEach((b) => b.onclick = () => go(b.dataset.page));
  $('#side-photo').onclick = changePhoto;
}
async function changePhoto() {
  try {
    const img = await pickImage(); if (!img) return;
    S.profile = await K.call('profile:photo', img); renderSide();
    toast({ title: 'Foto actualizada', body: '', kind: 'money' });
    if (['settings', 'company'].includes(S.page)) render();
  } catch (e) { err(e); }
}
function go(page) { S.page = page; renderSide(); render(); $('#main').scrollTop = 0; }
async function refreshState() { S.data = await K.call('state'); S.profile = S.data.profile; S.bus = S.data.bus; }
async function render() {
  const fn = PAGES[S.page];
  const main = $('#main');
  // animación de entrada solo al cambiar de página (o de sección de la empresa), no al refrescar
  const view = S.page + (S.page === 'company' ? '|' + (S.companyTab || '') : '');
  const enter = view !== S.lastView; S.lastView = view;
  const sk = enter ? setTimeout(() => { if (S.page === fn.id) main.innerHTML = '<div class="skel"><i style="height:46px;width:40%"></i><i style="height:120px"></i><i style="height:220px"></i></div>'; }, 180) : null;
  try {
    const html = await fn.html();
    clearTimeout(sk);
    if (S.page !== fn.id) return;
    main.classList.remove('flush');
    main.innerHTML = html;
    if (enter) {
      main.classList.remove('enter'); void main.offsetWidth;
      $$('.card, .company-hero, .model-card, .brand-tile', main).forEach((el, i) => el.style.setProperty('--i', i));
      main.classList.add('enter'); clearTimeout(S.enterT); S.enterT = setTimeout(() => main.classList.remove('enter'), 1500);
    }
    if (fn.mount) fn.mount(main);
  } catch (e) { clearTimeout(sk); main.innerHTML = `<div class="empty"><div class="big">⚠️</div>${esc(e.message)}</div>`; }
}
// onda al pulsar un botón
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .loan-opt'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(); const d = Math.max(r.width, r.height);
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(s); setTimeout(() => s.remove(), 650);
});

// ------------------------------------------------------------------ PANEL EN VIVO
const STATUS = {
  waiting: ['🕹️', 'Esperando a Euro Truck Simulator 2 o American Truck Simulator', 'Abre el juego. Si ya está abierto, instala el plugin de telemetría en Ajustes.'],
  menu: ['⏸️', 'El juego está en el menú', 'Carga tu perfil y empieza a conducir.'],
  paused: ['⏸️', 'Juego en pausa', ''],
  'plugin-version': ['⚠️', 'Versión del plugin distinta', 'Reinstala el plugin desde Ajustes para que los datos sean correctos.'],
};
function arcPath() {
  const cx = 140, cy = 140, r = 112, a0 = 150, a1 = 390;
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0); const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
}
// resumen de los últimos 7 días comparado con la semana anterior
function weekStrip(d) {
  const now = Date.now(), W = 7 * 864e5;
  const pick = (a, b) => (d.jobs || []).filter((j) => j.status !== 'cancelled' && j.finishedAt > now - a && j.finishedAt <= now - b);
  const thisW = pick(W, 0), prev = pick(2 * W, W);
  const sum = (l, f) => l.reduce((t, j) => t + (Number(f(j)) || 0), 0);
  const avg = (l) => l.length ? Math.round(sum(l, (j) => j.score) / l.length) : 0;
  const cell = (k, v, a, b, f) => { const dv = b ? Math.round((a - b) / b * 100) : null;
    return `<div class="wk"><span class="k">${k}</span><b class="mono">${f(v)}</b>${dv === null ? '<i class="muted">—</i>' : `<i class="${dv >= 0 ? 'pos' : 'neg'}">${dv >= 0 ? '▲' : '▼'} ${Math.abs(dv)}%</i>`}</div>`; };
  const km = sum(thisW, (j) => j.km), kmP = sum(prev, (j) => j.km), earn = sum(thisW, (j) => j.net ?? j.revenue), earnP = sum(prev, (j) => j.net ?? j.revenue);
  const days = [...Array(7)].map((_, i) => { const end = now - (6 - i) * 864e5; return sum(d.jobs.filter((j) => j.status !== 'cancelled' && j.finishedAt > end - 864e5 && j.finishedAt <= end), (j) => j.km); });
  const mx = Math.max(1, ...days);
  return `<div class="week-strip"><div class="wk-title"><b>Tu semana</b><span class="muted">últimos 7 días</span>
    <div class="spark">${days.map((v, i) => `<i style="height:${Math.max(6, v / mx * 100)}%;animation-delay:${i * 60}ms" class="${v ? 'on' : ''}" title="${dist(v)}"></i>`).join('')}</div></div>
    ${cell('Viajes', thisW.length, thisW.length, prev.length, (v) => v)}${cell('Distancia', km, km, kmP, (v) => dist(v))}${cell('Ganado', earn, earn, earnP, (v) => money(v))}${cell('Puntuación media', avg(thisW), avg(thisW), avg(prev), (v) => v || '—')}</div>`;
}
// cabecera del panel: saludo, nivel y accesos rápidos
function dashHero() {
  const p = S.profile || {}; const on = p.online || {};
  const name = on.name || (p.local && p.local.name) || 'Conductor';
  const h = new Date().getHours();
  const hi = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const prog = Math.min(1, ((p.xp || 0) - (p.xpThis || 0)) / Math.max(1, (p.xpNext || 1) - (p.xpThis || 0)));
  return `<div class="dash-hero"><div class="dh-left">${avatar(p.photo, name, 58, 'linear-gradient(135deg,var(--accent),var(--accent2))', '#fff')}
      <div><div class="dh-hi">${hi}</div><h1>${esc(name)}</h1>
      <div class="dh-meta"><span class="lvl">Nivel ${p.level || 1}</span><span class="muted">${esc(p.rank || 'Novato')}</span>${on.companyName ? `<span class="tag">${esc(on.companyTag || on.companyName)}</span>` : ''}<span class="muted" id="lv-sub"></span></div>
      <div class="dh-xp"><i style="width:${prog * 100}%"></i></div></div></div>
    <div class="row">${on.companyId ? '<button class="btn" id="hero-co">🏢 Mi empresa</button>' : ''}<button class="btn primary" id="ov-btn">🖥️ Overlay en el juego</button></div></div>`;
}
const SET_TABS = [['cuenta', '👤 Cuenta'], ['apariencia', '🎨 Apariencia'], ['juego', '🎮 Juego'], ['overlay', '🖥️ Overlay'], ['sonido', '🔊 Sonido'], ['comunidad', '💬 Comunidad'], ['app', '⬆️ Actualizaciones']];
const PAGE_DASH = {
  id: 'dash',
  async html() {
    const d = S.data; const daily = d.daily;
    if (S.pluginOk === undefined) { try { const g = await K.call('plugin:status'); S.pluginOk = Object.values(g || {}).some((x) => x && x.installed); } catch { S.pluginOk = false; } }
    return `
    ${dashHero()}
    <div id="lv-banner"></div>
    ${weekStrip(d)}
    <div class="dash">
      <div class="card gauge-wrap" id="lv-gaugecard">
        <div class="gauge">
          <svg viewBox="0 0 280 230">
            <path d="${arcPath()}" style="stroke:var(--track)" stroke-width="16" fill="none" stroke-linecap="round" pathLength="100"/>
            <path id="lv-arc" d="${arcPath()}" stroke="url(#gArc)" stroke-width="16" fill="none" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
            <path id="lv-rpm" d="${arcPath()}" stroke="#19C3B1" stroke-width="4" fill="none" pathLength="100" stroke-dasharray="0 100" transform="translate(140 140) scale(.82) translate(-140 -140)" opacity=".8"/>
            <defs><linearGradient id="gArc" x1="0" x2="1"><stop offset="0" stop-color="#19C3B1"/><stop offset=".6" stop-color="#FF9F1C"/><stop offset="1" stop-color="#FF5A5F"/></linearGradient></defs>
          </svg>
          <div class="center"><div class="speed mono" id="lv-speed">0</div><div class="unit" id="lv-unit">${spdUnit()}</div></div>
        </div>
        <div class="row" style="gap:18px;margin-top:-6px">
          <div class="gear" id="lv-gear">N</div>
          <div class="limit-sign" id="lv-limit">—</div>
          <div class="stat" style="align-items:center"><span class="v mono" id="lv-cruise" style="font-size:22px">—</span><span class="k">Crucero</span></div>
        </div>
        <div class="indicators">
          <span class="ind" id="in-l">◀</span><span class="ind" id="in-low">Cortas</span><span class="ind" id="in-high">Largas</span>
          <span class="ind" id="in-park">Freno mano</span><span class="ind" id="in-r">▶</span>
        </div>
        <div style="width:100%;margin-top:18px" class="grid">
          <div><div class="row between"><span class="muted">Combustible</span><b class="mono" id="lv-fuel">—</b></div><div class="bar amber" style="margin-top:6px"><i id="lv-fuelbar" style="width:0"></i></div></div>
          <div><div class="row between"><span class="muted">AdBlue</span><b class="mono" id="lv-adblue">—</b></div></div>
          <div class="row between"><span class="muted">Hora en el juego</span><b class="mono" id="lv-clock">—</b></div>
          <div class="row between"><span class="muted">Descanso en</span><b class="mono" id="lv-rest">—</b></div>
        </div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card" id="lv-job"></div>
        <div class="grid g4">
          <div class="card stat"><span class="k">Sesión</span><span class="v mono" id="lv-sess">0</span></div>
          <div class="card stat"><span class="k">Velocidad máx.</span><span class="v mono" id="lv-max">0</span></div>
          <div class="card stat"><span class="k">Consumo medio</span><span class="v mono" id="lv-cons">—</span></div>
          <div class="card stat"><span class="k">Camión</span><span class="v" id="lv-truck" style="font-size:18px">—</span></div>
        </div>
        <div class="card"><div class="card-title"><h2>Desgaste</h2><span class="muted" id="lv-plate"></span></div>
          <div class="grid g4" id="lv-wear"><div class="muted" style="grid-column:1/-1">Arranca el juego para ver el estado del camión.</div></div></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><div class="card-title"><h2>Retos de hoy</h2><span class="muted">Se renuevan a medianoche</span></div>
        ${daily.list.map((c) => {
          const prog = Math.min(c.goal, daily.progress[c.id] || 0); const done = daily.claimed && daily.claimed[c.id];
          return `<div class="challenge ${done ? 'done' : ''}"><div class="chk">${done ? '✓' : ''}</div><div class="t"><div>${esc(c.text)}</div>
          <div class="bar" style="margin-top:6px"><i style="width:${(prog / c.goal) * 100}%"></i></div></div><span class="pill ${done ? 'ok' : ''}">${done ? '✓' : `${nf(prog)} / ${nf(c.goal)}`}</span></div>`;
        }).join('')}</div>
      <div class="card"><div class="card-title"><h2>Últimos viajes</h2><button class="btn sm ghost" data-goto="jobs">Ver todos</button></div>
        ${tripList(d.jobs.slice(0, 5))}</div>
    </div>`;
  },
  mount(root) {
    $('#ov-btn').onclick = () => K.call('overlay');
    const hc = $('#hero-co'); if (hc) hc.onclick = () => go('company');
    $$('[data-goto]', root).forEach((b) => b.onclick = () => go(b.dataset.goto));
    bindTrips(root);
    S.lastJobKey = undefined;
    updateLive();
  },
};
function tripList(list) {
  if (!list.length) return '<div class="empty"><div class="big">🛣️</div>Todavía no hay viajes. ¡Coge una carga!</div>';
  return list.map((j, i) => `<div class="list-item click" data-trip="${i}" style="cursor:pointer">
    <div class="avatar">${j.type === 'bus' ? '🚌' : j.status === 'cancelled' ? '✖' : '📦'}</div>
    <div style="flex:1;min-width:0"><div style="font-weight:600">${esc(j.cargo || j.line || 'Carga')}</div>
    <div class="muted" style="font-size:12px">${esc(j.from || '?')} → ${esc(j.to || '?')} · ${dist(j.km || 0)} · ${ago(j.finishedAt)}</div></div>
    <div style="text-align:right"><b class="mono ${j.net >= 0 ? 'pos' : 'neg'}">${money(j.net ?? j.revenue, j.game)}</b><div class="muted" style="font-size:12px">${j.score ?? '—'} pts</div></div></div>`).join('');
}
function bindTrips(root, list) {
  const src = list || S.data.jobs;
  $$('[data-trip]', root).forEach((el) => el.onclick = () => tripModal(src[+el.dataset.trip]));
}
function speedChart(samples) {
  if (!samples || samples.length < 2) return '<div class="muted" style="padding:20px 0">No hay suficientes datos de velocidad para este viaje.</div>';
  const W = 640, H = 170, P = 26;
  const maxT = samples[samples.length - 1][0] || 1;
  const maxS = Math.max(40, ...samples.map((x) => Math.max(x[1], x[2] || 0))) * 1.1;
  const X = (t) => P + (t / maxT) * (W - P * 2), Y = (v) => H - P - (v / maxS) * (H - P * 2);
  const line = (idx) => samples.filter((x) => idx === 1 || x[2] > 0).map((x, i) => `${i ? 'L' : 'M'}${X(x[0]).toFixed(1)} ${Y(x[idx]).toFixed(1)}`).join(' ');
  const area = `M${X(samples[0][0])} ${H - P} ` + samples.map((x) => `L${X(x[0]).toFixed(1)} ${Y(x[1]).toFixed(1)}`).join(' ') + ` L${X(maxT)} ${H - P} Z`;
  const ticks = [0, .5, 1].map((f) => Math.round(maxS * f / 1.1 / 10) * 10);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="none">
    <defs><linearGradient id="sa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C8DFF" stop-opacity=".45"/><stop offset="1" stop-color="#4C8DFF" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map((v) => `<line x1="${P}" x2="${W - P}" y1="${Y(v)}" y2="${Y(v)}" stroke="#252F4A"/><text x="2" y="${Y(v) + 4}" fill="#5B6579" font-size="10">${spd(v)}</text>`).join('')}
    <path d="${area}" fill="url(#sa)"/><path d="${line(1)}" fill="none" stroke="#4C8DFF" stroke-width="2"/>
    <path d="${line(2)}" fill="none" stroke="#FF5A5F" stroke-width="1.5" stroke-dasharray="5 4"/>
    <text x="${W - P}" y="${H - 6}" fill="#5B6579" font-size="10" text-anchor="end">${dur(maxT / 60)}</text></svg>
    <div class="row muted" style="font-size:12px;gap:16px"><span><b style="color:#4C8DFF">━</b> Tu velocidad</span><span><b style="color:#FF5A5F">┅</b> Límite</span></div>`;
}
function tripModal(j) {
  if (!j) return;
  const samples = typeof j.samples === 'string' ? j.samples.split(';').filter(Boolean).map((x) => x.split(',').map(Number)) : j.samples;
  const kv = (k, v, cls = '') => `<div><div class="k">${k}</div><div class="v mono ${cls}">${v}</div></div>`;
  const expenses = j.expenses || [];
  modal(`<div class="row between"><div><h2 style="margin:0">${j.type === 'bus' ? '🚌 ' : '📦 '}${esc(j.cargo || j.line || 'Viaje')}</h2>
      <div class="muted">${esc(j.from || '?')}${j.fromCompany ? ' · ' + esc(j.fromCompany) : ''} → ${esc(j.to || '?')}${j.toCompany ? ' · ' + esc(j.toCompany) : ''}</div></div>
      <div class="row">${j.status === 'delivered' ? '<span class="pill ok"><span class="dot"></span>Entregada</span>' : '<span class="pill bad"><span class="dot"></span>Cancelada</span>'}${j.multiplayer ? `<span class="pill mp">${esc(j.mp || 'TruckersMP')}</span>` : ''}<button class="btn sm ghost" data-close>Cerrar</button></div></div>
    <div class="kv" style="margin-top:16px">
      ${kv('Distancia', dist(j.km || 0, 1))}${kv('Duración', j.durationMin ? dur(j.durationMin) : '—')}${kv('Vel. media', j.avgSpeed ? `${spd(j.avgSpeed)} ${spdUnit()}` : '—')}${kv('Vel. máxima', `${spd(j.maxSpeed || 0)} ${spdUnit()}`)}
      ${kv('Puntuación', `${j.score ?? '—'}/100`, j.score >= 90 ? 'pos' : j.score < 70 ? 'neg' : '')}${kv('Daño carga', pct(j.damage), (j.damage || 0) > .05 ? 'neg' : '')}${kv('Combustible', j.fuelUsed ? `${nf(j.fuelUsed)} L` : '—')}${kv('Exceso velocidad', `${Math.round(j.speedingSec || 0)} s`, (j.speedingSec || 0) > 60 ? 'neg' : '')}
    </div>
    <h3 style="margin-top:18px">Velocidad durante el viaje</h3>${speedChart(samples)}
    <div class="grid g2" style="margin-top:14px">
      <div class="card flat"><h3>Dinero</h3>
        ${j.type === 'bus' && j.tickets !== undefined ? `
        <div class="row between"><span class="muted">Billetes</span><b class="mono">${money(j.tickets, j.game)}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">Pago por km</span><b class="mono">${money(j.kmPay || 0, j.game)}</b></div>
        ${j.tips ? `<div class="row between" style="margin-top:6px"><span class="muted">Propinas</span><b class="mono pos">${money(j.tips, j.game)}</b></div>` : ''}
        ${j.punctualPay ? `<div class="row between" style="margin-top:6px"><span class="muted">Extra por puntualidad</span><b class="mono pos">${money(j.punctualPay, j.game)}</b></div>` : ''}
        ${j.routeBonus ? `<div class="row between" style="margin-top:6px"><span class="muted">Pago extra de la ruta</span><b class="mono pos">${money(j.routeBonus, j.game)}</b></div>` : ''}
        ${j.costs ? `<div class="row between" style="margin-top:6px"><span class="muted">Combustible y desgaste del bus</span><b class="mono neg">${money(-j.costs, j.game)}</b></div>` : ''}
        <div class="row between" style="margin-top:6px"><span class="muted">Pago de la ruta</span><b class="mono">${money(j.revenue || 0, j.game)}</b></div>`
        : `<div class="row between"><span class="muted">Pago del trabajo</span><b class="mono">${money(j.gameRevenue || j.revenue || 0, j.game)}</b></div>`}
        ${j.share ? `<div class="row between" style="margin-top:6px"><span class="muted">Tu parte (economía realista) · ${Math.round(j.share * 100)}%</span><b class="mono neg">${money(-((j.gameRevenue || 0) - Math.round((j.gameRevenue || 0) * j.share)), j.game)}</b></div>` : ''}
        ${j.busBoost ? `<div class="row between" style="margin-top:6px"><span class="muted">Servicio de autobuses de la empresa (×1,5)</span><b class="mono pos">${money(j.busBoost, j.game)}</b></div>` : ''}
        ${j.foreignFee ? `<div class="row between" style="margin-top:6px"><span class="muted">Vehículo que no es de la empresa · ${j.foreignPct || (j.type === 'bus' ? 15 : 5)}%</span><b class="mono neg">${money(-j.foreignFee, j.game)}</b></div>` : ''}
        <div class="row between" style="margin-top:6px"><span class="muted">Comisión empresa</span><b class="mono neg">${money(-(j.companyCut || 0), j.game)}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">Sueldo de la empresa</span><b class="mono pos">${money(j.salary || 0, j.game)}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">Multas y peajes</span><b class="mono neg">${money(-((j.fines || 0) + (j.tolls || 0)), j.game)}</b></div>
        <div class="row between" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)"><span>Neto para ti</span><b class="mono pos" style="font-size:18px">${money((j.net ?? j.revenue) + (j.salary || 0), j.game)}</b></div></div>
      <div class="card flat"><h3>Detalles</h3>
        <div class="row between"><span class="muted">Camión</span><b>${esc(j.truck || '—')}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">Peso</span><b>${j.cargoMass ? nf(j.cargoMass / 1000, 1) + ' t' : '—'}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">Con crucero</span><b>${j.cruiseSec ? dur(j.cruiseSec / 60) : '—'}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">XP ganada</span><b>${nf(j.xpGained || j.xp || 0)}</b></div>
        <div class="row between" style="margin-top:6px"><span class="muted">Autoaparcado</span><b>${j.autopark ? 'Sí' : 'No'}</b></div>
        ${j.type === 'bus' ? `<div class="row between" style="margin-top:6px"><span class="muted">Paradas / pasajeros</span><b>${j.stops} / ${j.passengers}</b></div>` : ''}
        ${j.type === 'bus' && j.satisfaction !== undefined ? `<div class="row between" style="margin-top:6px"><span class="muted">Satisfacción</span><b>${starsTxt(j.stars)} ${j.satisfaction}%</b></div>
        ${j.timed ? `<div class="row between" style="margin-top:6px"><span class="muted">Paradas a su hora</span><b>${j.punctual} / ${j.timed}</b></div>` : ''}
        ${j.satEv && (j.satEv.brake || j.satEv.turn) ? `<div class="row between" style="margin-top:6px"><span class="muted">Frenazos / curvas bruscas</span><b>${j.satEv.brake || 0} / ${j.satEv.turn || 0}</b></div>` : ''}` : ''}
        <div class="row between" style="margin-top:6px"><span class="muted">Fecha</span><b>${dateStr(j.finishedAt)}</b></div></div>
    </div>
    <h3 style="margin-top:16px">Multas y gastos del viaje</h3>
    ${expenses.length ? expenses.map((x) => `<div class="list-item"><div class="avatar">${{ fine: '🚨', toll: '🛂', ferry: '⛴️', train: '🚆' }[x.kind] || '•'}</div>
      <div style="flex:1">${x.kind === 'fine' ? esc(fineName(x.detail)) : esc({ toll: 'Peaje', ferry: 'Ferry', train: 'Tren' }[x.kind])}${x.kind !== 'fine' && x.detail ? ' · ' + esc(x.detail) : ''}
      <div class="muted" style="font-size:12px">${dateStr(x.at)}${x.kind === 'fine' && x.limit ? ` · ${spd(x.speed)} en zona de ${spd(x.limit)} ${spdUnit()}` : ''}</div></div><b class="mono neg">${money(-(x.amount || 0), j.game)}</b></div>`).join('')
      : `<div class="muted">${j.fineCount ? `${j.fineCount} multa(s) · ${money(-(j.fines || 0), j.game)}` : 'Sin multas ni gastos. ¡Buen viaje! 👏'}</div>`}`).querySelector('.modal').style.width = 'min(760px, 94vw)';
}

function updateLive() {
  if (S.page !== 'dash' || !$('#lv-speed')) return;
  const t = S.live;
  const banner = $('#lv-banner');
  const st = t ? t.status : S.data.status;
  // con el plugin ya instalado no hace falta el aviso de «esperando al juego»
  if (st !== 'driving' && STATUS[st] && !(st === 'waiting' && S.pluginOk)) {
    const [ic, a, b] = STATUS[st];
    banner.innerHTML = `<div class="status-banner"><span class="ic">${ic}</span><div><b>${a}</b><div class="muted">${b}</div></div>${st === 'waiting' ? '<button class="btn sm" style="margin-left:auto" id="go-plugin">Instalar plugin</button>' : ''}</div>`;
    const gp = $('#go-plugin'); if (gp) gp.onclick = () => go('settings');
  } else banner.innerHTML = '';
  const gc = $('#lv-gaugecard'); if (gc) gc.classList.toggle('driving', st === 'driving');
  if (!t || !t.sdkActive) { renderJob(null); return; }

  const speed = spd(Math.abs(t.speedKmh));
  $('#lv-speed').textContent = speed;
  $('#lv-unit').textContent = spdUnit();
  const max = imperial() ? 90 : 140;
  $('#lv-arc').setAttribute('stroke-dasharray', `${Math.min(100, (speed / max) * 100)} 100`);
  $('#lv-rpm').setAttribute('stroke-dasharray', `${Math.min(100, (t.rpm / (t.rpmMax || 2500)) * 100)} 100`);
  $('#lv-gear').textContent = t.gear > 0 ? t.gear : t.gear < 0 ? `R${Math.abs(t.gear)}` : 'N';
  const lim = $('#lv-limit');
  if (t.limitKmh > 1) { lim.textContent = spd(t.limitKmh); lim.classList.toggle('over', t.speedKmh > t.limitKmh + 5); lim.style.opacity = 1; }
  else { lim.textContent = '—'; lim.classList.remove('over'); lim.style.opacity = .4; }
  $('#lv-cruise').textContent = t.cruiseOn ? spd(t.cruiseKmh) : 'OFF';
  const on = (id, v, cls = '') => { const el = $(id); el.className = `ind ${v ? 'on ' + cls : ''}`; };
  on('#in-l', t.blinkL, 'amber'); on('#in-r', t.blinkR, 'amber'); on('#in-low', t.lowBeam); on('#in-high', t.highBeam); on('#in-park', t.parkBrake, 'red');
  $('#lv-fuel').textContent = `${nf(t.fuel)} / ${nf(t.fuelCapacity)} L · ${dist(t.fuelRange)}`;
  $('#lv-fuelbar').style.width = `${t.fuelCapacity ? (t.fuel / t.fuelCapacity) * 100 : 0}%`;
  $('#lv-adblue').textContent = `${nf(t.adblue, 1)} L`;
  $('#lv-clock').textContent = gameClock(t.timeAbs);
  $('#lv-rest').textContent = t.restStop > 0 ? dur(t.restStop) : '—';
  $('#lv-sess').innerHTML = `${nf(imperial() ? t.session.km * 0.621 : t.session.km, 1)}<small>${imperial() ? 'mi' : 'km'}</small>`;
  $('#lv-max').innerHTML = `${spd(t.session.maxSpeed)}<small>${spdUnit()}</small>`;
  $('#lv-cons').innerHTML = t.fuelAvg ? `${nf(t.fuelAvg * 100, 1)}<small>L/100</small>` : '—';
  $('#lv-truck').textContent = `${t.truck.brand} ${t.truck.name}`.trim() || '—';
  $('#lv-plate').textContent = t.truck.plate || '';
  $('#lv-sub').textContent = `${t.game.toUpperCase()} ${t.gameVersion}${t.tmp ? ' · ' + (t.mpName || 'TruckersMP') : ''}`;
  const w = t.wear;
  $('#lv-wear').innerHTML = [['Motor', w.engine], ['Transmisión', w.transmission], ['Cabina', w.cabin], ['Chasis', w.chassis], ['Ruedas', w.wheels]].slice(0, 4).map(([k, v]) =>
    `<div><div class="row between"><span class="muted">${k}</span><b class="mono">${pct(v)}</b></div><div class="bar ${v > .25 ? 'red' : v > .1 ? 'amber' : ''}" style="margin-top:6px"><i style="width:${Math.max(2, v * 100)}%"></i></div></div>`).join('');
  renderJob(t);
}
function renderJob(t) {
  const box = $('#lv-job'); if (!box) return;
  const j = t && t.job;
  const key = j ? `${j.cargo}|${j.from}|${j.to}` : '';
  if (key !== S.lastJobKey) {
    S.lastJobKey = key;
    box.innerHTML = !j ? `<div class="card-title"><h2>Trabajo actual</h2></div>
      <div class="empty" style="padding:24px"><div class="big">🅿️</div>Sin carga ahora mismo. Acepta un trabajo y Rutero lo registrará solo.</div>`
      : `<div class="card-title"><h2>Trabajo actual</h2><div class="row">${j.special ? '<span class="pill warn">Especial</span>' : ''}${j.multiplayer || t.tmp ? `<span class="pill mp">${t.mpName || 'TruckersMP'}</span>` : ''}<span class="pill">${esc(MARKET[j.market] || j.market || 'Trabajo')}</span></div></div>
      <div class="job-cargo">📦 ${esc(j.cargo)} · ${nf((j.cargoMass || 0) / 1000, 1)} t</div>
      <div class="route"><div><div class="city">${esc(j.from)}</div><div class="comp">${esc(j.fromCompany)}</div></div><div class="arrow">━━▶</div>
        <div style="text-align:right"><div class="city">${esc(j.to)}</div><div class="comp">${esc(j.toCompany)}</div></div></div>
      <div class="kv"><div><div class="k">Restante</div><div class="v mono" id="jb-rem">—</div></div><div><div class="k">Llegada</div><div class="v mono" id="jb-eta">—</div></div>
        <div><div class="k">Pago</div><div class="v mono">${money(j.income, t.game)}</div></div><div><div class="k">Daño</div><div class="v mono" id="jb-dmg">0%</div></div></div>
      <div class="row between" style="margin-top:16px"><div class="muted">Puntuación de conducción (velocidad, daños, multas)</div><b class="mono" id="jb-score" style="font-size:20px">100</b></div>
      <div class="bar" style="margin-top:6px"><i id="jb-scorebar" style="width:100%"></i></div>`;
  }
  if (j && $('#jb-rem')) {
    $('#jb-rem').textContent = dist(t.routeKm);
    $('#jb-eta').textContent = t.routeMin > 0 ? dur(t.routeMin) : '—';
    $('#jb-dmg').textContent = pct(j.damage);
    $('#jb-score').textContent = j.score;
    $('#jb-scorebar').style.width = `${j.score}%`;
    $('#jb-scorebar').style.background = j.score >= 90 ? 'var(--teal)' : j.score >= 70 ? 'var(--amber)' : 'var(--red)';
  }
}

// ------------------------------------------------------------------ TRABAJOS
const PAGE_JOBS = {
  id: 'jobs',
  async html() {
    const all = S.data.jobs;
    const f = S.jobsFilter;
    const list = all.filter((j) => f === 'all' || (f === 'cargo' && j.type !== 'bus' && j.status === 'delivered') || (f === 'bus' && j.type === 'bus') || (f === 'cancelled' && j.status === 'cancelled') || (f === 'mp' && j.multiplayer));
    S.jobsView = list;
    return `<div class="page-head"><div><h1>Trabajos</h1><div class="subtitle">Todo lo que has entregado, guardado automáticamente</div></div>
      <div class="tabs">${[['all', 'Todos'], ['cargo', 'Cargas'], ['bus', 'Autobús'], ['mp', 'TruckersMP'], ['cancelled', 'Cancelados']].map(([k, n]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="card">${!list.length ? '<div class="empty"><div class="big">📭</div>No hay viajes en esta lista</div>' : `
      <table><thead><tr><th>Fecha</th><th>Carga</th><th>Ruta</th><th class="num">Distancia</th><th class="num">Neto</th><th class="num">Daño</th><th class="num">Puntos</th></tr></thead>
      <tbody>${list.map((j, i) => `<tr class="click" data-trip="${i}"><td class="muted">${dateStr(j.finishedAt)}</td>
        <td>${j.type === 'bus' ? '🚌 ' : ''}${esc(j.cargo || j.line)} ${j.multiplayer ? '<span class="pill mp" style="padding:1px 7px">MP</span>' : ''}${j.status === 'cancelled' ? ' <span class="pill bad">Cancelado</span>' : ''}</td>
        <td>${esc(j.from || '?')} → ${esc(j.to || '?')}</td><td class="num">${dist(j.km || 0)}</td>
        <td class="num ${(j.net ?? 0) >= 0 ? 'pos' : 'neg'}">${money(j.net ?? j.revenue, j.game)}</td><td class="num">${pct(j.damage)}</td><td class="num">${j.score ?? '—'}</td></tr>`).join('')}</tbody></table>`}</div>`;
  },
  mount(root) {
    $$('[data-f]', root).forEach((b) => b.onclick = () => { S.jobsFilter = b.dataset.f; render(); });
    bindTrips(root, S.jobsView);
  },
};

// ------------------------------------------------------------------ MULTAS
const PAGE_FINES = {
  id: 'fines',
  async html() {
    const all = S.data.expenses;
    const fines = all.filter((e) => e.kind === 'fine');
    const other = all.filter((e) => e.kind !== 'fine');
    const total = fines.reduce((a, e) => a + (e.amount || 0), 0);
    const byType = Object.entries(fines.reduce((a, e) => { const k = e.detail || 'generic'; a[k] = a[k] || { n: 0, sum: 0 }; a[k].n++; a[k].sum += e.amount || 0; return a; }, {})).sort((a, b) => b[1].n - a[1].n);
    const tab = S.finesTab || 'fines';
    const list = tab === 'fines' ? fines : other;
    return `<div class="page-head"><div><h1>Multas</h1><div class="subtitle">Todas las sanciones y gastos de ruta, guardados automáticamente</div></div>
      <div class="tabs"><button data-ft="fines" class="${tab === 'fines' ? 'on' : ''}">Multas (${fines.length})</button><button data-ft="other" class="${tab === 'other' ? 'on' : ''}">Peajes, ferris y trenes (${other.length})</button></div></div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><span class="k">Multas</span><span class="v mono">${fines.length}</span></div>
      <div class="card stat"><span class="k">Total pagado</span><span class="v mono neg">${money(-total)}</span></div>
      <div class="card stat"><span class="k">Racha sin multas</span><span class="v mono">${nf(S.profile.local.cleanStreak || 0)}<small>entregas</small></span></div>
      <div class="card stat"><span class="k">Más común</span><span class="v" style="font-size:18px">${byType[0] ? esc(fineName(byType[0][0])) : '—'}</span></div>
    </div>
    <div class="grid" style="grid-template-columns:2fr 1fr">
      <div class="card">${list.length ? `<table><thead><tr><th>Fecha</th><th>${tab === 'fines' ? 'Infracción' : 'Gasto'}</th><th>Viaje</th><th class="num">Velocidad</th><th class="num">Importe</th></tr></thead><tbody>
        ${list.map((e) => `<tr><td class="muted">${dateStr(e.at)}</td><td>${e.kind === 'fine' ? '🚨 ' + esc(fineName(e.detail)) : ({ toll: '🛂 Peaje', ferry: '⛴️ Ferry', train: '🚆 Tren' }[e.kind] || e.kind) + (e.detail ? ' · ' + esc(e.detail) : '')}</td>
          <td class="muted">${esc(e.cargo || '')}${e.route ? '<br>' + esc(e.route) : ''}</td><td class="num">${e.speed ? `${spd(e.speed)}${e.limit ? ' / ' + spd(e.limit) : ''} ${spdUnit()}` : '—'}</td><td class="num neg">${money(-(e.amount || 0))}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty"><div class="big">😇</div>${tab === 'fines' ? 'Ninguna multa. ¡Conductor ejemplar!' : 'Sin gastos de ruta todavía'}</div>`}</div>
      <div class="card"><h2>Por tipo</h2>${byType.length ? byType.map(([k, v]) => `<div class="list-item"><span style="flex:1">${esc(fineName(k))}</span><span class="muted">${v.n}×</span><b class="mono neg" style="margin-left:10px">${money(-v.sum)}</b></div>`).join('') : '<div class="muted">Sin multas</div>'}
        <div class="notice" style="margin-top:14px">Las multas de los miembros también aparecen en tu empresa, en la pestaña <b>Multas</b>.</div></div>
    </div>`;
  },
  mount(root) { $$('[data-ft]', root).forEach((b) => b.onclick = () => { S.finesTab = b.dataset.ft; render(); }); },
};

// ------------------------------------------------------------------ CARTERA
function sendMoneyModal(uid, name) {
  modal(`<h2>Enviar dinero a ${esc(name)}</h2><div class="muted" style="margin-bottom:12px">Sale de tu cartera (tienes ${money(S.profile.wallet)}). Lo recibe al abrir Rutero.</div>
    <div class="grid"><label class="field"><span>Cantidad</span><input type="number" id="sm-a" min="1"></label>
    <label class="field"><span>Concepto</span><input type="text" id="sm-n" maxlength="60" placeholder="Por el convoy de ayer"></label>
    <div class="row"><button class="btn primary" id="sm-ok">Enviar</button><button class="btn ghost" data-close>Cancelar</button></div></div>`, (bg, close) => {
    const ok = $('#sm-ok', bg); ok.onclick = () => act(ok, async () => { await K.call('cloud:send', uid, name, $('#sm-a', bg).value, $('#sm-n', bg).value); close(); toast({ title: 'Dinero enviado 💸', body: `${money(+$('#sm-a', bg).value)} para ${name}`, kind: 'money' }); await refreshState(); renderSide(); if (S.page === 'wallet') render(); });
  });
}
const PAGE_WALLET = {
  id: 'wallet',
  async html() {
    const p = S.profile;
    let transfers = [];
    if (S.data.loggedIn) transfers = await K.call('cloud:transfers').catch(() => []);
    const m = p.member;
    const jobs = S.data.jobs.filter((j) => j.status === 'delivered');
    const earnedJobs = jobs.reduce((a, j) => a + (j.net || 0), 0), salaries = jobs.reduce((a, j) => a + (j.salary || 0), 0);
    const fines = S.data.expenses.reduce((a, e) => a + (e.amount || 0), 0);
    return `<div class="page-head"><div><h1>Cartera</h1><div class="subtitle">Tu dinero, tu sueldo y las transferencias</div></div></div>
    <div class="grid g3" style="margin-bottom:16px">
      <div class="card" style="background:linear-gradient(135deg,rgba(76,141,255,.25),rgba(90,61,240,.12)),var(--panel)"><div class="stat"><span class="k">Saldo disponible</span><span class="v mono" style="font-size:44px">${money(p.wallet)}</span></div></div>
      <div class="card stat"><span class="k">Mi sueldo en la empresa</span><span class="v mono" style="font-size:24px">${m && (m.salaryPerKm || m.salaryPerJob) ? `${nf(m.salaryPerKm, 2)}/km${m.salaryPerJob ? ' + ' + money(m.salaryPerJob) : ''}` : 'Sin sueldo'}</span>
        <span class="muted" style="font-size:12px">${p.online && p.online.companyName ? 'Lo fija el fundador o un gerente de ' + esc(p.online.companyName) : 'Únete a una empresa para cobrar sueldo'}</span></div>
      <div class="card stat"><span class="k">Cobrado de sueldos</span><span class="v mono pos">${money(salaries)}</span></div>
    </div>
    <div class="grid g2">
      <div class="card"><h2>Resumen</h2>
        <div class="row between"><span class="muted">Ganado con entregas (neto)</span><b class="mono pos">${money(earnedJobs)}</b></div>
        <div class="row between" style="margin-top:8px"><span class="muted">Sueldos de la empresa</span><b class="mono pos">${money(salaries)}</b></div>
        <div class="row between" style="margin-top:8px"><span class="muted">Multas, peajes y transportes</span><b class="mono neg">${money(-fines)}</b></div>
        <div class="notice" style="margin-top:16px">Para ingresar dinero en la empresa ve a <b>Mi empresa → Banco</b>. Para mandar dinero a un compañero pulsa <b>Enviar dinero</b> en la lista de miembros o en el ranking.</div></div>
      <div class="card"><h2>Transferencias</h2>${!S.data.loggedIn ? '<div class="muted">Inicia sesión para enviar y recibir dinero.</div>' : transfers.length ? transfers.map((t) => `<div class="list-item"><div class="avatar">${t.amount >= 0 ? '⬇️' : '⬆️'}</div>
        <div style="flex:1">${t.amount >= 0 ? 'De' : 'Para'} <b>${esc(t.other)}</b>${t.note ? '<div class="muted" style="font-size:12px">' + esc(t.note) + '</div>' : ''}</div>
        <div style="text-align:right"><b class="mono ${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount >= 0 ? '+' : ''}${money(t.amount)}</b><div class="muted" style="font-size:11px">${ago(t.at)}</div></div></div>`).join('') : '<div class="empty">Sin transferencias</div>'}</div>
    </div>`;
  },
};

// ------------------------------------------------------------------ ESTADÍSTICAS
function barChart(values, labels, color = '#FF9F1C', fmt = (v) => nf(v)) {
  const W = 640, H = 180, pad = 24, n = values.length, mx = Math.max(1, ...values);
  const bw = (W - pad * 2) / n;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    ${values.map((v, i) => { const h = (v / mx) * (H - 44); const x = pad + i * bw + 4; return `<rect x="${x}" y="${H - 22 - h}" width="${bw - 8}" height="${h}" rx="4" fill="${color}" opacity="${v ? 1 : .15}"><title>${labels[i]}: ${fmt(v)}</title></rect>
      <text x="${x + (bw - 8) / 2}" y="${H - 6}" fill="#5B6579" font-size="10" text-anchor="middle">${labels[i]}</text>`; }).join('')}</svg>`;
}
const PAGE_STATS = {
  id: 'stats',
  async html() {
    const jobs = S.data.jobs; const p = S.profile.local; const del = jobs.filter((j) => j.status === 'delivered');
    const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 13 + i); return d; });
    const byDay = (fn) => days.map((d) => jobs.filter((j) => { const t = new Date(j.finishedAt); return t >= d && t < new Date(d.getTime() + 86400000); }).reduce((a, j) => a + fn(j), 0));
    const kmDay = byDay((j) => j.km || 0); const moneyDay = byDay((j) => Math.max(0, j.net || 0));
    const labels = days.map((d) => d.getDate());
    const top = (fn) => Object.entries(del.reduce((a, j) => { const k = fn(j); if (k) a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const exp = S.data.expenses.reduce((a, e) => { a[e.kind] = (a[e.kind] || 0) + (e.amount || 0); return a; }, {});
    const avgScore = del.length ? Math.round(del.reduce((a, j) => a + (j.score || 0), 0) / del.length) : 0;
    const earned = del.reduce((a, j) => a + (j.net || 0), 0);
    return `<div class="page-head"><div><h1>Estadísticas</h1><div class="subtitle">Tu carrera como conductor en números</div></div></div>
    <div class="grid g4">
      <div class="card stat"><span class="k">Distancia total</span><span class="v mono">${dist(p.km)}</span></div>
      <div class="card stat"><span class="k">Entregas</span><span class="v mono">${nf(p.jobs)}<small>+ ${nf(p.busTrips)} bus</small></span></div>
      <div class="card stat"><span class="k">Ganado (neto)</span><span class="v mono">${money(earned)}</span></div>
      <div class="card stat"><span class="k">Puntuación media</span><span class="v mono">${avgScore}<small>/100</small></span></div>
      <div class="card stat"><span class="k">Entregas perfectas</span><span class="v mono">${nf(p.perfect)}</span></div>
      <div class="card stat"><span class="k">Multas</span><span class="v mono">${nf(p.fines)}</span></div>
      <div class="card stat"><span class="k">Cancelados</span><span class="v mono">${nf(p.cancelled)}</span></div>
      <div class="card stat"><span class="k">Racha sin multas</span><span class="v mono">${nf(p.cleanStreak || 0)}</span></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h2>Kilómetros · últimos 14 días</h2>${barChart(kmDay, labels, '#19C3B1', (v) => dist(v))}</div>
      <div class="card"><h2>Dinero ganado · últimos 14 días</h2>${barChart(moneyDay, labels, '#FF9F1C', (v) => money(v))}</div>
      <div class="card"><h2>Cargas favoritas</h2>${top((j) => j.cargo).map(([k, v]) => `<div class="list-item"><span style="flex:1">${esc(k)}</span><b class="mono">${v}</b></div>`).join('') || '<div class="empty">Sin datos aún</div>'}</div>
      <div class="card"><h2>Ciudades de destino</h2>${top((j) => j.to).map(([k, v]) => `<div class="list-item"><span style="flex:1">${esc(k)}</span><b class="mono">${v}</b></div>`).join('') || '<div class="empty">Sin datos aún</div>'}</div>
      <div class="card span2"><h2>Gastos en ruta</h2><div class="grid g4">
        ${[['fine', 'Multas', '🚨'], ['toll', 'Peajes', '🛂'], ['ferry', 'Ferris', '⛴️'], ['train', 'Trenes', '🚆']].map(([k, n, i]) => `<div class="stat"><span class="k">${i} ${n}</span><span class="v mono neg">${money(exp[k] || 0)}</span></div>`).join('')}</div></div>
    </div>`;
  },
};

// ------------------------------------------------------------------ AUTOBÚS
// ---- reportes (se guardan online y avisan al canal de moderación de Discord)
const REPORT_REASONS = {
  driver: ['Embestir o chocar a propósito (ramming)', 'Bloquear la carretera', 'Insultos o acoso', 'Trampas o mods prohibidos', 'Conducción temeraria en convoy', 'Otro'],
  company: ['Estafa o promesas falsas', 'Nombre o logo ofensivo', 'Spam o publicidad', 'Trato abusivo a los conductores', 'Otro'],
  bug: ['La app se cierra o se congela', 'No detecta el juego', 'Datos o dinero incorrectos', 'Problema con la cuenta online', 'Traducción incorrecta', 'Otro'],
  other: ['Sugerencia', 'Otro'],
};
function reportModal(pre = {}) {
  if (!S.data.loggedIn) return toast({ title: 'Inicia sesión primero', body: 'Ajustes → Cuenta online', kind: 'warn' });
  const type = pre.type || 'bug';
  const reasons = (t) => REPORT_REASONS[t].map((r) => `<option>${esc(r)}</option>`).join('');
  modal(`<h2>🚩 Enviar un reporte</h2><div class="grid">
    <label class="field"><span>Qué quieres reportar</span><select id="rp-type" ${pre.type ? 'disabled' : ''}>${[['bug', '🐞 Un error de la app'], ['driver', '🚚 Un conductor'], ['company', '🏢 Una empresa'], ['other', '📝 Otra cosa']].map(([k, n]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field" id="rp-target-f" style="${type === 'driver' || type === 'company' ? '' : 'display:none'}"><span>Nombre del conductor o empresa</span><input type="text" id="rp-target" maxlength="80" value="${esc(pre.target || '')}" ${pre.target ? 'readonly' : ''}></label>
    <label class="field"><span>Motivo</span><select id="rp-reason">${reasons(type)}</select></label>
    <label class="field"><span>Qué ha pasado</span><textarea id="rp-desc" rows="5" maxlength="2000" placeholder="Cuéntalo con detalle: dónde, cuándo, servidor de TruckersMP…"></textarea></label>
    <label class="field"><span>Pruebas (enlace a vídeo o captura, opcional)</span><input type="text" id="rp-ev" maxlength="400" placeholder="https://youtu.be/…"></label>
    <div class="muted" style="font-size:12px">El equipo de Rutero lo revisará en Discord. Los reportes falsos pueden llevar a una sanción.</div>
    <div class="row"><button class="btn danger" id="rp-send">Enviar reporte</button><button class="btn ghost" data-close>Cancelar</button></div></div>`, (bg, close) => {
    const ty = $('#rp-type', bg);
    ty.onchange = () => { $('#rp-reason', bg).innerHTML = reasons(ty.value); $('#rp-target-f', bg).style.display = ty.value === 'driver' || ty.value === 'company' ? '' : 'none'; };
    const sb = $('#rp-send', bg); sb.onclick = () => act(sb, async () => {
      const description = $('#rp-desc', bg).value.trim(); if (description.length < 10) throw new Error('Explica un poco más lo que ha pasado');
      await K.call('report:send', { type: ty.value, reason: $('#rp-reason', bg).value, target: $('#rp-target', bg).value.trim(), targetId: pre.targetId || '', description, evidence: $('#rp-ev', bg).value.trim() });
      toast({ title: 'Reporte enviado ✅', body: 'Gracias, lo revisaremos lo antes posible' }); close();
    });
  });
}
// ------------------------------------------------------------------ Discord
const DISCORD_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.6-3.6-13.6ZM8.5 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';
function discordLinkBox() {
  const on = (S.profile && S.profile.online) || null;
  if (!S.data.loggedIn || !on) return '<div class="dc-link"><span class="dc-ic">' + DISCORD_SVG + '</span><div style="flex:1"><b>Conectar Discord</b><div class="muted" style="font-size:12px">Inicia sesión en Rutero para enlazar tu Discord, verificarte y recibir tu rango.</div></div></div>';
  if (on.discordId) return `<div class="dc-link on"><span class="dc-ic">${DISCORD_SVG}</span><div style="flex:1"><b>Discord conectado · <span translate="no">${esc(on.discordName || 'tu cuenta')}</span></b><div class="muted" style="font-size:12px">Tienes ✅ Verificado y tu rango de Rutero en el servidor (se actualiza en unos minutos).</div></div><button class="btn sm ghost" id="dc-unlink">Desconectar</button></div>`;
  return `<div class="dc-link"><span class="dc-ic">${DISCORD_SVG}</span><div style="flex:1"><b>Conecta tu Discord</b><div class="muted" style="font-size:12px">Te verifica en el servidor y te da el rango de tu nivel y el rol de tu empresa.</div></div><button class="btn discord" id="dc-link">Conectar Discord</button></div>`;
}
function bindDiscordLink(root) {
  const l = $('#dc-link', root);
  if (l) l.onclick = () => act(l, async () => { toast({ title: 'Conectar Discord', body: 'Se ha abierto tu navegador: acepta en Discord y vuelve a Rutero' }); S.profile = await K.call('discord:link'); toast({ title: 'Discord conectado', body: 'En unos minutos recibirás tu rango en el servidor', kind: 'money' }); render(); });
  const u = $('#dc-unlink', root);
  if (u) u.onclick = () => act(u, async () => { S.profile = await K.call('discord:unlink'); render(); });
}
async function loadBotCard() {
  const card = $('#bot-card'); if (!card || !S.data.loggedIn) return;
  let b; try { b = await K.call('bot:info'); } catch { return; }
  if (b.admin === 'other') return; // solo lo ve el administrador del bot (o nadie mientras no se haya configurado)
  card.style.display = '';
  const ago = b.lastSync ? Math.round((Date.now() - b.lastSync) / 60000) : null;
  const cfOn = !!(b.workerBeat && Date.now() - Date.parse(b.workerBeat) < 12 * 60000);
  card.innerHTML = `<div class="card-title"><h2>🤖 Bot de Discord <span class="tag">ADMIN</span></h2>
      ${b.running ? `<span class="pill ${b.online ? 'ok' : 'warn'}"><span class="dot"></span>${b.online ? 'En línea' : 'Conectando…'}</span>` : '<span class="pill">Apagado</span>'}</div>
    <div class="muted" style="margin-bottom:12px">El bot funciona mientras esta app está abierta en tu PC: sincroniza rangos, crea las sedes de empresas, publica promociones y avisa de cada versión nueva.</div>
    ${b.hasToken ? `<div class="grid g3" style="margin-bottom:12px"><div class="mini-stat"><span>Bot</span><b>${esc((b.user && b.user.username) || 'Rutero Bot')}</b></div><div class="mini-stat"><span>Conductores enlazados</span><b>${b.synced || 0}</b></div><div class="mini-stat"><span>Última sincronización</span><b>${ago === null ? '—' : ago < 1 ? 'ahora' : `hace ${ago} min`}</b></div></div>
      ${b.error ? `<div class="notice warn" style="margin-bottom:12px">${esc(b.error)}</div>` : ''}
      <div class="row"><button class="btn primary" id="bot-setup">🛠️ Organizar el servidor</button><button class="btn" id="bot-sync">🔄 Sincronizar ahora</button><button class="btn ghost" id="bot-forget">Quitar token</button></div>
      <div class="muted" id="bot-prog" style="font-size:12px;margin-top:8px">«Organizar el servidor» crea o actualiza canales, permisos, rangos y mensajes fijos. Puedes repetirlo cuando quieras.</div>
      <div class="cf-box"><div class="row between" style="margin-bottom:8px"><b>☁️ Cloudflare · 24 horas</b>${cfOn ? '<span class="pill ok"><span class="dot"></span>Funcionando 24 h</span>' : '<span class="pill">Sin activar</span>'}</div>
        <div class="muted" style="font-size:12px;margin-bottom:10px">${cfOn ? 'Las sedes de empresa y los rangos se hacen en Cloudflare aunque este PC esté apagado.' : 'Pásalo a Cloudflare (gratis) para que sedes y rangos funcionen aunque este PC esté apagado.'}</div>
        <div class="row" style="flex-wrap:nowrap"><input type="text" id="cf-url" placeholder="https://rutero-bot.tu-usuario.workers.dev" value="${esc(b.workerUrl || '')}"><button class="btn ${cfOn ? '' : 'primary'}" id="cf-go">${cfOn ? 'Volver a enviar' : 'Pasar a Cloudflare'}</button></div></div>`
    : `<label class="field"><span>Token del bot (portal de Discord → Bot → Restablecer token → Copiar)</span><div class="row" style="flex-wrap:nowrap"><input type="password" id="bot-token" placeholder="Pega aquí el token" autocomplete="off"><button class="btn primary" id="bot-save">Guardar y encender</button></div></label>
      <div class="muted" style="font-size:12px">El token solo se guarda en este PC y nunca se sube a internet.</div>`}`;
  const on = (id, fn) => { const el = $(id, card); if (el) el.onclick = () => act(el, fn); };
  on('#bot-save', async () => { await K.call('bot:token', $('#bot-token').value); toast({ title: 'Bot encendido', body: 'Ahora pulsa «Organizar el servidor»', kind: 'money' }); loadBotCard(); });
  on('#bot-setup', async () => { const r = await K.call('bot:setup'); toast({ title: 'Servidor organizado', body: `${r.channels} canales revisados`, kind: 'money' }); loadBotCard(); });
  on('#bot-sync', async () => { await K.call('bot:sync'); loadBotCard(); });
  on('#bot-forget', async () => { await K.call('bot:forget'); loadBotCard(); });
  on('#cf-go', async () => { await K.call('bot:cloudflare', $('#cf-url').value); toast({ title: 'Bot pasado a Cloudflare', body: 'En 1–2 minutos empezará a funcionar las 24 horas', kind: 'money' }); setTimeout(loadBotCard, 90000); loadBotCard(); });
}
K.on('rec', () => { if (S.page === 'bus') render(); });
K.on('busRoutes', () => { if (S.page === 'bus') render(); });
K.on('bot:progress', (t) => { const el = $('#bot-prog'); if (el) el.textContent = t; });
const openDiscord = () => { const u = S.data.links && S.data.links.discordInvite; if (u) K.call('open', u); else toast({ title: 'Discord', body: 'El servidor de Discord estará disponible muy pronto' }); };

// empieza una ruta de bus de la empresa y abre el modo autobús
async function startCompanyRoute(r) {
  if (!r) return;
  if (S.bus) throw new Error('Ya tienes una ruta en marcha: termínala o cancélala en Modo autobús');
  S.bus = await K.call('bus:start', { line: `${r.code ? r.code + ' · ' : ''}${r.name}`, from: r.stops[0], to: r.stops[r.stops.length - 1], fare: r.fare, perKm: r.perKm ?? 8, capacity: r.capacity || 55, routeId: r.id, stopNames: r.stops, bonus: r.bonus, color: r.color, stopPos: r.stopPos || [] });
  toast({ title: 'Ruta empezada 🚌', body: `${r.name} · ${r.stops.length} paradas` });
  go('bus');
}
const PAGE_BUS = {
  id: 'bus',
  async html() {
    await refreshState();
    if (!S.data.busUnlocked && !S.bus) {
      const hasCo = !!(S.profile && S.profile.online && S.profile.online.companyId);
      return `<div class="page-head"><div><h1>${esc(S.data.busName || 'Modo autobús')}</h1><div class="subtitle">Rutas de pasajeros con paradas, billetes y puntuación</div></div></div>
        <div class="card bus-locked"><div class="lock-ic">🔒</div><h2>Servicio de autobuses bloqueado</h2>
          <div class="muted" style="max-width:460px;margin:0 auto 16px">${hasCo ? 'Tu empresa todavía no ha activado el servicio de autobuses. El fundador o un gerente pueden activarlo en Mi empresa → Rutas de bus.' : 'Únete a una empresa con el servicio de autobuses activado para poder conducir rutas de bus.'}</div>
          <button class="btn primary" id="bus-go-co">${hasCo ? '🚌 Ir a Rutas de bus' : '🏢 Ir a Mi empresa'}</button></div>`;
    }
    const b = S.bus; const trips = S.data.jobs.filter((j) => j.type === 'bus');
    const me = (S.profile && S.profile.online) || {};
    let routes = [];
    if (!b && me.companyId) { try { const c = S.company && S.company.info && S.company.info.id === me.companyId ? S.company : await K.call('company:get'); routes = c && c.info && c.info.busUnlocked ? (c.busRoutes || []).filter((r) => r.active !== false) : []; S.busCompanyBanner = (c && c.info && c.info.busBanner) || ''; S.busCompanyName = (c && c.info && c.info.name) || ''; } catch { routes = []; } }
    if (!me.companyId) { S.busCompanyBanner = ''; S.busCompanyName = ''; }
    S.busRoutes = routes;
    S.busView = trips;
    S.myRoutes = await K.call('bus:routes').catch(() => []);
    S.rec = await K.call('bus:rec').catch(() => null);
    const key = (S.data.settings.busDoorKey || 'U').toUpperCase();
    const isBus = S.live && /bus|coach|autob|setra|irizar|intercity|citaro|lion|neoplan|solaris|urbino/i.test(`${S.live.truck.brand} ${S.live.truck.name}`);
    const mine = S.data.settings.busBanner || '';
    const hero = mine || S.busCompanyBanner || '';
    return `${bannerHero(hero, S.data.busName || 'Modo autobús', S.busCompanyName && !mine && S.busCompanyBanner ? 'Con las líneas de tu empresa' : 'Rutas de pasajeros con paradas, billetes y puntuación',
      `<button class="btn sm" id="bus-banner">🖼️ ${mine ? 'Cambiar' : 'Poner'} banner</button>${mine ? '<button class="btn sm ghost" id="bus-banner-del">Quitar</button>' : ''}`)}
    ${S.rec ? `<div class="rec-bar"><span class="rec-dot"></span><div style="flex:1"><b>Grabando ruta · ${S.rec.count - 1} ${S.rec.count - 1 === 1 ? 'parada' : 'paradas'}</b><div class="muted"><b class="kbd">Shift + F2</b> en cada parada · <b class="kbd">Shift + F3</b> deshacer · <b class="kbd">Shift + F1</b> en el destino para guardarla.</div></div><button class="btn sm ghost" id="rec-cancel">Cancelar grabación</button></div>` : ''}
    ${isBus && !b ? '<div class="notice" style="margin-bottom:16px">🚌 Parece que conduces un autobús. ¡Empieza una ruta!</div>' : ''}
    ${b ? `<div class="card"><div class="card-title"><h2>${esc(b.line)} · ${esc(b.from || '?')} → ${esc(b.to || '?')}</h2><span class="pill ok"><span class="dot"></span>En servicio</span></div>
      <div class="door-bar ${b.doors ? 'open' : ''}" id="bus-doorbar"></div>
      <div class="grid g4" id="bus-live"></div>
      ${b.stopNames && b.stopNames.length ? `<div class="route-line live" id="bus-stops"></div>` : ''}
      <div class="notice" style="margin-top:14px">🚪 En cada parada, para el autobús y pulsa <b class="kbd">${esc(key)}</b> en el juego para abrir las puertas: primero bajan y luego suben pasajeros. Vuelve a pulsar <b class="kbd">${esc(key)}</b> para cerrar y seguir.${b.bonus ? ` Si haces las ${b.stopNames.length} paradas cobras ${money(b.bonus)} extra.` : ''}</div>
      <div class="row" style="margin-top:16px"><button class="btn" id="bus-door">🚪 ${b.doors ? 'Cerrar' : 'Abrir'} puertas</button>${b.next ? '<button class="btn" id="bus-here" title="Si la flecha te lleva a un sitio equivocado: para en la parada correcta y púlsalo (o Shift+F2 en el juego)">📍 La parada está aquí</button>' : ''}<button class="btn primary" id="bus-end">Terminar ruta y cobrar</button><button class="btn danger" id="bus-cancel">Cancelar</button></div></div>`
    : `${routes.length ? `<div class="card" style="margin-bottom:16px"><h2>Rutas de tu empresa</h2><div class="grid g3">${routes.map((r) => `<button class="route-pick" data-pickroute="${r.id}" style="--rc:${esc(r.color || '#FF9F1C')}"><span class="route-code">${esc(r.code || '🚌')}</span><span style="flex:1;min-width:0;text-align:left"><b>${esc(r.name)}</b><span class="muted" style="display:block;font-size:12px">${esc(r.stops[0])} → ${esc(r.stops[r.stops.length - 1])} · ${r.stops.length} paradas · ${money(r.fare)}</span></span><span>▶</span></button>`).join('')}</div></div>` : ''}
    <div class="card" style="margin-bottom:16px"><div class="card-title"><h2>Mis rutas</h2>${S.data.canRoutes ? '<button class="btn primary sm" id="my-route-new">＋ Crear ruta con paradas</button>' : '<span class="muted" style="font-size:12px">🔒 Tu rol no puede crear rutas</span>'}</div>
      ${S.myRoutes.length ? `<div class="grid g2">${S.myRoutes.map((r) => `<div class="card route-card" style="--rc:${esc(r.color || '#4C8DFF')};margin:0">
        <div class="row between" style="align-items:flex-start"><div class="row" style="gap:10px;flex-wrap:nowrap;min-width:0"><span class="route-code">${esc(r.code || '🚌')}</span>
          <div style="min-width:0"><h2 style="margin:0">${esc(r.name)}</h2><div class="muted" style="font-size:12px">${r.stops.length} paradas · billete ${nf(r.fare, 2)} ${cur()} · ${nf(r.perKm, 2)} ${cur()}/km · ${r.capacity} plazas${r.runs ? ` · <span style="color:#FFC83D">${starsTxt(Math.round((r.rating ?? 80) / 20))}</span>` : ''}</div></div></div></div>
        <div class="route-line">${r.stops.map((x, i) => `<div class="rstop ${i === 0 || i === r.stops.length - 1 ? 'end' : ''}"><i></i><span>${esc(x)}</span></div>`).join('')}</div>
        <div class="row"><button class="btn primary sm" data-mydrive="${r.id}">▶ Conducir</button><button class="btn sm" data-myedit="${r.id}">Editar</button><button class="btn sm ghost" data-mydel="${r.id}">Borrar</button></div></div>`).join('')}</div>`
      : '<div class="empty"><div class="big">🗺️</div>Crea tu propia línea con todas sus paradas: salida, paradas intermedias y destino.</div>'}</div>
    <div class="card"><h2>Ruta rápida</h2><div class="grid g4">
        <label class="field"><span>Línea</span><input type="text" id="b-line" placeholder="L1 Express"></label>
        <label class="field"><span>Salida</span><input type="text" id="b-from" placeholder="Madrid"></label>
        <label class="field"><span>Destino</span><input type="text" id="b-to" placeholder="Valencia"></label>
        <label class="field"><span>Precio billete</span><input type="number" id="b-fare" value="5" step="0.5" min="0"></label></div>
        <div class="row" style="margin-top:14px"><button class="btn primary" id="bus-start">▶ Empezar ruta</button><span class="muted">Funciona con cualquier mod de autobús o con un camión.</span></div></div>`}
    <div class="card keys-card" style="margin-top:16px"><div class="card-title"><h2>⌨️ Teclas en el juego</h2>
        <label class="row" style="gap:8px"><span class="switch"><input type="checkbox" id="bus-hk" ${S.data.settings.busHotkeys !== false ? 'checked' : ''}><i></i></span><span class="muted">Shift+F1, Shift+F2 y Shift+F3 activadas</span></label></div>
      <div class="muted" style="margin-bottom:12px">Funcionan con la ventana de ETS2 o ATS delante. Rutero solo «escucha» la tecla: el juego también la recibe, así que si usas Shift+F1, Shift+F2 o Shift+F3 para otra cosa del juego puedes desactivarlas aquí.</div>
      <div class="keys-grid">
        <div class="kk"><b class="kbd">${esc(key)}</b><div><b>Abrir / cerrar puertas</b><span>Con el autobús parado en la parada: primero bajan y luego suben pasajeros. Al cerrar cuenta la parada y se guarda dónde está.</span></div></div>
        <div class="kk"><b class="kbd">Shift + F1</b><div><b>Empezar y terminar</b><span>Púlsala en la salida para empezar a grabar. Al llegar al destino vuelve a pulsarla: ese sitio queda como destino y la ruta se guarda.</span></div></div>
        <div class="kk"><b class="kbd">Shift + F2</b><div><b>Marcar parada</b><span>Mientras grabas, pulsa Shift+F2 en cada parada. Se numeran solas y puedes poner todas las que quieras.</span></div></div>
        <div class="kk"><b class="kbd">Shift + F3</b><div><b>Deshacer</b><span>Borra la última parada marcada si te has equivocado.</span></div></div>
        <div class="kk"><b class="kbd">Shift + F2</b><div><b>Durante una ruta: «la parada está aquí»</b><span>Si una parada quedó mal colocada, para en el sitio correcto y púlsala: la próxima parada se mueve ahí (sin grabar la ruta otra vez).</span></div></div>
        <div class="kk"><b class="kbd">🧭</b><div><b>Guía en el overlay</b><span>Cuando conduces una ruta con paradas guardadas, el overlay muestra una flecha, «gira a la derecha / sigue recto» y los metros que faltan.</span></div></div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:10px">Las rutas grabadas aparecen en «Mis rutas» como «Ruta grabada…»: pulsa Editar para ponerles nombre a la línea y a cada parada.</div></div>
    <div class="card" style="margin-top:16px"><div class="card-title"><h2>🔊 Voz de las paradas</h2>
        <div class="row" style="gap:8px;flex-wrap:nowrap"><select id="bus-voice" style="width:auto">${[['auto', 'Automática (idioma de la app)'], ['es', 'Español'], ['en', 'English'], ['off', 'Desactivada']].map(([k, n]) => `<option value="${k}" ${(S.data.settings.busVoice || 'auto') === k ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn sm" id="bus-voice-test">▶ Probar</button></div></div>
      <div class="muted">Anuncia «Próxima parada…» al cerrar las puertas y el nombre de la parada al llegar, como en un autobús de verdad.</div>
      <div class="keys-grid" style="margin-top:14px">
        <div class="kk"><b class="kbd">😊</b><div><b>Satisfacción</b><span>Frenazos, curvas rápidas y exceso de velocidad la bajan. Con buena nota dejan propina.</span></div></div>
        <div class="kk"><b class="kbd">⏱</b><div><b>Horario</b><span>Cada parada tiene una hora prevista. Llegar a tiempo da un extra; muy tarde, parte de la gente se va.</span></div></div>
        <div class="kk"><b class="kbd">🕗</b><div><b>Hora punta</b><span>Más gente de 7 a 9 y de 17 a 19 (hora del juego) y en ciudades grandes; menos de noche y en paradas de carretera.</span></div></div>
        <div class="kk"><b class="kbd">⛽</b><div><b>Gastos</b><span>El combustible gastado y el desgaste del bus se restan de lo ganado.</span></div></div>
      </div></div>
    <div class="card" style="margin-top:16px"><h2>Historial de rutas</h2>${!trips.length ? '<div class="empty"><div class="big">🚏</div>Aún no has hecho rutas</div>' : `
      <table><thead><tr><th>Fecha</th><th>Línea</th><th>Ruta</th><th class="num">Paradas</th><th class="num">Pasajeros</th><th class="num">Distancia</th><th class="num">Ganado</th><th class="num">Nota</th><th class="num">Puntos</th></tr></thead>
      <tbody>${trips.map((j, i) => `<tr class="click" data-trip="${i}"><td class="muted">${dateStr(j.finishedAt)}</td><td>${esc(j.line)}</td><td>${esc(j.from)} → ${esc(j.to)}</td><td class="num">${j.stops}</td><td class="num">${j.passengers}</td><td class="num">${dist(j.km)}</td><td class="num pos">${money(j.net ?? j.revenue)}</td><td class="num" style="color:#FFC83D">${j.stars ? starsTxt(j.stars) : '—'}</td><td class="num">${j.score}</td></tr>`).join('')}</tbody></table>`}</div>`;
  },
  mount(root) {
    const gc = $('#bus-go-co'); if (gc) gc.onclick = () => { if (S.profile.online && S.profile.online.companyId) S.companyTab = 'busroutes'; go('company'); };
    const st = $('#bus-start');
    if (st) st.onclick = () => act(st, async () => { S.bus = await K.call('bus:start', { line: $('#b-line').value, from: $('#b-from').value, to: $('#b-to').value, fare: $('#b-fare').value }); render(); });
    const en = $('#bus-end');
    if (en) en.onclick = () => act(en, async () => { await K.call('bus:end'); S.bus = null; await refreshState(); render(); });
    const ca = $('#bus-cancel');
    if (ca) ca.onclick = async () => { await K.call('bus:cancel'); S.bus = null; render(); };
    $$('[data-pickroute]', root).forEach((b) => b.onclick = () => act(b, () => startCompanyRoute(S.busRoutes.find((r) => r.id === b.dataset.pickroute))));
    const hk = $('#bus-hk'); if (hk) hk.onchange = async () => { await K.call('settings:set', { busHotkeys: hk.checked }); await refreshState(); };
    const rc = $('#rec-cancel'); if (rc) rc.onclick = async () => { await K.call('bus:recCancel'); render(); };
    const bh = $('#bus-here'); if (bh) bh.onclick = () => act(bh, async () => { S.bus = await K.call('bus:relocate'); toast({ title: '📍 Parada movida aquí', body: S.bus.next || '' }); updateBus(); });
    const vs = $('#bus-voice'); if (vs) vs.onchange = async () => { await K.call('settings:set', { busVoice: vs.value }); await refreshState(); };
    const vt = $('#bus-voice-test'); if (vt) vt.onclick = () => { const v = vs ? vs.value : 'auto'; const lang = v === 'auto' ? (S.data.lang === 'es' ? 'es' : 'en') : v; if (v === 'off') return; say({ text: lang === 'es' ? 'Próxima parada: Estación central.' : 'Next stop: Central station.', lang, chime: true }); };
    const dr = $('#bus-door');
    if (dr) dr.onclick = () => act(dr, async () => { S.bus = await K.call('bus:doors'); render(); });
    const myForm = (r = {}) => formModal(r.id ? 'Editar ruta' : 'Nueva ruta con paradas', `
      <div class="grid g2"><label class="field"><span>Código de línea</span><input type="text" id="mr-code" maxlength="8" placeholder="L1" value="${esc(r.code || '')}"></label>
        <label class="field"><span>Nombre</span><input type="text" id="mr-name" maxlength="60" placeholder="Costa Express" value="${esc(r.name || '')}"></label></div>
      <label class="field"><span>Paradas en orden (una por línea: la primera es la salida y la última el destino)</span><textarea id="mr-stops" rows="8" placeholder="Barcelona - Estación Nord&#10;Tarragona&#10;Castellón&#10;Valencia - Estación">${esc((r.stops || []).join('\n'))}</textarea></label>
      <div class="grid g3"><label class="field"><span>Precio del billete</span><input type="number" id="mr-fare" min="0" step="0.5" value="${r.fare ?? 5}"></label>
        <label class="field"><span>Pago por km</span><input type="number" id="mr-km" min="0" max="30" step="0.5" value="${r.perKm ?? 8}"></label>
        <label class="field"><span>Plazas del autobús</span><input type="number" id="mr-cap" min="8" max="120" step="1" value="${r.capacity ?? 55}"></label></div>
      <label class="field"><span>Color</span>${typeof colorInput === 'function' ? colorInput('mr-color', r.color || '#4C8DFF') : `<input type="color" id="mr-color" value="${esc(r.color || '#4C8DFF')}">`}</label>`,
      async (bg) => { S.myRoutes = await K.call('bus:routeSave', { id: r.id, code: $('#mr-code', bg).value, name: $('#mr-name', bg).value, stops: $('#mr-stops', bg).value, fare: $('#mr-fare', bg).value, perKm: $('#mr-km', bg).value, capacity: $('#mr-cap', bg).value, color: $('#mr-color', bg).value });
        toast({ title: 'Ruta guardada 🚌', body: $('#mr-name', bg).value }); render(); }, r.id ? 'Guardar cambios' : 'Crear ruta');
    const mn = $('#my-route-new'); if (mn) mn.onclick = () => myForm();
    $$('[data-myedit]', root).forEach((b) => b.onclick = () => myForm(S.myRoutes.find((r) => r.id === b.dataset.myedit)));
    $$('[data-mydel]', root).forEach((b) => b.onclick = () => act(b, async () => { if (!confirm('¿Borrar esta ruta?')) return; S.myRoutes = await K.call('bus:routeDel', b.dataset.mydel); render(); }));
    $$('[data-mydrive]', root).forEach((b) => b.onclick = () => act(b, async () => {
      const r = S.myRoutes.find((x) => x.id === b.dataset.mydrive); if (!r) return;
      S.bus = await K.call('bus:start', { line: `${r.code ? r.code + ' · ' : ''}${r.name}`, from: r.stops[0], to: r.stops[r.stops.length - 1], fare: r.fare, perKm: r.perKm, capacity: r.capacity, routeId: r.id, stopNames: r.stops, color: r.color, mine: true, stopPos: r.stopPos || [], reputation: r.rating ?? 80 });
      toast({ title: 'Ruta empezada 🚌', body: `${r.name} · ${r.stops.length} paradas` }); render();
    }));
    const bb = $('#bus-banner');
    if (bb) bb.onclick = async () => { const img = await pickBanner(1200, 300, 'Banner del modo autobús'); if (!img) return; await K.call('settings:set', { busBanner: img }); await refreshState(); render(); };
    const bd = $('#bus-banner-del');
    if (bd) bd.onclick = async () => { await K.call('settings:set', { busBanner: '' }); await refreshState(); render(); };
    bindTrips(root, S.busView);
    updateBus();
  },
};
const starsTxt = (n) => `${'★'.repeat(Math.max(0, Math.min(5, n || 0)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, n || 0)))}`;
const etaTxt = (b) => { if (!b || !b.eta || b.eta.stop !== b.stops) return ''; const left = Math.round((b.eta.due - Date.now()) / 1000); const mm = (x) => `${Math.floor(Math.abs(x) / 60)}:${String(Math.abs(x) % 60).padStart(2, '0')}`; return left >= 0 ? `⏱ ${mm(left)}` : `⏱ +${mm(left)}`; };
const navText = (n) => { const a = Math.abs(n.rel), side = n.rel > 0 ? 'derecha' : 'izquierda'; return a <= 22 ? 'Sigue recto' : a <= 70 ? `Ligeramente a la ${side}` : a <= 140 ? `Gira a la ${side}` : 'La parada está detrás'; };
function updateBus() {
  const el = $('#bus-live'); if (!el || !S.bus) return;
  const b = S.bus;
  const key = (S.data.settings.busDoorKey || 'U').toUpperCase();
  el.innerHTML = [['Paradas', `${b.stops}${b.stopNames && b.stopNames.length ? ` / ${b.stopNames.length}` : ''}`], ['A bordo', `${b.onBoard} / ${b.capacity || 55}`], ['Pasajeros totales', b.passengers], ['Distancia', dist(b.km, 1)],
    ['Billetes', money(b.ticketMoney ?? b.passengers * b.fare)], ['Por km', money((b.km || 0) * (b.perKm ?? 0))], ['Tiempo', dur((Date.now() - b.startedAt) / 60000)], ['Exceso velocidad', `${Math.round(b.speedingSec)} s`],
    ['Satisfacción', `${Math.round(b.sat ?? 100)}%`], ['Puntualidad', b.timed ? `${b.punctual} / ${b.timed}` : '—'], ['Propinas y extras', money((b.tips || 0) + (b.punctualPay || 0))], ['Combustible', `${nf(b.fuelUsed || 0, 1)} L`]]
    .map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v mono" style="font-size:26px">${esc(v)}</span></div>`).join('');
  const db = $('#bus-doorbar');
  if (db) {
    db.classList.toggle('open', !!b.doors);
    db.innerHTML = b.doors
      ? `<span class="dk">🚪</span><div style="flex:1"><b>Puertas abiertas${b.stopName ? ` · ${esc(b.stopName)}` : ''}</b><div class="muted">${b.alighting ? `Bajando… quedan ${b.alighting}` : b.waiting ? `Subiendo… ${b.waiting} esperando` : 'Ya han subido todos'} · ↓ ${b.stopOff} · ↑ ${b.stopOn}</div></div><span class="muted">Pulsa <b class="kbd">${esc(key)}</b> para cerrar</span>`
      : `<span class="dk nav-arrow" style="transform:rotate(${b.nav && b.nav.known && b.nav.dist >= 35 ? b.nav.rel : 0}deg)">${b.nav && b.nav.known ? '⬆️' : '🚌'}</span><div style="flex:1"><b>${b.next ? `Próxima parada: ${esc(b.next)}` : b.stopNames && b.stopNames.length ? 'Ruta completada: termina para cobrar' : `Parada ${b.stops + 1}`}</b><div class="muted">${b.nav && b.nav.known ? (b.nav.dist < 35 ? 'Has llegado: abre las puertas' : `${navText(b.nav)} · ${b.nav.dist < 1000 ? `${Math.round(b.nav.dist / 10) * 10} m` : `${nf(b.nav.dist / 1000, 1)} km`}${etaTxt(b) ? ` · ${etaTxt(b)}` : ''}`) : b.nav ? 'Parada sin ubicar: se guardará al abrir las puertas allí' : 'Para el autobús y pulsa'} ${b.nav && b.nav.known ? '' : `<b class="kbd">${esc(key)}</b> para abrir las puertas`}</div></div>`;
    const btn = $('#bus-door'); if (btn) btn.innerHTML = `🚪 ${b.doors ? 'Cerrar' : 'Abrir'} puertas`;
  }
  const st = $('#bus-stops');
  if (st && b.stopNames) st.innerHTML = b.stopNames.map((s, i) => `<div class="rstop ${i < b.stops ? 'done' : i === b.stops ? 'next' : ''}"><i></i><span>${esc(s)}</span></div>`).join('');
}

// ------------------------------------------------------------------ RANKING
const PAGE_RANKING = {
  id: 'ranking',
  async html() {
    if (!S.data.cloudReady) return `<div class="page-head"><h1>Ranking</h1></div>${noCloud()}`;
    if (!S.data.loggedIn) return `<div class="page-head"><h1>Ranking</h1></div>${needLogin('ver el ranking')}`;
    const r = S.rank;
    const fields = r.period === 'week' ? { km: 'km', money: 'money', jobs: 'jobs' } : r.scope === 'companies' ? { km: 'km', money: 'balance', jobs: 'jobs' } : { km: 'km', money: 'money', jobs: 'jobs' };
    const field = fields[r.metric];
    const list = await K.call('cloud:ranking', r.scope, field, r.period);
    const me = S.profile.online || {};
    const fmt = (v) => (r.metric === 'km' ? dist(v || 0) : r.metric === 'money' ? money(v || 0) : nf(v || 0));
    const nameOf = (x) => x.name || 'Sin nombre';
    const top3 = [list[1], list[0], list[2]];
    return `<div class="page-head"><div><h1>Ranking</h1><div class="subtitle">${r.period === 'week' ? 'Esta semana (se reinicia el lunes)' : 'Desde siempre'}</div></div>
      <div class="row"><div class="tabs">${[['drivers', 'Conductores'], ['companies', 'Empresas']].map(([k, n]) => `<button data-rs="${k}" class="${r.scope === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="tabs">${[['km', 'Distancia'], ['money', 'Dinero'], ['jobs', 'Entregas']].map(([k, n]) => `<button data-rm="${k}" class="${r.metric === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="tabs">${[['week', 'Semana'], ['all', 'Total']].map(([k, n]) => `<button data-rp="${k}" class="${r.period === k ? 'on' : ''}">${n}</button>`).join('')}</div></div></div>
      ${list.length ? `<div class="podium">${top3.map((x, i) => x ? `<div class="p ${i === 1 ? 'first' : ''}"><div class="medal">${['🥈', '🥇', '🥉'][i]}</div><div style="display:flex;justify-content:center;margin-top:6px">${r.scope === 'companies' ? companyLogo(x, 56) : avatar(x.photo, nameOf(x), 56)}</div><div class="nm">${esc(nameOf(x))}</div>
        <div class="muted" style="font-size:12px">${esc(x.companyTag || x.tag || '')}</div><div class="val mono">${fmt(x[field])}</div></div>` : '<div></div>').join('')}</div>
      <div class="card"><table><thead><tr><th>#</th><th>${r.scope === 'companies' ? 'Empresa' : 'Conductor'}</th><th class="num">${{ km: 'Distancia', money: 'Dinero', jobs: 'Entregas' }[r.metric]}</th></tr></thead><tbody>
      ${list.map((x, i) => `<tr class="${x.id === me.uid || x.id === me.companyId ? 'mine' : ''} ${r.scope === 'drivers' ? 'click' : ''}" data-drv="${x.id}"><td class="rank-pos">${i + 1}</td>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap">${r.scope === 'companies' ? companyLogo(x, 32) : avatar(x.photo, nameOf(x), 32)}<b>${esc(nameOf(x))}</b> ${x.companyTag || x.tag ? `<span class="tag">${esc(x.companyTag || x.tag)}</span>` : ''}</div></td><td class="num mono">${fmt(x[field])}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card"><div class="empty"><div class="big">🏁</div>Nadie ha puntuado todavía. ¡Haz la primera entrega!</div></div>'}`;
  },
  mount(root) {
    $$('[data-goto]', root).forEach((b) => b.onclick = () => go(b.dataset.goto));
    $$('[data-rs]', root).forEach((b) => b.onclick = () => { S.rank.scope = b.dataset.rs; render(); });
    $$('[data-rm]', root).forEach((b) => b.onclick = () => { S.rank.metric = b.dataset.rm; render(); });
    $$('[data-rp]', root).forEach((b) => b.onclick = () => { S.rank.period = b.dataset.rp; render(); });
    if (S.rank.scope === 'drivers') $$('[data-drv]', root).forEach((tr) => tr.onclick = () => driverModal(tr.dataset.drv));
  },
};

// ------------------------------------------------------------------ LOGROS
const PAGE_ACH = {
  id: 'achievements',
  async html() {
    const p = S.profile; const a = S.data.achievements; const got = a.filter((x) => x.unlockedAt).length;
    return `<div class="page-head"><div><h1>Logros y nivel</h1><div class="subtitle">${got} de ${a.length} logros desbloqueados</div></div></div>
      <div class="card" style="margin-bottom:16px"><div class="row" style="gap:22px"><div class="company-logo" style="background:linear-gradient(180deg,var(--amber),var(--amber2))">${p.level}</div>
      <div style="flex:1"><h2 style="margin:0">${esc(p.rank)}</h2><div class="muted">${nf(p.xp)} XP · siguiente nivel en ${nf(p.xpNext - p.xp)} XP</div>
      <div class="xpbar" style="height:10px"><i style="width:${Math.min(100, ((p.xp - p.xpThis) / Math.max(1, p.xpNext - p.xpThis)) * 100)}%"></i></div>
      <div class="muted" style="font-size:12px;margin-top:8px">Ganas XP con la experiencia del juego, 1 XP por cada 4 km, +60 por puntuación ≥95 y +5 por parada de autobús.</div></div></div></div>
      <div class="grid g3">${a.map((x) => `<div class="ach ${x.unlockedAt ? 'on' : ''}"><div class="ic">${x.icon}</div><div><div class="n">${esc(x.name)}</div><div class="muted" style="font-size:12px">${esc(x.desc)}</div>
        ${x.unlockedAt ? `<div style="font-size:11px;color:var(--teal);margin-top:4px">Conseguido ${dayStr(x.unlockedAt)}</div>` : ''}</div></div>`).join('')}</div>`;
  },
};

// ------------------------------------------------------------------ TRUCKERSMP
const tmpField = (o, ...keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const PAGE_TMP = {
  id: 'tmp',
  async html() {
    const tab = S.tmpTab;
    let body = '';
    const head = `<div class="page-head"><div><h1>TruckersMP</h1><div class="subtitle" id="tmp-time">Conectado a la API pública de TruckersMP</div></div>
      <div class="tabs">${[['servers', 'Servidores'], ['me', 'Mi perfil'], ['events', 'Eventos'], ['vtc', 'Buscar VTC']].map(([k, n]) => `<button data-tt="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
    try {
      if (tab === 'servers') {
        const sv = await K.call('tmp:servers');
        const total = sv.reduce((a, s) => a + (s.players || 0), 0);
        const group = (g) => sv.filter((s) => (s.game || '').toUpperCase() === g);
        const row = (s) => { const max = tmpField(s, 'maxplayers', 'max_players') || 1; const fill = (s.players || 0) / max;
          return `<div class="server"><div><div class="nm">${s.online ? '🟢' : '🔴'} ${esc(s.name)}</div><div class="flags">
            ${tmpField(s, 'speedlimiter', 'speed_limiter') ? '<span class="pill">Limitador</span>' : ''}${s.collisions ? '<span class="pill">Colisiones</span>' : '<span class="pill">Sin colisiones</span>'}
            ${s.promods ? '<span class="pill warn">ProMods</span>' : ''}${s.event ? '<span class="pill ok">Evento</span>' : ''}${tmpField(s, 'carsforplayers', 'cars_for_players') ? '<span class="pill">Coches</span>' : ''}</div></div>
            <div><div class="bar ${fill > .9 ? 'red' : fill > .6 ? 'amber' : ''}"><i style="width:${fill * 100}%"></i></div></div>
            <div class="num mono"><b>${nf(s.players)}</b><span class="muted">/${nf(max)}</span>${s.queue ? `<div class="muted" style="font-size:11px">cola ${s.queue}</div>` : ''}</div></div>`; };
        body = `<div class="grid g3" style="margin-bottom:16px"><div class="card stat"><span class="k">Jugadores ahora</span><span class="v mono">${nf(total)}</span></div>
          <div class="card stat"><span class="k">Servidores online</span><span class="v mono">${sv.filter((s) => s.online).length}</span></div>
          <div class="card stat"><span class="k">Tu estado</span><span class="v" style="font-size:20px">${S.live && S.live.tmp ? '🟢 Jugando en TruckersMP' : '⚪ No detectado'}</span></div></div>
          <div class="grid g2"><div class="card"><h2>Euro Truck Simulator 2</h2>${group('ETS2').map(row).join('')}</div><div class="card"><h2>American Truck Simulator</h2>${group('ATS').map(row).join('')}</div></div>`;
      } else if (tab === 'me') {
        const id = S.data.settings.tmpId;
        if (!id) body = `<div class="card"><h2>Vincula tu cuenta de TruckersMP</h2><div class="muted" style="margin-bottom:12px">Escribe tu ID de TruckersMP (sale en tu perfil de truckersmp.com/user/<b>ID</b>).</div>
          <div class="row" style="flex-wrap:nowrap;max-width:420px"><input type="text" id="tmp-id" placeholder="Ej. 123456"><button class="btn primary" id="tmp-link">Vincular</button></div></div>`;
        else {
          const [pl, bans] = await Promise.all([K.call('tmp:player', id), K.call('tmp:bans', id).catch(() => [])]);
          const vtc = pl.vtc || {};
          body = `<div class="grid g2"><div class="card"><div class="row" style="gap:16px"><div class="avatar" style="width:72px;height:72px"><img src="${esc(pl.avatar)}" alt=""></div>
            <div><h2 style="margin:0">${esc(pl.name)}</h2><div style="color:${esc(tmpField(pl, 'groupColor', 'group_color') || 'var(--muted)')}">${esc(tmpField(pl, 'groupName', 'group_name') || '')}</div>
            <div class="muted" style="font-size:12px">ID ${pl.id} · <span>desde</span> ${dayStr(tmpField(pl, 'joinDate', 'join_date'))}</div></div></div>
            <div class="grid g2" style="margin-top:16px"><div class="stat"><span class="k">Estado</span><span class="v" style="font-size:20px">${pl.banned ? '<span class="neg">Baneado</span>' : '<span class="pos">Activo</span>'}</span></div>
            <div class="stat"><span class="k">Bans</span><span class="v mono">${tmpField(pl, 'bansCount', 'ban_count') ?? bans.length}</span></div></div>
            ${vtc.name ? `<div class="list-item" style="margin-top:10px"><div class="avatar">🏢</div><div style="flex:1"><b>${esc(vtc.name)}</b> <span class="tag">${esc(vtc.tag || '')}</span><div class="muted" style="font-size:12px">Tu VTC en TruckersMP</div></div></div>` : ''}
            <div class="row" style="margin-top:14px"><button class="btn" data-url="https://truckersmp.com/user/${pl.id}">Abrir perfil</button><button class="btn ghost" id="tmp-unlink">Desvincular</button></div></div>
            <div class="card"><h2>Historial de bans</h2>${bans.length ? bans.map((b) => `<div class="list-item"><div class="avatar">⚖️</div><div style="flex:1">${esc(b.reason)}<div class="muted" style="font-size:12px">${dayStr(b.timeAdded || b.time_added)} · ${b.active ? 'Activo' : 'Expirado'}</div></div></div>`).join('') : '<div class="empty"><div class="big">😇</div>Expediente limpio</div>'}</div></div>`;
        }
      } else if (tab === 'events') {
        const ev = await K.call('tmp:events');
        const list = [...(ev.today || []), ...(ev.upcoming || []), ...(ev.featured || [])].filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i).slice(0, 30);
        body = `<div class="card"><h2>Convoyes y eventos</h2>${list.map((e) => { const d = new Date(tmpField(e, 'start_at', 'startAt') || Date.now());
          return `<div class="event" data-url="https://truckersmp.com${esc(e.url || `/events/${e.id}`)}"><div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString(LOC(), { month: 'short' })}</span></div>
          <div style="flex:1"><b>${esc(e.name)}</b><div class="muted" style="font-size:12px">${d.toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' })} · ${esc((e.server && e.server.name) || '')} · ${esc((e.departure && e.departure.city) || '?')} → ${esc((e.arrive && e.arrive.city) || '?')}</div></div>
          <div class="num"><b class="mono">${(e.attendances && e.attendances.confirmed) || 0}</b><div class="muted" style="font-size:11px">asistentes</div></div></div>`; }).join('') || '<div class="empty">No hay eventos</div>'}</div>`;
      } else if (tab === 'vtc') {
        body = `<div class="card"><h2>Buscar una VTC por ID</h2><div class="row" style="flex-wrap:nowrap;max-width:420px"><input type="text" id="vtc-id" placeholder="ID de la VTC"><button class="btn primary" id="vtc-go">Buscar</button></div><div id="vtc-out" style="margin-top:16px"></div></div>`;
      }
    } catch (e) { body = `<div class="card"><div class="empty"><div class="big">📡</div>No se pudo conectar con TruckersMP<div class="muted">${esc(e.message)}</div></div></div>`; }
    return head + body;
  },
  mount(root) {
    $$('[data-tt]', root).forEach((b) => b.onclick = () => { S.tmpTab = b.dataset.tt; render(); });
    $$('[data-url]', root).forEach((b) => b.onclick = () => K.call('open', b.dataset.url));
    K.call('tmp:gameTime').then((t) => { const el = $('#tmp-time'); if (el && typeof t === 'number') el.textContent = `Hora en los servidores: ${gameClock(t)}`; }).catch(() => {});
    const link = $('#tmp-link');
    if (link) link.onclick = () => act(link, async () => {
      const id = $('#tmp-id').value.trim();
      if (S.data.loggedIn) await K.call('cloud:linkTmp', id); else { await K.call('tmp:player', id); await K.call('settings:set', { tmpId: id }); }
      await refreshState(); render();
    });
    const un = $('#tmp-unlink'); if (un) un.onclick = async () => { await K.call('settings:set', { tmpId: '' }); await refreshState(); render(); };
    const vg = $('#vtc-go');
    if (vg) vg.onclick = () => act(vg, async () => {
      const id = $('#vtc-id').value.trim();
      const [v, mem] = await Promise.all([K.call('tmp:vtc', id), K.call('tmp:vtcMembers', id).catch(() => ({ members: [] }))]);
      const members = (mem && mem.members) || [];
      $('#vtc-out').innerHTML = `<div class="row" style="gap:16px"><div class="avatar" style="width:64px;height:64px"><img src="${esc(v.logo)}" alt=""></div><div><h2 style="margin:0">${esc(v.name)} <span class="tag">${esc(v.tag)}</span></h2>
        <div class="muted">${esc(v.slogan || '')}</div><div class="muted" style="font-size:12px">${tmpField(v, 'members_count', 'membersCount') || members.length} miembros · ${v.recruitment || ''} ${v.verified ? '· ✔ Verificada' : ''}</div></div></div>
        <div style="margin-top:12px">${members.slice(0, 15).map((m) => `<div class="list-item"><span style="flex:1">${esc(m.username)}</span><span class="muted">${esc(m.role || '')}</span></div>`).join('')}</div>
        <button class="btn" style="margin-top:10px" data-url2="https://truckersmp.com/vtc/${esc(v.id)}">Ver en TruckersMP</button>`;
      $$('[data-url2]').forEach((b) => b.onclick = () => K.call('open', b.dataset.url2));
    });
  },
};

// ------------------------------------------------------------------ CUENTA (formulario reutilizable)
function authForm(prefix = 'a') {
  return `<div class="grid">
    <label class="field"><span>Correo</span><input type="email" id="${prefix}-email" autocomplete="email" placeholder="tucorreo@gmail.com"></label>
    <label class="field"><span>Contraseña</span><div class="row" style="flex-wrap:nowrap"><input type="password" id="${prefix}-pass" autocomplete="current-password" placeholder="Mínimo 6 caracteres"><button class="btn sm ghost" type="button" id="${prefix}-eye" title="Mostrar">👁</button></div></label>
    <div class="row"><button class="btn primary" id="${prefix}-login">Entrar</button><button class="btn teal" id="${prefix}-reg">Crear cuenta</button>
      <button class="btn sm ghost" id="${prefix}-forgot" style="margin-left:auto">¿Olvidaste la contraseña?</button></div>
    <div class="muted" style="font-size:12px">Solo necesitas un correo y una contraseña. Tu nombre de conductor lo puedes cambiar después.</div></div>`;
}
function bindAuthForm(root, prefix = 'a', after) {
  const v = (id) => ($(`#${prefix}-${id}`, root) || {}).value || '';
  const eye = $(`#${prefix}-eye`, root);
  if (!eye) return;
  eye.onclick = () => { const i = $(`#${prefix}-pass`, root); i.type = i.type === 'password' ? 'text' : 'password'; };
  const done = async (title) => { await refreshState(); renderSide(); toast({ title, body: 'Tus viajes, empresa y ranking se sincronizan solos', kind: 'money' }); if (after) after(); else render(); };
  const login = $(`#${prefix}-login`, root); login.onclick = () => act(login, async () => { await K.call('cloud:login', v('email').trim(), v('pass')); await done('¡Bienvenido de nuevo!'); });
  const reg = $(`#${prefix}-reg`, root); reg.onclick = () => act(reg, async () => { await K.call('cloud:register', v('email').trim(), v('pass'), ''); await done('¡Cuenta creada! 🎉'); });
  const fg = $(`#${prefix}-forgot`, root); fg.onclick = () => act(fg, async () => { await K.call('cloud:reset', v('email').trim()); toast({ title: 'Correo enviado 📧', body: 'Revisa tu bandeja para cambiar la contraseña' }); });
  $(`#${prefix}-pass`, root).onkeydown = (e) => { if (e.key === 'Enter') login.click(); };
}

// ------------------------------------------------------------------ AJUSTES
const OV_WIDGETS = [['speed', 'Velocidad'], ['limit', 'Límite de velocidad'], ['gear', 'Marcha'], ['cruise', 'Control de crucero'], ['rpm', 'Barra de RPM'], ['job', 'Carga y destino'],
  ['remaining', 'Distancia restante'], ['eta', 'Tiempo de llegada'], ['score', 'Puntuación'], ['damage', 'Daño de la carga'], ['fuel', 'Combustible'], ['clock', 'Hora del juego'], ['rest', 'Tiempo hasta descansar'], ['earnings', 'Ganado hoy'], ['nav', 'Guía hacia la parada (autobús)']];
const ACCENTS = ['#4C8DFF', '#19C3B1', '#FF9F1C', '#FF5A8A', '#9B7BFF', '#E2231A', '#2ECC71', '#F1C40F'];
const PAGE_SETTINGS = {
  id: 'settings',
  async html() {
    const s = S.data.settings; const p = S.profile;
    const games = await K.call('plugin:status').catch(() => ({}));
    S.pluginOk = Object.values(games || {}).some((x) => x && x.installed);
    const oc = await K.call('overlay:cfg').catch(() => null) || { widgets: {} };
    S.ovCfg = oc;
    const sw = (id, v, t, d) => `<div class="setting"><div><div>${t}</div><div class="d">${d}</div></div><label class="switch"><input type="checkbox" data-set="${id}" ${v ? 'checked' : ''}><i></i></label></div>`;
    const acct = !S.data.cloudReady ? `<div class="notice warn">El modo online aún no está configurado. Pega aquí la clave del servidor (Firebase → Configuración del proyecto → apiKey, empieza por <b>AIza</b>).</div>
        <div class="row" style="margin-top:12px;flex-wrap:nowrap"><input type="text" id="ck-key" placeholder="AIza..." autocomplete="off" spellcheck="false"><button class="btn primary" id="ck-save">Guardar</button></div>`
      : S.data.loggedIn ? `<div class="row between"><div><b>${esc((p.online && p.online.name) || '')}</b><div class="muted">${esc(S.data.email || '')}</div></div><button class="btn danger sm" id="logout">Cerrar sesión</button></div>
        <div class="muted" style="font-size:12px;margin-top:8px">La sesión se queda guardada: no tendrás que volver a entrar.</div>
        ${S.data.pending ? `<div class="notice" style="margin-top:12px">${S.data.pending} viaje(s) pendientes de subir. Se enviarán solos.</div>` : ''}`
      : authForm('a');
    const ui = s.ui || {};
    const tab = S.settingsTab || 'cuenta';
    const st = (id) => `data-stab="${id}"${tab === id ? '' : ' hidden'}`;
    return `<div class="page-head"><div><h1>Ajustes</h1><div class="subtitle">Rutero ${S.data.version}</div></div></div>
    <div class="tabs set-tabs">${SET_TABS.map(([k, n]) => `<button data-stabbtn="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="grid g2 set-grid">
      <div class="card" ${st('cuenta')}><h2>Cuenta online</h2>${acct}</div>
      <div class="card" ${st('cuenta')}><h2>Perfil</h2><div class="row" style="gap:14px;margin-bottom:14px">${avatar(p.photo, (p.online && p.online.name) || p.local.name, 72, 'linear-gradient(135deg,var(--accent),var(--accent2))', '#fff')}
        <div class="grid" style="gap:6px"><button class="btn sm" id="p-photo">📷 Cambiar foto</button>${p.photo ? '<button class="btn sm ghost" id="p-photo-del">Quitar foto</button>' : ''}</div></div><label class="field"><span>Nombre de conductor</span><div class="row" style="flex-wrap:nowrap"><input type="text" id="p-name" value="${esc((p.online && p.online.name) || p.local.name)}" maxlength="24"><button class="btn" id="p-save">Guardar</button></div></label></div>

      <div class="card span2" ${st('overlay')}><div class="card-title"><h2>Overlay en el juego</h2><div class="row">
        <button class="btn sm ${s.overlay ? 'danger' : 'primary'}" id="ov-toggle">${s.overlay ? 'Ocultar overlay' : 'Mostrar overlay'}</button><button class="btn sm ghost" id="ov-reset">Restablecer</button></div></div>
        <div class="muted" style="margin-bottom:12px">Funciona con el juego en <b>ventana sin bordes</b>. Atajo: <b>Ctrl + Mayús + K</b>. Los cambios se ven al momento.</div>
        <div class="grid g2">
          <div><h3>Qué mostrar</h3><div class="ov-checks">${OV_WIDGETS.map(([k, n]) => `<label class="ov-check"><input type="checkbox" data-ow="${k}" ${(k === 'nav' ? oc.widgets[k] !== false : oc.widgets[k]) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>
          <div class="grid" style="align-content:start;gap:12px">
            <label class="field"><span>Forma</span><select id="ov-layout"><option value="box" ${oc.layout !== 'bar' ? 'selected' : ''}>Caja</option><option value="bar" ${oc.layout === 'bar' ? 'selected' : ''}>Barra larga</option></select></label>
            <label class="field"><span>Posición</span><select id="ov-pos">${[['tl', 'Arriba a la izquierda'], ['tc', 'Arriba en el centro'], ['tr', 'Arriba a la derecha'], ['bl', 'Abajo a la izquierda'], ['bc', 'Abajo en el centro'], ['br', 'Abajo a la derecha'], ['free', 'Libre (arrástralo)']].map(([k, n]) => `<option value="${k}" ${oc.position === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="field"><span>Tamaño · <b id="ov-scale-v">${Math.round((oc.scale || 1) * 100)}%</b></span><input type="range" id="ov-scale" min="0.7" max="1.6" step="0.05" value="${oc.scale || 1}"></label>
            <label class="field"><span>Opacidad · <b id="ov-op-v">${Math.round((oc.opacity ?? .88) * 100)}%</b></span><input type="range" id="ov-op" min="0.35" max="1" step="0.05" value="${oc.opacity ?? .88}"></label>
            <label class="field"><span>Estilo</span><select id="ov-theme"><option value="dark" ${oc.theme === 'dark' ? 'selected' : ''}>Oscuro</option><option value="glass" ${oc.theme === 'glass' ? 'selected' : ''}>Cristal (transparente)</option><option value="light" ${oc.theme === 'light' ? 'selected' : ''}>Claro</option></select></label>
            <div class="field"><span>Color</span><div class="row" style="gap:8px">${ACCENTS.map((c) => `<button class="swatch ${oc.accent === c ? 'on' : ''}" data-oc="${c}" style="background:${c}"></button>`).join('')}<input type="color" id="ov-color" value="${esc(oc.accent || '#4C8DFF')}" class="swatch-pick"></div></div>
            <label class="row"><span class="switch"><input type="checkbox" id="ov-compact" ${oc.compact ? 'checked' : ''}><i></i></span> Modo compacto</label>
            <label class="row"><span class="switch"><input type="checkbox" id="ov-lock" ${oc.locked ? 'checked' : ''}><i></i></span> Bloquear (los clics pasan al juego)</label>
          </div></div></div>

      <div class="card span2" ${st('apariencia')}><h2>Apariencia</h2>
        <div class="setting"><div><div>Tema</div><div class="d">Oscuro, claro o según tu Windows</div></div><div class="tabs theme-pick">${[['dark', '🌙 Oscuro'], ['light', '☀️ Claro'], ['auto', '🖥️ Automático']].map(([k, n]) => `<button data-theme="${k}" class="${(ui.theme || 'dark') === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <div class="setting"><div><div>Color de la app</div><div class="d">Botones, menú y detalles</div></div><div class="row" style="gap:8px">${ACCENTS.map((c) => `<button class="swatch ${(ui.accent || '#4C8DFF') === c ? 'on' : ''}" data-ac="${c}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="setting"><div><div>Idioma</div><div class="d">Se elige solo según tu país. Puedes cambiarlo cuando quieras.</div></div><select id="ui-lang" style="width:200px"><option value="auto" ${(s.language || 'auto') === 'auto' ? 'selected' : ''}>Automático (según tu Windows)</option>${Object.entries(RI18N.LANGS).map(([k, n]) => `<option value="${k}" translate="no" ${s.language === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="setting"><div><div>Página al abrir</div><div class="d">Lo primero que ves al abrir Rutero</div></div><select id="ui-start" style="width:200px">${[['dash', 'Panel'], ['jobs', 'Trabajos'], ['company', 'Mi empresa'], ['ranking', 'Ranking'], ['tmp', 'TruckersMP']].map(([k, n]) => `<option value="${k}" ${(ui.start || 'dash') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="setting"><div><div>Tamaño del texto</div><div class="d">Agranda o achica toda la app</div></div><select id="ui-zoom" style="width:200px">${[[0.9, 'Pequeño'], [1, 'Normal'], [1.1, 'Grande'], [1.2, 'Muy grande']].map(([k, n]) => `<option value="${k}" ${(ui.zoom || 1) == k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      </div>
      <div class="card span2" ${st('juego')}><h2>Juego</h2>
        <div class="setting"><div><div>Unidades</div><div class="d">Automático: km/h en ETS2 y mph en ATS</div></div>
          <select id="units" style="width:200px"><option value="auto">Automático</option><option value="kmh">km/h</option><option value="mph">mph</option></select></div>
        ${sw('realisticEconomy', s.realisticEconomy, 'Economía realista', 'Solo cobras tu parte del pago (≈45 %, más con cargas peligrosas, pesadas o delicadas y menos con granel) y se descuentan multas, peajes, ferris y trenes')}
        ${sw('startWithWindows', s.startWithWindows, 'Iniciar con Windows', 'Rutero se abre minimizado en la bandeja')}
        ${sw('realPhotos', s.realPhotos, 'Fotos de internet para los autobuses', 'Para los autobuses sin imagen propia busca fotos libres en internet')}
      </div>

      <div class="card span2" ${st('comunidad')}><h2>Comunidad y ayuda</h2><div class="row" style="gap:10px">
        <button class="btn discord" id="st-discord">💬 Únete al Discord de Rutero</button><button class="btn" id="st-report">🚩 Reportar un error o a un jugador</button>
        ${S.data.links && S.data.links.website ? '<button class="btn ghost" id="st-web">🌐 Web de Rutero</button>' : ''}</div>
        <div class="muted" style="font-size:12px;margin-top:8px">En Discord puedes pedir ayuda, promocionar tu empresa, buscar convoyes y hablar con otros conductores.</div>
        ${discordLinkBox()}</div>
      <div class="card span2" id="bot-card" style="display:none" ${st('comunidad')}></div>
      <div class="card span2" ${st('sonido')}><h2>Notificaciones y entrada</h2>${sw('sounds', s.sounds, 'Notificaciones con sonido', 'Avisos de Windows al entregar, recibir multas o desbloquear logros')}
        <div class="setting"><div><div>Animación al abrir</div><div class="d">El logo de Rutero al entrar en la app</div></div><label class="switch"><input type="checkbox" id="ui-intro" ${ui.intro !== false ? 'checked' : ''}><i></i></label></div>
        <div class="setting"><div><div>Sonido al abrir</div><div class="d">Suena con la animación de entrada</div></div><div class="row"><button class="btn sm" id="snd-intro">▶ Escuchar</button><label class="switch"><input type="checkbox" id="ui-introsnd" ${ui.introSound !== false ? 'checked' : ''}><i></i></label></div></div></div>
      <div class="card span2" ${st('sonido')}><h2>🔊 Sonido de las puertas del autobús</h2><div class="muted" style="margin-bottom:12px">Suena al abrir y cerrar las puertas con la tecla del autobús. Pruébalo aquí:</div>
        <div class="row"><button class="btn" id="snd-open">🚪 Abrir puertas</button><button class="btn" id="snd-close">🚪 Cerrar puertas</button></div></div>
      <div class="card span2" id="upd-card" ${st('app')}>${updateCard()}</div>
      <div class="card span2" ${st('juego')}><h2>Plugin de telemetría</h2><div class="muted" style="margin-bottom:12px">Rutero lee los datos del juego con el plugin abierto <b>scs-sdk-plugin</b>. Cierra el juego antes de instalarlo.</div>
        ${['ets2', 'ats'].map((g) => { const x = games[g]; const nm = g === 'ets2' ? 'Euro Truck Simulator 2' : 'American Truck Simulator';
          return `<div class="setting"><div><div><b>${nm}</b></div><div class="d">${x ? esc(x.dir) : 'No encontrado en Steam'}</div></div>
          <div class="row">${x ? (x.installed ? '<span class="pill ok"><span class="dot"></span>Plugin instalado</span>' : '<span class="pill warn"><span class="dot"></span>Sin plugin</span>') : ''}
          ${x ? `<button class="btn sm ${x.installed ? '' : 'primary'}" data-install="${g}">${x.installed ? 'Reinstalar' : 'Instalar plugin'}</button>` : ''}<button class="btn sm ghost" data-choose="${g}">Elegir carpeta…</button></div></div>`; }).join('')}
        <div class="muted" id="plugin-log" style="font-size:12px;margin-top:6px"></div></div>
    </div>`;
  },
  mount(root) {
    bindUpdateCard();
    bindAuthForm(root, 'a');
    $('#st-discord').onclick = openDiscord;
    $$('[data-stabbtn]', root).forEach((b) => b.onclick = () => {
      S.settingsTab = b.dataset.stabbtn;
      $$('[data-stabbtn]', root).forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-stab]', root).forEach((el, i) => { const on = el.dataset.stab === S.settingsTab; el.hidden = !on; if (on) { el.style.setProperty('--i', i); el.classList.remove('tab-in'); void el.offsetWidth; el.classList.add('tab-in'); } });
    });
    $$('[data-theme]', root).forEach((b) => b.onclick = async () => { $$('[data-theme]', root).forEach((x) => x.classList.toggle('on', x === b)); const ui = { ...(S.data.settings.ui || {}), theme: b.dataset.theme }; await K.call('settings:set', { ui }); S.data.settings.ui = ui; applyUi(); });
    $('#snd-open').onclick = () => SFX.doorOpen(); $('#snd-close').onclick = () => SFX.doorClose(); $('#snd-intro').onclick = () => SFX.intro();
    const setUi = async (patch) => { const u = { ...(S.data.settings.ui || {}), ...patch }; await K.call('settings:set', { ui: u }); S.data.settings.ui = u; };
    $('#ui-intro').onchange = (e) => setUi({ intro: e.target.checked }); $('#ui-introsnd').onchange = (e) => setUi({ introSound: e.target.checked });
    $('#st-report').onclick = () => reportModal();
    bindDiscordLink(root);
    loadBotCard();
    const sw2 = $('#st-web'); if (sw2) sw2.onclick = () => K.call('open', S.data.links.website);
    $('#units').value = S.data.settings.units;
    $('#units').onchange = async (e) => { await K.call('settings:set', { units: e.target.value }); await refreshState(); };
    $$('[data-set]', root).forEach((c) => c.onchange = async () => { await K.call('settings:set', { [c.dataset.set]: c.checked }); if (c.dataset.set === 'realPhotos') S.photos = null; await refreshState(); });
    // overlay
    const saveOv = async (patch) => { S.ovCfg = { ...S.ovCfg, ...patch }; await K.call('settings:set', { overlayCfg: S.ovCfg }); };
    $('#ov-toggle').onclick = async () => { await K.call('settings:set', { overlay: !S.data.settings.overlay }); await refreshState(); render(); };
    $('#ov-reset').onclick = async () => { await K.call('overlay:reset'); render(); };
    $$('[data-ow]', root).forEach((c) => c.onchange = () => saveOv({ widgets: { ...S.ovCfg.widgets, [c.dataset.ow]: c.checked } }));
    $('#ov-pos').onchange = (e) => saveOv({ position: e.target.value, x: null, y: null });
    // barra larga: por defecto abajo en el centro
    $('#ov-layout').onchange = (e) => { const bar = e.target.value === 'bar'; const patch = { layout: e.target.value };
      if (bar && S.ovCfg.position !== 'free') { patch.position = 'bc'; patch.x = null; patch.y = null; $('#ov-pos').value = 'bc'; }
      saveOv(patch); };
    $('#ov-scale').oninput = (e) => { $('#ov-scale-v').textContent = `${Math.round(e.target.value * 100)}%`; saveOv({ scale: +e.target.value }); };
    $('#ov-op').oninput = (e) => { $('#ov-op-v').textContent = `${Math.round(e.target.value * 100)}%`; saveOv({ opacity: +e.target.value }); };
    $('#ov-theme').onchange = (e) => saveOv({ theme: e.target.value });
    $('#ov-compact').onchange = (e) => saveOv({ compact: e.target.checked });
    $('#ov-lock').onchange = (e) => saveOv({ locked: e.target.checked });
    const setOc = (c) => { $$('[data-oc]', root).forEach((b) => b.classList.toggle('on', b.dataset.oc === c)); saveOv({ accent: c }); };
    $$('[data-oc]', root).forEach((b) => b.onclick = () => setOc(b.dataset.oc));
    $('#ov-color').oninput = (e) => setOc(e.target.value);
    // personalizar app
    const saveUi = async (patch) => { const ui = { ...(S.data.settings.ui || {}), ...patch }; await K.call('settings:set', { ui }); S.data.settings.ui = ui; applyUi(); };
    $$('[data-ac]', root).forEach((b) => b.onclick = () => { $$('[data-ac]', root).forEach((x) => x.classList.toggle('on', x === b)); saveUi({ accent: b.dataset.ac }); });
    $('#ui-lang').onchange = async (e) => { await K.call('settings:set', { language: e.target.value }); location.reload(); };
    $('#ui-start').onchange = (e) => saveUi({ start: e.target.value });
    $('#ui-zoom').onchange = (e) => saveUi({ zoom: +e.target.value });
    $$('[data-install]', root).forEach((b) => b.onclick = () => act(b, async () => { await K.call('plugin:install', b.dataset.install); S.pluginOk = true; toast({ title: 'Plugin instalado ✅', body: 'Abre el juego y Rutero se conectará solo', kind: 'money' }); render(); }));
    $$('[data-choose]', root).forEach((b) => b.onclick = () => act(b, async () => { await K.call('plugin:choose', b.dataset.choose); render(); }));
    $('#p-photo').onclick = changePhoto;
    const pd = $('#p-photo-del'); if (pd) pd.onclick = async () => { S.profile = await K.call('profile:photo', ''); renderSide(); render(); };
    const ps = $('#p-save'); ps.onclick = () => act(ps, async () => { S.profile = await K.call('profile:name', $('#p-name').value.trim()); renderSide(); toast({ title: 'Nombre guardado', body: '' }); });
    const ck = $('#ck-save'); if (ck) ck.onclick = () => act(ck, async () => { await K.call('cloud:setKey', $('#ck-key').value); toast({ title: 'Servidor online conectado ✅', body: 'Ya puedes crear tu cuenta', kind: 'money' }); await refreshState(); render(); });
    const lo = $('#logout'); if (lo) lo.onclick = async () => { await K.call('cloud:logout'); await refreshState(); renderSide(); render(); };
  },
};
// colores y tamaño de la app
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + f)))); return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`; }
function applyUi() {
  const ui = (S.data && S.data.settings.ui) || {};
  const acc = ui.accent || '#4C8DFF';
  document.documentElement.style.setProperty('--accent', acc);
  document.documentElement.style.setProperty('--accent2', acc === '#4C8DFF' ? '#5A3DF0' : shade(acc, -0.28));
  document.body.style.zoom = ui.zoom || 1;
  const light = ui.theme === 'light' || (ui.theme === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.classList.toggle('light', light);
}
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (S.data) applyUi(); });

// ------------------------------------------------------------------ ACTUALIZACIONES
function updateCard() {
  const u = S.update || { status: 'idle', version: S.data.version };
  const st = {
    idle: ['', 'Pulsa el botón para comprobar si hay una versión nueva.'],
    dev: ['', 'Estás probando la app sin instalar: las actualizaciones funcionan en la versión instalada.'],
    checking: ['', 'Buscando actualizaciones…'],
    latest: ['ok', 'Tienes la última versión. ✔'],
    available: ['warn', `Hay una versión nueva: <b>${esc(u.available && u.available.version)}</b>`],
    downloading: ['warn', `Descargando… ${u.progress || 0}%`],
    ready: ['ok', 'Actualización descargada. Reinicia para instalarla.'],
    error: ['bad', `No se pudo comprobar: ${esc(u.error)}`],
  }[u.status] || ['', ''];
  return `<div class="row between"><div><h2 style="margin:0">Actualizaciones</h2><div class="muted" style="margin-top:4px">Versión instalada: <b>${esc(S.data.version)}</b></div></div>
    <div class="row">${u.status === 'available' ? '<button class="btn primary" id="upd-dl">⬇️ Descargar actualización</button>'
      : u.status === 'ready' ? '<button class="btn primary" id="upd-in">🔄 Reiniciar e instalar</button>'
      : `<button class="btn" id="upd-check" ${['checking', 'downloading'].includes(u.status) ? 'disabled' : ''}>🔍 Buscar actualizaciones</button>`}</div></div>
    <div class="notice ${st[0] === 'bad' ? 'warn' : ''}" style="margin-top:12px">${st[1]}</div>
    ${u.status === 'downloading' ? `<div class="bar" style="margin-top:10px;height:10px"><i style="width:${u.progress || 0}%"></i></div>` : ''}
    ${u.available && u.available.notes && ['available', 'downloading', 'ready'].includes(u.status) ? `<div class="muted" style="margin-top:10px;white-space:pre-wrap;font-size:13px">${esc(u.available.notes).slice(0, 800)}</div>` : ''}
    <div class="muted" style="font-size:12px;margin-top:10px">Solo se descarga lo nuevo y se instala sin perder tus datos. Rutero también lo comprueba solo al abrirse.</div>`;
}
function bindUpdateCard() {
  const c = $('#upd-card'); if (!c) return;
  c.innerHTML = updateCard();
  const on = (id, ch) => { const b = $(id); if (b) b.onclick = () => K.call(ch).catch(err); };
  on('#upd-check', 'update:check'); on('#upd-dl', 'update:download'); on('#upd-in', 'update:install');
}
function updatePill() {
  const u = S.update; const el = $('#tb-update'); if (!el) return;
  const show = u && ['available', 'downloading', 'ready'].includes(u.status);
  el.style.display = show ? '' : 'none';
  if (show) el.innerHTML = u.status === 'ready' ? '🔄 Reiniciar para actualizar' : u.status === 'downloading' ? `⬇️ ${u.progress || 0}%` : `⬆️ Versión ${esc(u.available.version)} disponible`;
}
K.on('update', (u) => { S.update = u; updatePill(); if (S.page === 'settings') bindUpdateCard(); });

const PAGES = { dash: PAGE_DASH, jobs: PAGE_JOBS, fines: PAGE_FINES, wallet: PAGE_WALLET, stats: PAGE_STATS, bus: PAGE_BUS, company: PAGE_COMPANY, ranking: PAGE_RANKING, achievements: PAGE_ACH, tmp: PAGE_TMP, settings: PAGE_SETTINGS };

// ------------------------------------------------------------------ eventos del proceso principal
function setStatusPill(st, mp, name) {
  const el = $('#tb-status');
  const map = { driving: ['ok', 'Conectado al juego'], paused: ['warn', 'Juego en pausa'], menu: ['warn', 'En el menú del juego'], waiting: ['', 'Esperando al juego'], 'plugin-version': ['bad', 'Plugin desactualizado'] };
  const [cls, txt] = map[st] || map.waiting;
  el.className = `pill ${cls}`; el.innerHTML = `<span class="dot"></span>${txt}`;
  $('#tb-mp').style.display = mp ? '' : 'none'; if (name) $('#tb-mp').textContent = name;
}
K.on('telemetry', (t) => {
  const was = S.live && S.live.status;
  S.live = t; setStatusPill(t.status, t.tmp, t.mpName);
  if (S.page === 'dash') { if (was !== t.status && $('#lv-unit')) $('#lv-unit').textContent = spdUnit(); updateLive(); }
});
K.on('status', (s) => { setStatusPill(s.status, s.tmp, s.mpName); if (S.live) S.live.status = s.status; if (S.page === 'dash' && s.status === 'waiting') { S.live = null; updateLive(); } });
K.on('toast', toast);
// sonidos de las puertas del autobús (aire comprimido + aviso), hechos con Web Audio
const SFX = (() => {
  let ctx;
  const ac = () => { ctx = ctx || new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  const hiss = (c, t, dur, from, to, vol) => {
    const len = Math.ceil(c.sampleRate * dur); const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t); src.stop(t + dur);
  };
  const tone = (c, t, freq, dur, vol, type = 'sine') => {
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  const thunk = (c, t) => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25); };
  return {
    doorOpen() { const c = ac(), t = c.currentTime + 0.02; tone(c, t, 784, 0.5, 0.18); tone(c, t + 0.28, 622, 0.7, 0.16); hiss(c, t + 0.15, 1.1, 2600, 900, 0.32); thunk(c, t + 1.15); },
    intro() { const c = ac(), t = c.currentTime + 0.05;
      hiss(c, t, 0.9, 300, 3200, 0.12);
      [[392, 0.35], [523.25, 0.5], [659.25, 0.62], [783.99, 0.8]].forEach(([f, d], i) => { tone(c, t + 0.35 + i * 0.11, f, d + 0.6, 0.11); tone(c, t + 0.35 + i * 0.11, f * 2, d, 0.03); });
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(110, t + 1.2);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1.7); },
    chime() { const c = ac(), t = c.currentTime + 0.02; tone(c, t, 880, 0.7, 0.16); tone(c, t + 0.32, 698.46, 0.9, 0.15); },
    doorClose() { const c = ac(), t = c.currentTime + 0.02; [0, 0.22, 0.44].forEach((d) => tone(c, t + d, 1050, 0.14, 0.14, 'square')); hiss(c, t + 0.6, 0.9, 900, 2400, 0.3); thunk(c, t + 1.45); },
  };
})();
// voz de las paradas (la del sistema: en Windows suele haber voz en español y en inglés)
function say({ text, lang, chime }) {
  try {
    if (!window.speechSynthesis || !text) return;
    if (chime) SFX.chime();
    const voices = speechSynthesis.getVoices();
    const want = lang === 'es' ? ['es-ES', 'es'] : ['en-GB', 'en-US', 'en'];
    const v = want.map((w) => voices.find((x) => x.lang === w || x.lang.replace('_', '-').startsWith(w))).find(Boolean);
    const u = new SpeechSynthesisUtterance(text);
    if (v) u.voice = v;
    u.lang = v ? v.lang : (lang === 'es' ? 'es-ES' : 'en-GB'); u.rate = 0.95; u.volume = 1;
    setTimeout(() => speechSynthesis.speak(u), chime ? 1100 : 0);
  } catch (e) { console.warn('voz', e); }
}
if (window.speechSynthesis) speechSynthesis.getVoices();
K.on('say', say);
K.on('sound', (k) => { try { if (SFX[k]) SFX[k](); } catch (e) { console.warn('sonido', e); } });
K.on('profile', (p) => { S.profile = p; renderSide(); });
K.on('bus', (b) => { S.bus = b; if (S.page === 'bus') updateBus(); });
K.on('trip', async () => { await refreshState(); renderSide(); if (['dash', 'jobs', 'stats', 'bus', 'achievements'].includes(S.page)) render(); });
K.on('plugin:log', (m) => { const el = $('#plugin-log'); if (el) el.textContent = m; });
$$('[data-win]').forEach((b) => b.onclick = () => K.call('win', b.dataset.win));
$('#tb-update').onclick = () => { if (S.update && S.update.status === 'ready') K.call('update:install'); else go('settings'); };
K.call('update:state').then((u) => { S.update = u; updatePill(); }).catch(() => {});

// animación de entrada con sonido
function playIntro() {
  const el = $('#intro'); if (!el) return;
  const ui = (S.data && S.data.settings.ui) || {};
  if (ui.intro === false || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return; }
  // la ventana se enseña un poco después de cargar (o al abrirla desde la bandeja): espera a que se vea
  if (document.visibilityState === 'hidden') { document.addEventListener('visibilitychange', function v() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', v); playIntro(); } }); return; }
  el.classList.add('play');
  if (ui.introSound !== false) { try { SFX.intro(); } catch { /* sin audio */ } }
  setTimeout(() => el.classList.add('out'), 2100);
  setTimeout(() => el.remove(), 2700);
}
(async () => {
  await refreshState();
  playIntro();
  RI18N.set(S.data.lang || 'es'); RI18N.start(document);
  applyUi();
  S.page = (S.data.settings.ui && S.data.settings.ui.start) || 'dash';
  renderSide();
  render();
  setStatusPill(S.data.status, false);
  if (!S.profile.local.name && !(S.profile.online && S.profile.online.name) && !S.data.loggedIn) {
    modal(`<div style="text-align:center"><img src="../../build/icon-256.png" width="96" alt=""><h1 style="margin:10px 0 6px">Bienvenido a Rutero</h1>
      <div class="muted">Tu compañero de ruta para ETS2 y ATS, conectado con TruckersMP.</div></div>
      <div style="margin-top:18px">${S.data.cloudReady ? `<h3 style="margin:0 0 10px">Crea tu cuenta o entra</h3>${authForm('w')}` : ''}
      <button class="btn ghost" id="w-skip" style="width:100%;margin-top:12px">Continuar sin cuenta</button>
      <div class="muted" style="font-size:12px;text-align:center;margin-top:8px">Después instala el plugin en Ajustes (solo la primera vez).</div></div>`, (bg, close) => {
      bindAuthForm(bg, 'w', () => { close(); render(); });
      $('#w-skip', bg).onclick = async () => { S.profile = await K.call('profile:name', 'Conductor'); renderSide(); close(); };
    });
  }
})();
