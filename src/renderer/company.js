/* Rutero — Mi empresa: panel con menú lateral propio (se carga antes de app.js; usa sus utilidades al ejecutarse) */

const needLogin = (what) => `<div class="card"><div class="empty"><div class="big">🔐</div><b>Inicia sesión para ${what}</b>
  <div class="muted" style="margin:6px 0 14px">Las empresas, el dinero compartido y el ranking funcionan con tu cuenta de Rutero.</div>
  <button class="btn primary" data-goto="settings">Ir a mi cuenta</button></div></div>`;
const noCloud = () => `<div class="card"><div class="empty"><div class="big">☁️</div><b>Falta conectar el servidor online</b>
  <div class="muted" style="margin-top:6px">El creador de la app tiene que rellenar <code>config/cloud.json</code> (mira la guía <b>docs/ONLINE.md</b>).</div></div></div>`;
// logos de marca (src/renderer/brands/<marca>.png)
const BRAND_LOGOS = ['Volvo', 'Iveco', 'DAF', 'MAN', 'Mercedes-Benz', 'Renault Trucks', 'Scania', 'Freightliner', 'Mack', 'Kenworth', 'International', 'Western Star', 'Peterbilt'];
const ROLE = { owner: 'Fundador', admin: 'Gerente', driver: 'Conductor' };
const DEFAULT_RANKS = [
  { name: 'Aprendiz', minKm: 0, color: '#8C97AD' }, { name: 'Conductor', minKm: 1000, color: '#19C3B1' },
  { name: 'Profesional', minKm: 10000, color: '#4C8DFF' }, { name: 'Veterano', minKm: 50000, color: '#9B7BFF' }, { name: 'Leyenda', minKm: 150000, color: '#FF9F1C' },
];

// ---------------------------------------------------------------- iconos del menú de empresa
const CI = (d) => `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">${d}</svg>`;
const CICONS = {
  discord: CI('<path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.6-3.6-13.6ZM8.5 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm7 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/>'),
  dashboard: CI('<path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/>'),
  settings: CI('<path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/>'),
  members: CI('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5z"/><circle cx="17" cy="9" r="2.7"/><path d="M17 13c3 0 5 2.1 5 5.5h-4.5c0-2.2-.7-4-2.1-5.3.5-.1 1-.2 1.6-.2z"/>'),
  roles: CI('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.9 3.1-6.5 7-6.5 1.6 0 3 .4 4.1 1.1L12 20z"/><path d="m14 21 1-4 5-5 3 3-5 5z"/>'),
  tags: CI('<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.6" fill="#141A2C"/>'),
  ranks: CI('<path d="M7 3h10v5a5 5 0 0 1-10 0z"/><path d="M5 4H2v2a4 4 0 0 0 4 4M19 4h3v2a4 4 0 0 1-4 4"/><path d="M10 14h4v3h3v4H7v-4h3z"/>'),
  requests: CI('<path d="M3 4h18v12H8l-5 4z"/><path d="M8 9h8M8 12h5" stroke="#141A2C" stroke-width="1.6"/>'),
  jobs: CI('<circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M6 15V9a3 3 0 0 1 3-3h6v2H9a1 1 0 0 0-1 1v6zM18 9v6a3 3 0 0 1-3 3H9v-2h6a1 1 0 0 0 1-1V9z"/>'),
  stats: CI('<path d="M3 20h18v2H3zM4 13l4-4 4 3 7-7 1.5 1.5L12 15l-4-3-2.6 2.6z"/>'),
  fines: CI('<path d="M12 2 1 21h22zm-1 7h2v6h-2zm0 8h2v2h-2z"/>'),
  balance: CI('<rect x="2" y="5" width="20" height="14" rx="3"/><rect x="14" y="10" width="8" height="4" rx="2" fill="#141A2C"/>'),
  garages: CI('<path d="M2 9 12 3l10 6v12h-3v-9H5v9H2z"/><path d="M7 14h10v2H7zm0 3h10v2H7z"/>'),
  fleet: CI('<path d="M1 6h13v10H1z"/><path d="M15 9h4l3 4v3h-7z"/><circle cx="5" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>'),
  dealer: CI('<path d="M3 4h18l-1.5 6H4.5z"/><path d="M5 11h14v9H5z"/><path d="M9 14h6v6H9z" fill="#141A2C"/>'),
  maintenance: CI('<path d="m14.7 6.3 3-3a5 5 0 0 1-6.4 6.4l-7 7a1.9 1.9 0 0 1-2.7-2.7l7-7a5 5 0 0 1 6.4-6.4l-3 3 .3 2.4z"/><path d="m14 15 5.5 5.5 2-2L16 13z"/>'),
  calendar: CI('<path d="M7 2h2v3H7zM15 2h2v3h-2z"/><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18" stroke="#141A2C" stroke-width="2"/>'),
  events: CI('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M6 11h3v3H6zm5 0h3v3h-3zm5 0h2v3h-2zM6 16h3v2H6zm5 0h3v2h-3z" fill="#141A2C"/>'),
  busroutes: CI('<path d="M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2z"/><path d="M5 6h14v5H5z" fill="#141A2C"/><circle cx="7.5" cy="14.5" r="1.3" fill="#141A2C"/><circle cx="16.5" cy="14.5" r="1.3" fill="#141A2C"/>'),
  news: CI('<path d="M3 4h14v16H5a2 2 0 0 1-2-2z"/><path d="M17 8h4v10a2 2 0 0 1-4 0z"/><path d="M6 8h8v2H6zm0 4h8v1.5H6zm0 3h5v1.5H6z" fill="#141A2C"/>'),
};
const CNAV = [
  ['Compañía', [['dashboard', 'Tablero de mandos', '#FF5A8A'], ['settings', 'Ajustes de compañía', '#FF5A8A', 'mgr'], ['discord', 'Discord', '#5865F2']]],
  ['Miembros', [['members', 'Miembros', '#9B7BFF'], ['roles', 'Roles', '#FF5A8A'], ['tags', 'Etiquetas', '#9B7BFF'], ['ranks', 'Rangos', '#19C3B1'], ['requests', 'Solicitudes', '#FF5A8A', 'mgr']]],
  ['Trabajos', [['jobs', 'Trabajos', '#9B7BFF'], ['busroutes', 'Rutas de bus', '#FF9F1C'], ['stats', 'Estadísticas', '#FF5A8A'], ['fines', 'Multas', '#FF9F1C']]],
  ['Flota y finanzas', [['balance', 'Saldo', '#19C3B1'], ['garages', 'Garajes', '#19C3B1'], ['fleet', 'Flota', '#FF5A8A'], ['dealer', 'Concesionario', '#4C8DFF'], ['maintenance', 'Mantenimiento', '#FF5A5F']]],
  ['Eventos', [['calendar', 'Calendario', '#9B7BFF'], ['events', 'Eventos', '#9B7BFF']]],
  ['Contenido', [['news', 'Noticias', '#FF5A8A']]],
];

// ---------------------------------------------------------------- utilidades
// ---- valoraciones, modo de entrada y requisitos
const joinModeOf = (c) => c.joinMode || (c.recruiting ? 'apply' : 'closed');
const MODE_PILL = { open: '<span class="pill ok">Pública</span>', apply: '<span class="pill warn">Con solicitud</span>', closed: '<span class="pill">Cerrada</span>' };
const ratingAvg = (c) => (c.ratingCount ? (c.ratingSum || 0) / c.ratingCount : 0);
function stars(v, size = 15) {
  return `<span class="stars" style="--v:${Math.max(0, Math.min(5, v)) / 5 * 100}%;font-size:${size}px" title="${v ? nf(v, 1) : ''}">★★★★★</span>`;
}
const ratingLine = (c) => c.ratingCount ? `${stars(ratingAvg(c))} <b class="mono">${nf(ratingAvg(c), 1)}</b> <span class="muted">(${c.ratingCount})</span>` : '<span class="muted" style="font-size:12px">Sin valoraciones</span>';
const GAME_NAMES = { any: 'Cualquiera', ets2: 'Euro Truck Simulator 2', ats: 'American Truck Simulator', both: 'ETS2 y ATS' };
function reqList(r = {}) {
  const p = S.profile || {}; const loc = p.local || {}; const on = p.online || {};
  const lvl = p.level || 1; const km = Math.max(loc.km || 0, on.km || 0);
  const out = [];
  if (r.minLevel > 1) out.push({ label: `Nivel ${r.minLevel} o más`, ok: lvl >= r.minLevel });
  if (r.minKm > 0) out.push({ label: `${nf(r.minKm)} km recorridos`, ok: km >= r.minKm });
  if (r.tmp) out.push({ label: 'Cuenta de TruckersMP enlazada', ok: !!(S.data.settings && S.data.settings.tmpId) });
  return out;
}
function reqHtml(r = {}) {
  const checks = reqList(r);
  const info = [];
  if (r.game && r.game !== 'any') info.push(['🎮', GAME_NAMES[r.game]]);
  if (r.language) info.push(['🗣️', r.language]);
  if (r.age) info.push(['🎂', `Edad mínima: ${r.age} años`]);
  if (!checks.length && !info.length && !r.note) return '<div class="muted">Sin requisitos: puede entrar cualquiera.</div>';
  return `<div class="req-list">${checks.map((x) => `<div class="req ${x.ok ? 'ok' : 'no'}"><span>${x.ok ? '✓' : '✗'}</span>${esc(x.label)}</div>`).join('')}
    ${info.map(([i, t]) => `<div class="req"><span>${i}</span>${esc(t)}</div>`).join('')}</div>
    ${r.note ? `<div class="muted" style="margin-top:8px;white-space:pre-wrap">${esc(r.note)}</div>` : ''}`;
}
function linkBtns(c) {
  return `${c.discord ? `<button class="btn sm discord" data-url="${esc(c.discord)}">💬 Discord</button>` : ''}${c.website ? `<button class="btn sm" data-url="${esc(c.website)}">🌐 Web</button>` : ''}`;
}

function loanCard(info, mgr) {
  const L = info.loan || {}; const owed = L.owed || 0;
  const rate = S.data.loanRate || 10; const auto = S.data.loanAutopay || 30;
  if (owed > 0) {
    const paid = Math.max(0, (L.total || owed) - owed); const pct = Math.round(paid / (L.total || owed) * 100);
    return `<div class="card loan"><h2>🏛️ Préstamo</h2><div class="row between"><span class="muted">Pedido ${money(L.amount || 0)} · ${esc(L.takenBy || '')}</span><b class="mono neg">Falta ${money(owed)}</b></div>
      <div class="bar" style="margin:10px 0"><i style="width:${pct}%;background:var(--teal)"></i></div><div class="muted" style="font-size:12px">Devuelto ${pct}% · se paga solo con el ${auto}% de cada comisión de entrega</div>
      ${mgr ? `<div class="row" style="margin-top:12px;flex-wrap:nowrap"><input type="number" id="loan-pay" min="1" max="${owed}" placeholder="Cantidad (máx. ${nf(owed)})"><button class="btn primary" id="loan-pay-btn">Devolver</button><button class="btn ghost" id="loan-pay-all">Todo</button></div>` : ''}</div>`;
  }
  return `<div class="card loan"><h2>🏛️ Pedir un préstamo</h2><div class="muted" style="margin-bottom:12px">El banco presta dinero a la empresa con un ${rate}% de interés. Se devuelve solo con el ${auto}% de cada comisión de entrega, o cuando quieras desde aquí.</div>
    ${mgr ? `<div class="grid g2">${(S.data.loanOptions || [100000, 250000, 500000, 1000000]).map((a) => `<button class="loan-opt" data-loan="${a}"><b>${money(a)}</b><span>Devuelves ${money(Math.round(a * (1 + rate / 100)))}</span></button>`).join('')}</div>` : '<div class="muted">Solo el fundador o un gerente pueden pedir préstamos.</div>'}</div>`;
}

function companyLogo(info, size = 74) {
  return `<div class="company-logo" style="width:${size}px;height:${size}px;background:${esc((info && info.color) || 'var(--accent)')};font-size:${Math.round(size / 3)}px;overflow:hidden">${info && info.logo ? `<img src="${esc(info.logo)}" style="width:100%;height:100%;object-fit:cover" alt="">` : esc((info && (info.tag || initials(info.name))) || '?')}</div>`;
}
async function loadPhotos() {
  if (S.photos) return S.photos;
  try { S.photos = await Promise.race([K.call('photos'), new Promise((r) => setTimeout(() => r(null), 12000))]); } catch { S.photos = null; }
  if (!S.photos) { S.photos = {}; setTimeout(() => { S.photos = null; }, 60000); }
  return S.photos;
}
// imagen del vehículo: foto propia (config/fotos) > foto real de internet (si está activado) > dibujo recortado
function vehImg(id, color, big = false) {
  const m = (S.data.shop || []).find((x) => x.id === id) || {};
  const ph = S.photos && S.photos[id];
  if (ph && ph.url) {
    return `<div class="veh-photo${big ? ' big' : ''}${ph.cutout ? ' cutout' : ''}" data-art="${esc(m.art || id)}" data-color="${esc(color)}"><img src="${esc(ph.url)}" alt="${esc(m.name || '')}" loading="lazy">
      ${ph.custom ? '' : `<a class="credit" data-url="${esc(ph.page || '')}" title="${esc(ph.author)} · ${esc(ph.license)}">📷 ${esc(ph.author)} · ${esc(ph.license)} · ${esc(ph.source || 'Wikimedia Commons')}</a>`}</div>`;
  }
  const cut = m.cut && window.vehicleCutout && vehicleCutout(m.cut, color || m.tint);
  if (cut) return `<div class="veh-cut${big ? ' big' : ''}">${cut}</div>`;
  return vehicleSvg(m.art || id, color);
}
function bindVehPhotos(root) {
  $$('.veh-photo img', root).forEach((img) => img.addEventListener('error', () => {
    const w = img.parentNode; if (w && w.parentNode) w.outerHTML = vehicleSvg(w.dataset.art, w.dataset.color);
  }, { once: true }));
  $$('.credit[data-url]', root).forEach((a) => a.onclick = (e) => { e.stopPropagation(); if (a.dataset.url) K.call('open', a.dataset.url); });
}
const colorInput = (id, v) => `<input type="color" id="${id}" value="${esc(v)}" style="height:42px;width:100%;background:var(--bg);border:1px solid var(--line);border-radius:10px">`;
const chip = (t) => `<span class="chip" style="--cc:${esc(t.color || '#4C8DFF')}">${esc(t.name)}</span>`;
const ranksOf = (info) => (info.ranks && info.ranks.length ? info.ranks : DEFAULT_RANKS).slice().sort((a, b) => a.minKm - b.minKm);
const rankFor = (info, km) => ranksOf(info).filter((r) => (km || 0) >= r.minKm).pop() || ranksOf(info)[0];
const kindIcon = (k) => ({ 'Autobús': '🚌', 'Remolque': '🚛', 'Camión': '🚚' }[k] || '🚚');
const condColor = (c) => (c >= 70 ? 'var(--teal)' : c >= 35 ? 'var(--amber)' : 'var(--red)');
const repairCost = (t) => Math.round((100 - (t.condition ?? 100)) / 100 * (t.price || 0) * 0.25);

// ---------------------------------------------------------------- página
const PAGE_COMPANY = {
  id: 'company',
  async html() {
    if (!S.data.cloudReady) return `<div class="page-head"><h1>Mi empresa</h1></div>${noCloud()}`;
    if (!S.data.loggedIn) return `<div class="page-head"><h1>Mi empresa</h1></div>${needLogin('crear o unirte a una empresa')}`;
    const me = S.profile.online || {};
    if (!me.companyId) { S.company = null; return companyLobby(me); }
    S.company = await K.call('company:get');
    const c = S.company; const info = c.info;
    if (!info) return '<div class="empty">No se ha podido cargar la empresa</div>';
    const myRole = (c.members.find((m) => m.id === me.uid) || {}).role || 'driver';
    const mgr = myRole !== 'driver';
    Object.assign(S, { myRole, mgr });
    S.accounts = [{ id: 'main', name: 'Banco principal', balance: info.balance || 0, color: info.color }, ...c.accounts];
    let sec = S.companyTab || 'dashboard';
    const allowed = CNAV.flatMap(([, items]) => items).filter((i) => i[3] !== 'mgr' || mgr).map((i) => i[0]);
    if (!allowed.includes(sec)) sec = 'dashboard';
    S.companyTab = sec;
    if (['dealer', 'fleet'].includes(sec)) await loadPhotos();
    const body = await SECTIONS[sec](c, info, me);
    const counts = { requests: c.requests.length, members: c.members.length, events: c.events.filter((e) => new Date(e.date) > Date.now()).length };
    return `<div class="cwrap">
      <aside class="cside">
        <div class="cside-logo">${companyLogo(info, 92)}<b>${esc(info.name)}</b><span class="muted">${ROLE[myRole]}</span></div>
        ${CNAV.map(([label, items]) => `<div class="clabel">${label}</div>` + items.filter((i) => i[3] !== 'mgr' || mgr).map(([id, name, color]) =>
          `<button class="citem ${sec === id ? 'on' : ''}" data-csec="${id}"><span class="cic" style="color:${color}">${CICONS[id]}</span>${name}${counts[id] && id !== 'members' ? `<span class="cbadge">${counts[id]}</span>` : ''}</button>`).join('')).join('')}
      </aside>
      <section class="cmain">${body}</section></div>`;
  },
  mount(root) { mountCompany(root); },
};

const head = (title, sub, right = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<div class="subtitle">${sub}</div>` : ''}</div>${right}</div>`;
const accSelect = (id, label = 'Desde la cuenta') => `<label class="field"><span>${label}</span><select id="${id}">${S.accounts.map((a) => `<option value="${a.id}">${esc(a.name)} · ${money(a.balance)}</option>`).join('')}</select></label>`;
const slotsInfo = (c) => {
  const used = c.fleet.filter((f) => f.kind === 'Camión' || f.kind === 'Autobús').length;
  const total = (S.data.baseSlots || 2) + c.garages.reduce((a, g) => a + (g.slots || 0), 0);
  return { used, total };
};

const SECTIONS = {
  // ---------------------------------------------------------- COMPAÑÍA
  async dashboard(c, info) {
    const sl = slotsInfo(c);
    const next = c.events.filter((e) => new Date(e.date) > Date.now()).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
    const weekAgo = Date.now() - 7 * 86400000;
    const weekJobs = c.jobs.filter((j) => new Date(j.finishedAt) > weekAgo);
    return `<div class="company-hero ${info.banner ? 'has-banner' : ''}" style="--c:${esc(info.color)}33;${info.banner ? `--banner:url('${esc(info.banner)}')` : ''}">${companyLogo(info, 78)}
      <div style="flex:1;min-width:0"><h1>${esc(info.name)} <span class="tag" style="vertical-align:middle">${esc(info.tag)}</span></h1>
      <div class="subtitle">${info.membersCount || c.members.length} conductores · fundada por ${esc(info.ownerName)} · comisión ${info.commission}%</div>
      <div class="row" style="margin-top:6px;gap:10px">${ratingLine(info)} ${MODE_PILL[joinModeOf(info)]} ${linkBtns(info)}<button class="btn sm ghost" data-cprof="${esc(info.id || S.profile.online.companyId)}">Ver ficha pública</button></div>
      ${info.description ? `<div class="muted" style="margin-top:6px;font-size:13px">${esc(info.description).slice(0, 200)}</div>` : ''}</div></div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><span class="k">Saldo</span><span class="v mono">${money(info.balance || 0)}</span></div>
      <div class="card stat"><span class="k">Distancia</span><span class="v mono">${dist(info.km || 0)}</span></div>
      <div class="card stat"><span class="k">Entregas</span><span class="v mono">${nf(info.jobs)}</span><span class="muted" style="font-size:12px">${weekJobs.length} esta semana</span></div>
      <div class="card stat"><span class="k">Flota</span><span class="v mono">${sl.used}<small>/ ${sl.total} plazas</small></span></div>
    </div>
    <div class="grid" style="grid-template-columns:3fr 2fr">
      <div class="card"><div class="card-title"><h2>Últimas entregas</h2><button class="btn sm ghost" data-csec="jobs">Ver todas</button></div>${jobsList(c.jobs.slice(0, 8))}</div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-title"><h2>Próximo evento</h2><button class="btn sm ghost" data-csec="events">Eventos</button></div>${next ? eventCard(next) : '<div class="muted">No hay eventos programados</div>'}</div>
        <div class="card"><div class="card-title"><h2>Top conductores</h2></div>${c.members.slice(0, 5).map((m, i) => `<div class="list-item"><span class="rank-pos">#${i + 1}</span>${avatar(m.photo, m.name, 32)}<span style="flex:1">${esc(m.name)}</span><b class="mono">${dist(m.km || 0)}</b></div>`).join('')}</div>
        <div class="card"><div class="card-title"><h2>Noticias</h2><button class="btn sm ghost" data-csec="news">Ver</button></div>${c.news.slice(0, 2).map((n) => `<div class="list-item"><div style="flex:1"><b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b><div class="muted" style="font-size:12px">${esc(n.author)} · ${ago(n.at)}</div></div></div>`).join('') || '<div class="muted">Sin noticias</div>'}</div>
      </div></div>`;
  },
  async settings(c, info) {
    const owner = S.myRole === 'owner';
    return head('Ajustes de compañía', 'Imagen, datos, comisión e invitaciones') + `<div class="grid g2">
      <div class="card"><h2>Identidad</h2><div class="grid">
        <div class="row" style="gap:14px"><div id="logo-prev">${companyLogo(info, 80)}</div><div class="grid" style="gap:6px"><button class="btn sm" id="e-logo">📷 Cambiar logo</button>${info.logo ? '<button class="btn sm ghost" id="e-logo-del">Quitar logo</button>' : ''}</div></div>
        <div class="grid g2"><label class="field"><span>Nombre</span><input type="text" id="e-name" value="${esc(info.name)}" maxlength="40" ${owner ? '' : 'disabled'}></label><label class="field"><span>Siglas</span><input type="text" id="e-tag" maxlength="5" value="${esc(info.tag)}"></label></div>
        <label class="field"><span>Descripción</span><textarea id="e-desc" rows="5" maxlength="1000">${esc(info.description)}</textarea></label>
        <div class="grid g2"><label class="field"><span>Discord</span><input type="text" id="e-discord" value="${esc(info.discord || '')}" placeholder="https://discord.gg/…"></label><label class="field"><span>Web</span><input type="text" id="e-web" value="${esc(info.website || '')}" placeholder="https://…"></label></div>
        <div class="grid g2"><label class="field"><span>Comisión por entrega (%)</span><input type="number" id="e-com" min="0" max="50" value="${info.commission}"></label><label class="field"><span>Color</span>${colorInput('e-color', info.color)}</label></div>
        <button class="btn primary" id="e-save">Guardar cambios</button></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><h2>Banner</h2><div class="muted" style="margin-bottom:10px">Imagen panorámica que se ve arriba en la ficha de la empresa (se recorta a 1200×300).</div>
          <div class="banner-prev" style="${info.banner ? `background-image:url('${esc(info.banner)}')` : `background:${esc(info.color)}33`}">${info.banner ? '' : '<span class="muted">Sin banner</span>'}</div>
          <div class="row" style="margin-top:10px"><button class="btn sm" id="e-banner">🖼️ Subir banner</button>${info.banner ? '<button class="btn sm ghost" id="e-banner-del">Quitar banner</button>' : ''}</div></div>
        <div class="card"><h2>Entrada de conductores</h2><div class="grid">
          <label class="field"><span>Cómo se entra</span><select id="pp-mode">
            <option value="open" ${joinModeOf(info) === 'open' ? 'selected' : ''}>Pública: entra quien quiera (si cumple los requisitos)</option>
            <option value="apply" ${joinModeOf(info) === 'apply' ? 'selected' : ''}>Con solicitud: un gerente tiene que aceptarla</option>
            <option value="closed" ${joinModeOf(info) === 'closed' ? 'selected' : ''}>Cerrada: solo con código de invitación</option></select></label>
          <div class="grid g2"><label class="field"><span>Nivel mínimo</span><input type="number" id="pp-lvl" min="0" max="200" value="${(info.requirements || {}).minLevel || 0}"></label>
            <label class="field"><span>Kilómetros mínimos</span><input type="number" id="pp-km" min="0" step="500" value="${(info.requirements || {}).minKm || 0}"></label></div>
          <div class="grid g2"><label class="field"><span>Juego</span><select id="pp-game">${Object.entries(GAME_NAMES).map(([k, n]) => `<option value="${k}" ${((info.requirements || {}).game || 'any') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="field"><span>Edad mínima</span><input type="number" id="pp-age" min="0" max="99" value="${(info.requirements || {}).age || 0}"></label></div>
          <label class="field"><span>Idiomas</span><input type="text" id="pp-lang" maxlength="40" value="${esc((info.requirements || {}).language || '')}" placeholder="Español, inglés…"></label>
          <label class="row"><span class="switch"><input type="checkbox" id="pp-tmp" ${(info.requirements || {}).tmp ? 'checked' : ''}><i></i></span> Obligatorio tener cuenta de TruckersMP</label>
          <label class="field"><span>Otros requisitos</span><textarea id="pp-note" rows="2" maxlength="300" placeholder="Micrófono para los convoyes, mínimo 2 convoyes al mes…">${esc((info.requirements || {}).note || '')}</textarea></label>
          <label class="field"><span>Normas de la empresa</span><textarea id="pp-rules" rows="6" maxlength="3000" placeholder="1. Respeta a todos los conductores&#10;2. Nada de ramming en TruckersMP&#10;3. …">${esc(info.rules || '')}</textarea></label>
          <button class="btn primary" id="pp-save">Guardar entrada y normas</button></div></div>
        <div class="card"><h2>Código de invitación</h2><div class="muted" style="margin-bottom:12px">Quien lo use entra directamente y la empresa recibe ${money(300000)}.</div>
          <div class="row"><span class="code-box">${esc(info.joinCode)}</span><button class="btn" id="code-copy">Copiar</button>${owner ? '<button class="btn" id="code-new">Generar otro</button>' : ''}</div></div>
        <div class="card"><h2>Zona peligrosa</h2><div class="muted" style="margin-bottom:12px">${owner ? 'Si eres el único miembro, al salir se cierra la empresa. Si hay más, cede antes la empresa a otro miembro.' : 'Puedes salir de la empresa cuando quieras.'}</div><button class="btn danger" id="c-leave">Salir de la empresa</button></div>
      </div></div>`;
  },
  // ---------------------------------------------------------- MIEMBROS
  async members(c, info, me) {
    const mgr = S.mgr; const owner = S.myRole === 'owner';
    const roles = info.roles || []; const tags = info.tags || [];
    return head('Miembros', `${c.members.length} conductores en la empresa`) + `<div class="card"><table><thead><tr><th>Conductor</th><th>Rol</th><th>Rango</th><th class="num">Distancia</th><th class="num">Ha ganado</th><th class="num">Aportado</th><th class="num">Sueldo</th><th class="num">Multas</th><th></th></tr></thead><tbody>
      ${c.members.map((m) => { const rk = rankFor(info, m.km); const role = roles.find((r) => r.name === m.title);
        return `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap;cursor:pointer" data-mview="${m.id}">${avatar(m.photo, m.name, 34)}<div><b>${esc(m.name)}</b>${m.id === me.uid ? ' <span class="pill">Tú</span>' : ''}
          <div class="row" style="gap:4px;margin-top:3px">${(m.tags || []).map((t) => chip(tags.find((x) => x.name === t) || { name: t })).join('')}</div></div></div></td>
        <td>${role ? chip(role) : ''}<div class="muted" style="font-size:11px;margin-top:2px">${ROLE[m.role] || m.role}</div></td>
        <td><span style="color:${esc(rk.color)};font-weight:600">${esc(rk.name)}</span></td>
        <td class="num">${dist(m.km || 0)}<br><span class="muted">${nf(m.jobs)} entregas</span></td><td class="num pos">${money(m.driverEarned || 0)}</td><td class="num">${money(m.earned || 0)}</td>
        <td class="num">${m.salaryPerKm || m.salaryPerJob ? `${nf(m.salaryPerKm, 2)}/km${m.salaryPerJob ? `<br><span class="muted">+${money(m.salaryPerJob)}</span>` : ''}` : '<span class="muted">—</span>'}</td>
        <td class="num ${m.finesCount ? 'neg' : ''}">${m.finesCount || 0}</td>
        <td class="num"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:nowrap">
          ${m.id !== me.uid ? `<button class="btn sm" data-send="${m.id}" title="Enviar dinero de tu cartera">💸</button>` : ''}
          ${mgr ? `<button class="btn sm" data-manage="${m.id}">Gestionar ▾</button>` : ''}
        </div></td></tr>`; }).join('')}</tbody></table></div>`;
  },
  async roles(c, info) {
    const roles = info.roles || [];
    return head('Roles', 'Puestos de la empresa (Jefe de tráfico, Instructor, Conductor de convoy…)', S.mgr ? '<button class="btn primary" id="role-new">＋ Nuevo rol</button>' : '') +
      `<div class="notice" style="margin-bottom:16px">Los permisos los dan los niveles fijos: <b>Fundador</b> (todo), <b>Gerente</b> (gestiona miembros, dinero y flota) y <b>Conductor</b>. Los roles personalizados son el puesto que se muestra en la empresa.</div>
      <div class="grid g3">${roles.map((r, i) => `<div class="card"><div class="row between">${chip(r)}${S.mgr ? `<button class="btn sm ghost" data-delrole="${i}">Borrar</button>` : ''}</div>
        <div class="muted" style="margin-top:10px">${esc(r.desc || 'Sin descripción')}</div><div class="muted" style="font-size:12px;margin-top:8px">${c.members.filter((m) => m.title === r.name).length} miembros</div></div>`).join('') || '<div class="card"><div class="empty">Aún no hay roles. Crea el primero.</div></div>'}</div>`;
  },
  async tags(c, info) {
    const tags = info.tags || [];
    return head('Etiquetas', 'Marca a tus conductores: Convoy, Bus, Nocturno, ProMods…', S.mgr ? '<button class="btn primary" id="tag-new">＋ Nueva etiqueta</button>' : '') +
      `<div class="card">${tags.map((t, i) => `<div class="list-item">${chip(t)}<span class="muted" style="flex:1">${c.members.filter((m) => (m.tags || []).includes(t.name)).map((m) => esc(m.name)).join(', ') || 'Nadie'}</span>${S.mgr ? `<button class="btn sm ghost" data-deltag="${i}">Borrar</button>` : ''}</div>`).join('') || '<div class="empty">No hay etiquetas</div>'}
      <div class="muted" style="margin-top:10px;font-size:12px">Para poner etiquetas a un conductor ve a Miembros → Editar.</div></div>`;
  },
  async ranks(c, info) {
    const ranks = ranksOf(info);
    return head('Rangos', 'Se consiguen automáticamente con los kilómetros recorridos en la empresa', S.mgr ? '<button class="btn primary" id="rank-new">＋ Nuevo rango</button>' : '') +
      `<div class="grid g2"><div class="card">${ranks.map((r, i) => `<div class="list-item"><span class="rank-dot" style="background:${esc(r.color)}"></span><b style="flex:1;color:${esc(r.color)}">${esc(r.name)}</b><span class="muted">desde ${dist(r.minKm)}</span>
        ${S.mgr && info.ranks && info.ranks.length ? `<button class="btn sm ghost" data-delrank="${i}">Borrar</button>` : ''}</div>`).join('')}
        ${!(info.ranks && info.ranks.length) ? '<div class="muted" style="margin-top:8px;font-size:12px">Son los rangos por defecto. Crea uno para personalizarlos.</div>' : ''}</div>
      <div class="card"><h2>Conductores por rango</h2>${ranks.slice().reverse().map((r) => { const ms = c.members.filter((m) => rankFor(info, m.km).name === r.name);
        return `<div style="margin-bottom:12px"><div style="color:${esc(r.color)};font-weight:700">${esc(r.name)} <span class="muted">(${ms.length})</span></div><div class="row" style="gap:6px;margin-top:6px">${ms.map((m) => avatar(m.photo, m.name, 28)).join('') || '<span class="muted">—</span>'}</div></div>`; }).join('')}</div></div>`;
  },
  async requests(c) {
    return head('Solicitudes', 'Conductores que quieren entrar en la empresa') + `<div class="card">${c.requests.length ? c.requests.map((r) => `<div class="list-item">${avatar(r.photo, r.name, 44)}
      <div style="flex:1"><b>${esc(r.name)}</b><div class="muted" style="font-size:12px">${dist(r.km || 0)} · ${nf(r.jobs)} entregas · ${ago(r.at)}</div>${r.message ? `<div style="margin-top:4px">“${esc(r.message)}”</div>` : ''}</div>
      <button class="btn sm teal" data-accept="${r.id}">Aceptar</button><button class="btn sm danger" data-reject="${r.id}">Rechazar</button></div>`).join('') : '<div class="empty"><div class="big">📭</div>No hay solicitudes pendientes</div>'}
      <div class="notice" style="margin-top:12px">Al aceptar, el conductor entra la próxima vez que abra Rutero y la empresa recibe ${money(300000)}.</div></div>`;
  },
  // ---------------------------------------------------------- TRABAJOS
  async jobs(c) {
    const f = S.cjobDriver || '';
    const list = c.jobs.filter((j) => !f || j.driverUid === f);
    S.cjobsView = list;
    return head('Trabajos', 'Todas las entregas de los conductores de la empresa', `<select id="cj-driver" style="width:220px"><option value="">Todos los conductores</option>${c.members.map((m) => `<option value="${m.id}" ${f === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`) +
      `<div class="card">${list.length ? `<table><thead><tr><th>Fecha</th><th>Conductor</th><th>Carga</th><th>Ruta</th><th class="num">Distancia</th><th class="num">Aporte</th><th class="num">Multas</th><th class="num">Puntos</th></tr></thead><tbody>
      ${list.map((j, i) => `<tr class="click" data-cjob="${i}"><td class="muted">${dateStr(j.finishedAt)}</td><td><b>${esc(j.driverName)}</b></td><td>${j.type === 'bus' ? '🚌 ' : ''}${esc(j.cargo)}${j.multiplayer ? ' <span class="pill mp" style="padding:1px 7px">MP</span>' : ''}</td>
        <td>${esc(j.from)} → ${esc(j.to)}</td><td class="num">${dist(j.km || 0)}</td><td class="num pos">${money(j.companyCut || 0, j.game)}</td><td class="num">${j.fineCount || 0}</td><td class="num">${j.score ?? '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="big">🛣️</div>Aún no hay entregas</div>'}</div>`;
  },
  async stats(c, info) {
    const days = [...Array(30)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 29 + i); return d; });
    const byDay = (fn) => days.map((d) => c.jobs.filter((j) => { const t = new Date(j.finishedAt); return t >= d && t < new Date(d.getTime() + 86400000); }).reduce((a, j) => a + fn(j), 0));
    const labels = days.map((d) => d.getDate());
    const del = c.jobs.filter((j) => j.status === 'delivered');
    const top = (fn) => Object.entries(del.reduce((a, j) => { const k = fn(j); if (k) a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const avg = del.length ? Math.round(del.reduce((a, j) => a + (j.score || 0), 0) / del.length) : 0;
    const mp = del.filter((j) => j.multiplayer).length;
    return head('Estadísticas', 'Últimos 30 días de la empresa') + `<div class="grid g4" style="margin-bottom:16px">
      <div class="card stat"><span class="k">Entregas (30 d)</span><span class="v mono">${del.length}</span></div>
      <div class="card stat"><span class="k">Puntuación media</span><span class="v mono">${avg}<small>/100</small></span></div>
      <div class="card stat"><span class="k">En TruckersMP</span><span class="v mono">${del.length ? Math.round(mp / del.length * 100) : 0}<small>%</small></span></div>
      <div class="card stat"><span class="k">Multas (recientes)</span><span class="v mono">${c.fines.length}</span></div></div>
    <div class="grid g2">
      <div class="card"><h2>Kilómetros por día</h2>${barChart(byDay((j) => j.km || 0), labels, '#4C8DFF', (v) => dist(v))}</div>
      <div class="card"><h2>Ingresos para la empresa</h2>${barChart(byDay((j) => Math.max(0, j.companyCut || 0)), labels, '#19C3B1', (v) => money(v))}</div>
      <div class="card"><h2>Distancia por conductor</h2>${barChart(c.members.slice(0, 12).map((m) => m.km || 0), c.members.slice(0, 12).map((m) => m.name.slice(0, 6)), '#9B7BFF', (v) => dist(v))}</div>
      <div class="card"><h2>Cargas más transportadas</h2>${top((j) => j.cargo).map(([k, v]) => `<div class="list-item"><span style="flex:1">${esc(k)}</span><b class="mono">${v}</b></div>`).join('') || '<div class="empty">Sin datos</div>'}</div>
    </div>`;
  },
  async fines(c) {
    const total = c.fines.reduce((a, f) => a + (f.amount || 0), 0);
    return head('Multas', 'Sanciones recibidas por los conductores de la empresa') + `<div class="grid g3" style="margin-bottom:16px"><div class="card stat"><span class="k">Multas recientes</span><span class="v mono">${c.fines.length}</span></div>
      <div class="card stat"><span class="k">Importe</span><span class="v mono neg">${money(-total)}</span></div>
      <div class="card stat"><span class="k">Más multado</span><span class="v" style="font-size:20px">${esc(([...c.members].sort((a, b) => (b.finesCount || 0) - (a.finesCount || 0))[0] || {}).name || '—')}</span></div></div>
      <div class="card">${c.fines.length ? `<table><thead><tr><th>Fecha</th><th>Conductor</th><th>Infracción</th><th>Viaje</th><th class="num">Velocidad</th><th class="num">Importe</th></tr></thead><tbody>
      ${c.fines.map((f) => `<tr><td class="muted">${dateStr(f.at)}</td><td><b>${esc(f.driverName)}</b></td><td>🚨 ${esc(fineName(f.offence))}</td><td class="muted">${esc(f.cargo)}${f.route ? '<br>' + esc(f.route) : ''}</td>
        <td class="num">${f.speed ? `${spd(f.speed)}${f.limit ? ' / ' + spd(f.limit) : ''}` : '—'}</td><td class="num neg">${money(-f.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="big">😇</div>Ninguna multa en la empresa</div>'}</div>`;
  },
  // ---------------------------------------------------------- FLOTA Y FINANZAS
  async balance(c, info) {
    const mgr = S.mgr;
    return head('Saldo', 'Banco principal, cuentas y movimientos') + `<div class="grid g3" style="margin-bottom:16px">${S.accounts.map((a) => `<div class="card" style="border-top:3px solid ${esc(a.color || 'var(--accent)')}">
        <div class="row between"><span class="muted">${a.id === 'main' ? '🏦' : '💼'} ${esc(a.name)}</span>${mgr && a.id !== 'main' ? `<button class="btn sm ghost" data-close-acc="${a.id}">Cerrar</button>` : ''}</div>
        <div class="stat" style="margin-top:6px"><span class="v mono">${money(a.balance || 0)}</span></div></div>`).join('')}
      ${mgr ? '<div class="card flat" style="display:grid;place-items:center"><button class="btn" id="acc-new">＋ Crear cuenta</button><div class="muted" style="font-size:12px;margin-top:6px">Salarios, flota, ahorro…</div></div>' : ''}</div>
      <div class="grid g2"><div class="grid" style="align-content:start">
        <div class="card"><h2>Ingresar de mi cartera</h2><div class="grid g2"><label class="field"><span>Cantidad</span><input type="number" id="dep-amt" min="1" placeholder="Tienes ${money(S.profile.wallet)}"></label>${accSelect('dep-to', 'A la cuenta')}</div>
          <button class="btn teal" id="dep-btn" style="margin-top:12px">Ingresar</button></div>
        ${mgr ? `<div class="card"><h2>Mover dinero entre cuentas</h2><div class="grid g2">${accSelect('mv-from', 'Desde')}${accSelect('mv-to', 'Hacia')}</div>
          <div class="row" style="margin-top:12px;flex-wrap:nowrap"><input type="number" id="mv-amt" min="1" placeholder="Cantidad"><button class="btn primary" id="mv-btn">Mover</button></div></div>` : ''}
        ${loanCard(info, mgr)}
        <div class="card"><h2>Cómo entra el dinero</h2><div class="muted">• ${info.commission}% de cada entrega<br>• ${money(300000)} por cada conductor nuevo<br>• Ingresos de los miembros y ventas</div></div></div>
      <div class="card"><h2>Movimientos</h2>${c.bank.map((b) => `<div class="list-item"><div class="avatar">${{ commission: '📦', bonus: '💸', salary: '💼', purchase: '🛒', sale: '🏷️', deposit: '🏦', joinbonus: '🎉', move: '🔁', repair: '🔧', info: 'ℹ️', loan: '🏛️', loanpay: '🏛️' }[b.kind] || '•'}</div>
        <div style="flex:1">${esc(b.note)}<div class="muted" style="font-size:12px">${esc(b.by)} · ${ago(b.at)}</div></div><b class="mono ${b.amount >= 0 ? 'pos' : 'neg'}">${b.amount ? (b.amount > 0 ? '+' : '') + money(b.amount) : ''}</b></div>`).join('') || '<div class="empty">Sin movimientos</div>'}</div></div>`;
  },
  async garages(c) {
    const sl = slotsInfo(c); const G = S.data.garages || {};
    return head('Garajes', 'Cada garaje da plazas para camiones y autobuses') + `<div class="card" style="margin-bottom:16px"><div class="row between"><b>Plazas ocupadas</b><span class="mono">${sl.used} / ${sl.total}</span></div>
      <div class="bar ${sl.used >= sl.total ? 'red' : ''}" style="margin-top:8px;height:12px"><i style="width:${Math.min(100, sl.used / Math.max(1, sl.total) * 100)}%"></i></div>
      <div class="muted" style="font-size:12px;margin-top:6px">La empresa tiene ${S.data.baseSlots || 2} plazas gratis en la sede. Los remolques no ocupan plaza.</div></div>
    <div class="grid" style="grid-template-columns:2fr 1fr">
      <div class="grid g2" style="align-content:start">${c.garages.map((g) => { const parked = c.fleet.filter((f) => f.garageId === g.id);
        return `<div class="card"><div style="border-radius:12px;overflow:hidden;margin-bottom:12px">${vehicleSvg(g.size === 'big' ? 'hq' : 'garage', S.company.info.color)}</div>
        <div class="row between"><h2 style="margin:0">📍 ${esc(g.city)}</h2><span class="pill">${esc((G[g.size] || {}).name || g.size)}</span></div>
        <div class="muted" style="margin:6px 0">${parked.length} / ${g.slots} vehículos aparcados</div>
        <div class="row" style="gap:6px">${parked.map((f) => `<span class="chip">${kindIcon(f.kind)} ${esc(f.model)}</span>`).join('')}</div>
        ${S.mgr ? `<button class="btn sm danger" style="margin-top:10px" data-sellg="${g.id}">Vender (${money(Math.round(g.price * .6))})</button>` : ''}</div>`; }).join('') || '<div class="card span2"><div class="empty"><div class="big">🏗️</div>Todavía no hay garajes</div></div>'}</div>
      ${S.mgr ? `<div class="card" style="align-self:start"><h2>Comprar garaje</h2><div class="grid">
        <label class="field"><span>Ciudad</span><input type="text" id="g-city" placeholder="Madrid"></label>
        <label class="field"><span>Tamaño</span><select id="g-size">${Object.entries(G).map(([k, g]) => `<option value="${k}">${g.name[0].toUpperCase() + g.name.slice(1)} · ${g.slots} plazas · ${money(g.price)}</option>`).join('')}</select></label>
        ${accSelect('g-from', 'Pagar desde')}<button class="btn primary" id="g-buy">Comprar garaje</button></div></div>` : ''}</div>`;
  },
  async fleet(c, info) {
    const sl = slotsInfo(c);
    return head('Flota', `${c.fleet.length} vehículos · ${sl.used}/${sl.total} plazas ocupadas`, '<button class="btn primary" data-csec="dealer">🛒 Ir al concesionario</button>') +
      (c.fleet.length ? `<div class="grid g3">${c.fleet.map((f) => `<div class="card shop-item">${vehImg(f.modelId, f.color || info.color)}
        <span class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase">${kindIcon(f.kind)} ${esc(f.kind)}</span><b>${esc(f.model)}</b>
        ${f.kind !== 'Remolque' ? `<div><div class="row between" style="font-size:12px"><span class="muted">Estado</span><b style="color:${condColor(f.condition ?? 100)}">${Math.round(f.condition ?? 100)}%</b></div>
          <div class="bar" style="margin-top:4px"><i style="width:${f.condition ?? 100}%;background:${condColor(f.condition ?? 100)}"></i></div></div>` : ''}
        <div class="muted" style="font-size:12px">${f.assignedTo ? '👤 ' + esc(f.assignedTo) : 'Sin asignar'} · ${f.garageId ? '📍 ' + esc((c.garages.find((g) => g.id === f.garageId) || {}).city || 'Garaje') : 'En la sede'} · ${dist(f.km || 0)}</div>
        ${S.mgr ? `<div class="row" style="gap:6px"><button class="btn sm" data-assign="${f.id}">Asignar</button>${f.kind !== 'Remolque' ? `<button class="btn sm" data-park="${f.id}">Aparcar</button>` : ''}<button class="btn sm danger" data-sell="${f.id}">Vender</button></div>` : ''}</div>`).join('')}</div>`
        : '<div class="card"><div class="empty"><div class="big">🅿️</div>El garaje está vacío. ¡Compra el primer vehículo en el concesionario!</div></div>');
  },
  async dealer(c, info) {
    const shop = S.data.shop; const brandsInfo = S.data.brands || {};
    const cat = S.dealerCat || 'Camión';
    const game = S.dealerGame || (gameOf() === 'ats' ? 'ats' : 'ets2');
    const pool = shop.filter((m) => m.kind === cat && (cat !== 'Camión' || m.game === game));
    const brands = [...new Set(pool.map((m) => m.brand).filter(Boolean))].sort((a, b) => (pool.some((m) => m.brand === a && m.soon) - pool.some((m) => m.brand === b && m.soon)) || a.localeCompare(b));
    let brand = S.dealerBrand;
    if (brands.length && !brands.includes(brand)) brand = brands[0];
    S.dealerBrand = brand;
    const hasImg = (m) => (S.photos && S.photos[m.id] && S.photos[m.id].url ? 0 : 1);
    const models = (brands.length ? pool.filter((m) => m.brand === brand) : pool).slice().sort((a, b) => hasImg(a) - hasImg(b));
    const sl = slotsInfo(c);
    return head('Concesionario', `Saldo ${money(info.balance || 0)} · plazas ${sl.used}/${sl.total}`, '<button class="btn sm ghost" id="ph-refresh" title="Vuelve a buscar las fotos en internet">🔄 Buscar fotos de nuevo</button>') +
      `<div class="row" style="margin-bottom:16px"><div class="tabs dealer-tabs">${[['Camión', 'Camiones'], ['Autobús', 'Autobuses'], ['Remolque', 'Remolques']].map(([k, n]) => `<button data-dcat="${k}" class="${cat === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      ${cat === 'Camión' ? `<div class="tabs">${[['ets2', 'Europa · ETS2'], ['ats', 'América · ATS']].map(([k, n]) => `<button data-dgame="${k}" class="${game === k ? 'on' : ''}">${n}</button>`).join('')}</div>` : ''}</div>
      <div class="dealer">${brands.length ? `<div><div class="dlabel">Elige una marca</div><div class="brand-grid">${brands.map((b) => { const bi = brandsInfo[b] || {};
          return `<button class="brand-tile ${b === brand ? 'on' : ''}" data-dbrand="${esc(b)}" style="--bc:${esc(bi.color || '#4C8DFF')};--bt:${esc(bi.text || '#fff')}">${BRAND_LOGOS.includes(b) ? `<img class="blogo" src="brands/${b.toLowerCase().replace(/ /g, '-')}.png" alt="${esc(b)}">` : `<span class="bname${b.length > 12 ? ' xl' : b.length > 6 ? ' l' : ''}">${esc(b)}</span>`}<span class="bcount">${pool.some((m) => m.brand === b && m.soon) ? 'Próximamente' : (() => { const n = pool.filter((m) => m.brand === b).length; return `${n} modelo${n === 1 ? '' : 's'}`; })()}</span></button>`; }).join('')}</div></div>` : ''}
        <div><div class="dlabel">Elige un modelo</div>${models.some((m) => m.soon) ? '<div class="notice" style="margin-bottom:12px">🚧 Esta marca llegará próximamente al concesionario de Rutero.</div>' : ''}<div class="model-grid">${models.map((m) => m.soon
          ? `<div class="model-card soon"><div class="soon-img"><span>🚧</span><b>Próximamente</b></div>
          <div class="mrow"><span>${esc(m.name)}</span><b class="muted">Próximamente</b></div><div class="mspecs">${esc(m.specs || '')}</div></div>`
          : `<button class="model-card" data-buy="${m.id}">${vehImg(m.id, m.cut ? m.tint : info.color)}
          <div class="mrow"><span>${esc(m.name)}</span><b>${money(m.price)}</b></div><div class="mspecs">${esc(m.specs || '')}</div></button>`).join('')}</div></div></div>`;
  },
  async maintenance(c) {
    const list = c.fleet.filter((f) => f.kind !== 'Remolque').sort((a, b) => (a.condition ?? 100) - (b.condition ?? 100));
    const total = list.reduce((a, f) => a + repairCost(f), 0);
    return head('Mantenimiento', 'Los vehículos se desgastan con los kilómetros de su conductor asignado') +
      `<div class="grid g3" style="margin-bottom:16px"><div class="card stat"><span class="k">Necesitan taller</span><span class="v mono">${list.filter((f) => (f.condition ?? 100) < 70).length}</span></div>
      <div class="card stat"><span class="k">Coste de reparar todo</span><span class="v mono">${money(total)}</span></div>
      <div class="card stat"><span class="k">Estado medio</span><span class="v mono">${list.length ? Math.round(list.reduce((a, f) => a + (f.condition ?? 100), 0) / list.length) : 100}<small>%</small></span></div></div>
      <div class="card">${list.length ? `<table><thead><tr><th>Vehículo</th><th>Conductor</th><th class="num">Km</th><th>Estado</th><th class="num">Último taller</th><th class="num">Reparación</th><th></th></tr></thead><tbody>
      ${list.map((f) => { const cond = Math.round(f.condition ?? 100); return `<tr><td>${kindIcon(f.kind)} <b>${esc(f.model)}</b></td><td>${esc(f.assignedTo || '—')}</td><td class="num">${dist(f.km || 0)}</td>
        <td style="min-width:160px"><div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${cond}%;background:${condColor(cond)}"></i></div><b style="color:${condColor(cond)}">${cond}%</b></div></td>
        <td class="num muted">${f.lastService ? dayStr(f.lastService) : '—'}</td><td class="num">${money(repairCost(f))}</td>
        <td class="num">${S.mgr && cond < 100 ? `<button class="btn sm primary" data-repair="${f.id}">🔧 Reparar</button>` : ''}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty"><div class="big">🔧</div>No hay vehículos en la flota</div>'}</div>`;
  },
  // ---------------------------------------------------------- EVENTOS
  async calendar(c) {
    const base = S.calMonth ? new Date(S.calMonth) : new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
    S.calMonth = base.toISOString();
    const start = new Date(base); start.setDate(1 - ((base.getDay() + 6) % 7));
    const cells = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const evOn = (d) => c.events.filter((e) => { const x = new Date(e.date); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate(); });
    return head('Calendario', 'Convoyes y eventos de la empresa', `<div class="row"><button class="btn sm" data-cal="-1">◀</button><b style="min-width:150px;text-align:center">${(() => { const t = base.toLocaleDateString(LOC(), { month: 'long', year: 'numeric' }); return t[0].toUpperCase() + t.slice(1); })()}</b><button class="btn sm" data-cal="1">▶</button></div>`) +
      `<div class="card"><div class="cal">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => `<div class="cal-h">${d}</div>`).join('')}
        ${cells.map((d) => { const evs = evOn(d); return `<div class="cal-d ${d.getMonth() !== base.getMonth() ? 'out' : ''} ${+d === +today ? 'today' : ''}"><span class="n">${d.getDate()}</span>
          ${evs.map((e) => `<div class="cal-ev" data-ev="${e.id}">${new Date(e.date).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' })} ${esc(e.title)}</div>`).join('')}</div>`; }).join('')}</div></div>`;
  },
  async events(c) {
    const now = Date.now();
    const up = c.events.filter((e) => new Date(e.date) >= now - 3 * 3600000).sort((a, b) => new Date(a.date) - new Date(b.date));
    const past = c.events.filter((e) => new Date(e.date) < now - 3 * 3600000);
    return head('Eventos', 'Convoyes de la empresa en TruckersMP o en solitario', S.mgr ? '<button class="btn primary" id="ev-new">＋ Crear evento</button>' : '') +
      `<div class="grid g2" style="align-content:start">${up.map((e) => `<div class="card">${eventCard(e, true)}</div>`).join('') || '<div class="card span2"><div class="empty"><div class="big">📅</div>No hay eventos próximos</div></div>'}</div>
      ${past.length ? `<h2 style="margin-top:22px">Eventos pasados</h2><div class="card">${past.slice(0, 15).map((e) => `<div class="list-item"><span class="muted" style="width:110px">${dayStr(e.date)}</span><b style="flex:1">${esc(e.title)}</b><span class="muted">${(e.attendees || []).length} asistentes</span></div>`).join('')}</div>` : ''}`;
  },
  // ---------------------------------------------------------- CONTENIDO
  // ---------------------------------------------------------- RUTAS DE BUS
  // ---------------------------------------------------------- DISCORD
  async discord(c, info, me) {
    let map = null; try { map = info.discordRegistered ? await K.call('company:discordInfo') : null; } catch { map = null; }
    const last = info.lastPromoAt ? Date.parse(info.lastPromoAt) : 0;
    const wait = Math.max(0, 14 * 864e5 - (Date.now() - last));
    S.promo = S.promo && S.promo.cid === info.id ? S.promo : { cid: info.id, photo: '', text: '' };
    const n = info.ratingCount || 0, avg = n ? info.ratingSum / n : 0;
    return head('Discord', 'Registra tu empresa en el servidor de Rutero y promociónala con foto y estrellas') + `
      <div class="dc-hero"><span class="dc-ic">${DISCORD_SVG}</span><div style="flex:1"><h2 style="margin:0">Servidor de Rutero</h2><div class="muted">Sede privada para tu empresa, rol con vuestro color, rangos sincronizados y promociones.</div></div><button class="btn discord" id="dc-join">Abrir Discord</button></div>
      ${me.discordId ? '' : `<div class="card" style="margin-bottom:16px">${discordLinkBox()}<div class="muted" style="font-size:12px;margin-top:8px">Cada conductor recibe el rol de la empresa cuando conecta su Discord desde Ajustes.</div></div>`}
      <div class="grid g2">
        <div class="card"><div class="card-title"><h2>📝 Registro de empresa</h2>${info.discordRegistered ? '<span class="pill ok"><span class="dot"></span>Registrada</span>' : '<span class="pill">Sin registrar</span>'}</div>
          ${info.discordRegistered ? `<div class="muted" style="margin-bottom:12px">Tu empresa está registrada. El bot ${map && map.textId ? 'ya ha creado' : 'creará en unos minutos'}:</div>
            <div class="list-item"><span>🎭</span><b style="flex:1">Rol «🏢 ${esc(info.tag)} · ${esc(info.name)}»</b>${map && map.roleId ? '<span class="pill ok">Listo</span>' : '<span class="pill warn">Pendiente</span>'}</div>
            <div class="list-item"><span>🏠</span><b style="flex:1">Sede privada de texto y voz</b>${map && map.textId ? '<span class="pill ok">Lista</span>' : '<span class="pill warn">Pendiente</span>'}</div>
            <div class="list-item"><span>👑</span><b style="flex:1">Rol 🏢 Dueño de empresa para el fundador</b><span class="pill ok">Auto</span></div>
            <div class="muted" style="font-size:12px;margin-top:10px">Solo ven la sede los miembros que han conectado su Discord en Rutero.</div>`
          : `<div class="muted" style="margin-bottom:14px">Al registrarla, el bot anuncia tu empresa en <b>#registro-de-empresas</b> y crea:</div>
            <div class="list-item"><span>🎭</span><b style="flex:1">Un rol con el nombre y color de tu empresa</b></div>
            <div class="list-item"><span>🏠</span><b style="flex:1">Una sede privada (canal de texto y de voz)</b></div>
            <div class="list-item"><span>👑</span><b style="flex:1">El rol 🏢 Dueño de empresa para el fundador</b></div>
            ${S.mgr ? '<button class="btn primary" id="dc-register" style="margin-top:14px">📝 Registrar empresa en Discord</button>' : '<div class="muted" style="margin-top:12px">Solo el fundador o un gerente pueden registrarla.</div>'}`}
        </div>
        <div class="card"><div class="card-title"><h2>📢 Promocionar</h2>${wait ? `<span class="pill warn">Otra en ${Math.ceil(wait / 864e5)} ${Math.ceil(wait / 864e5) === 1 ? 'día' : 'días'}</span>` : '<span class="pill ok">Disponible</span>'}</div>
          <div class="muted" style="margin-bottom:12px">Se publica en <b>#promociona-tu-empresa</b> con tu foto, tus ⭐ estrellas, conductores, requisitos y enlaces. Una vez cada 2 semanas.</div>
          <label class="field"><span>Texto de la promoción</span><textarea id="pm-text" rows="3" maxlength="600" placeholder="¡Buscamos conductores! Convoyes los viernes en Simulation 1…">${esc(S.promo.text)}</textarea></label>
          <div class="row" style="margin:10px 0"><button class="btn sm" id="pm-photo">📷 ${S.promo.photo ? 'Cambiar foto' : 'Elegir foto'}</button>${S.promo.photo ? '<button class="btn sm ghost" id="pm-photo-del">Quitar foto</button>' : `<span class="muted" style="font-size:12px">${info.banner ? 'Si no eliges, se usa el banner' : 'Opcional'}</span>`}</div>
          <div class="promo-prev" style="--pc:${esc(info.color || '#FF9F1C')}"><div class="pp-title">📢 ${esc(info.name)} [${esc(info.tag)}]</div>
            <div id="pm-prev-text" style="white-space:pre-wrap">${esc(S.promo.text || info.description || '')}</div>
            <div class="pp-stars">${n ? `${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))} · ${nf(avg, 1)} (${n})` : '☆☆☆☆☆ · sin valoraciones'}</div>
            <div class="pp-fields"><div><b>👥 Conductores</b>${nf(info.membersCount || 1)}</div><div><b>🛣️ Km</b>${nf(info.km || 0)}</div><div><b>📦 Entregas</b>${nf(info.jobs || 0)}</div></div>
            <div class="pp-img" style="${S.promo.photo || info.banner ? `background-image:url('${esc(S.promo.photo || info.banner)}')` : ''}">${S.promo.photo || info.banner ? '' : 'Sin foto'}</div></div>
          ${S.mgr ? `<button class="btn primary" id="dc-promo" style="margin-top:14px" ${wait ? 'disabled' : ''}>📢 Publicar en Discord</button>` : '<div class="muted" style="margin-top:12px">Solo el fundador o un gerente pueden promocionarla.</div>'}
        </div>
      </div>`;
  },
  async busroutes(c, info) {
    if (!info.busUnlocked) {
      const price = S.data.busUnlockPrice || 700000;
      return head('Rutas de bus', 'Líneas de autobús de la empresa con sus paradas, billete y pago extra') + `<div class="card bus-lock"><div class="big">🚌🔒</div>
        <h2>Servicio de autobuses</h2><div class="muted" style="max-width:560px;margin:6px auto 16px">Activa el servicio de autobuses para que la empresa pueda crear sus propias líneas con paradas.</div>
        <div class="grid g3" style="max-width:720px;margin:0 auto 18px;text-align:left">
          <div class="mini-stat"><span>Precio</span><b>${money(price)}</b></div><div class="mini-stat"><span>Las rutas pagan</span><b>×${nf(S.data.busBoost || 1.5, 1)}</b></div><div class="mini-stat"><span>Saldo</span><b>${money(info.balance || 0)}</b></div></div>
        <div class="muted" style="font-size:13px;margin-bottom:16px">✓ Rutas propias con paradas y pago extra · ✓ Todo lo que se gana en ellas vale un 50% más · ✓ Para siempre, se paga una vez</div>
        ${S.mgr ? `<button class="btn primary" id="bus-unlock" ${(info.balance || 0) < price ? 'disabled' : ''}>Activar por ${money(price)}</button>${(info.balance || 0) < price ? '<div class="muted" style="font-size:12px;margin-top:8px">No hay saldo suficiente: puedes pedir un préstamo en Saldo.</div>' : ''}` : '<div class="muted">Solo el fundador o un gerente pueden activarlo.</div>'}</div>`;
    }
    const routes = c.busRoutes || [];
    const done = (r) => c.jobs.filter((j) => j.routeId === r.id);
    S.busRoutes = routes;
    return head('Rutas de bus', 'Líneas de autobús de la empresa con sus paradas, billete y pago extra', S.mgr ? '<button class="btn primary" id="route-new">＋ Nueva ruta</button>' : '') +
      bannerHero(info.busBanner, info.name, `${routes.length} ${routes.length === 1 ? 'ruta' : 'rutas'} · todo lo que se gana vale ×${nf(S.data.busBoost || 1.5, 1)}`,
        S.mgr ? `<button class="btn sm" id="bus-cbanner">🖼️ ${info.busBanner ? 'Cambiar' : 'Poner'} banner de buses</button>${info.busBanner ? '<button class="btn sm ghost" id="bus-cbanner-del">Quitar</button>' : ''}` : '', 'Rutas de bus') +
      (routes.length ? `<div class="grid g2">${routes.map((r) => { const d = done(r); const full = d.filter((j) => j.routeDone).length;
        return `<div class="card route-card" style="--rc:${esc(r.color || '#FF9F1C')}">
        <div class="row between" style="align-items:flex-start"><div class="row" style="gap:10px;flex-wrap:nowrap;min-width:0"><span class="route-code">${esc(r.code || '🚌')}</span>
          <div style="min-width:0"><h2 style="margin:0">${esc(r.name)}</h2><div class="muted" style="font-size:12px">${esc(r.stops[0])} → ${esc(r.stops[r.stops.length - 1])} · ${r.stops.length} paradas${r.game && r.game !== 'any' ? ` · ${r.game.toUpperCase()}` : ''}</div></div></div>
          ${r.active === false ? '<span class="pill">Pausada</span>' : '<span class="pill ok">Activa</span>'}</div>
        <div class="route-line">${r.stops.map((s, i) => `<div class="rstop ${i === 0 || i === r.stops.length - 1 ? 'end' : ''}"><i></i><span>${esc(s)}</span></div>`).join('')}</div>
        ${r.description ? `<div class="muted" style="font-size:13px;margin-bottom:10px;white-space:pre-wrap">${esc(r.description)}</div>` : ''}
        <div class="grid g3" style="margin-bottom:12px"><div class="mini-stat"><span>Billete</span><b>${money(r.fare)}</b></div><div class="mini-stat"><span>Pago extra</span><b>${money(r.bonus || 0)}</b></div><div class="mini-stat"><span>Completada</span><b>${full}×</b></div></div>
        <div class="row">${r.active === false ? '' : `<button class="btn primary sm" data-drive="${r.id}">▶ Conducir esta ruta</button>`}
          ${S.mgr ? `<button class="btn sm" data-editroute="${r.id}">Editar</button><button class="btn sm ghost" data-delroute="${r.id}">Borrar</button>` : ''}</div></div>`; }).join('')}</div>`
        : `<div class="card"><div class="empty"><div class="big">🚏</div>La empresa todavía no tiene rutas de bus.${S.mgr ? '<br>Crea la primera con «Nueva ruta».' : ''}</div></div>`) +
      '<div class="notice" style="margin-top:16px">Cada vez que te detienes 12 segundos cuenta como la siguiente parada de la lista. Si haces todas las paradas, cobras el pago extra de la ruta.</div>';
  },
  async news(c) {
    const list = [...c.news].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return head('Noticias', 'Avisos y novedades para los conductores', S.mgr ? '<button class="btn primary" id="news-new">＋ Publicar noticia</button>' : '') +
      `<div class="grid" style="max-width:860px">${list.map((n) => `<article class="card news">${n.image ? `<img class="news-img" src="${esc(n.image)}" alt="">` : ''}
        <div class="row between"><h2 style="margin:0">${n.pinned ? '📌 ' : ''}${esc(n.title)}</h2>${S.mgr ? `<button class="btn sm ghost" data-delnews="${n.id}">Borrar</button>` : ''}</div>
        <div class="row" style="gap:8px;margin:8px 0 12px">${avatar(n.authorPhoto, n.author, 26)}<span class="muted" style="font-size:12px">${esc(n.author)} · ${dateStr(n.at)}</span></div>
        <div style="white-space:pre-wrap;line-height:1.55">${esc(n.body)}</div></article>`).join('') || '<div class="card"><div class="empty"><div class="big">📰</div>Todavía no hay noticias</div></div>'}</div>`;
  },
};

function jobsList(list) {
  S.cjobsView = list;
  return list.length ? list.map((j, i) => `<div class="list-item" data-cjob="${i}" style="cursor:pointer">${avatar(j.driverPhoto, j.driverName)}
    <div style="flex:1;min-width:0"><b>${esc(j.driverName)}</b> · ${esc(j.cargo)}<div class="muted" style="font-size:12px">${esc(j.from)} → ${esc(j.to)} · ${dist(j.km)} · ${ago(j.finishedAt)}${j.fineCount ? ` · 🚨 ${j.fineCount}` : ''}</div></div>
    <div style="text-align:right"><b class="mono pos">+${money(j.companyCut || 0, j.game)}</b><div class="muted" style="font-size:12px">${j.score} pts</div></div></div>`).join('') : '<div class="empty">Aún no hay entregas</div>';
}
function eventCard(e, full = false) {
  const d = new Date(e.date); const me = (S.profile.online || {}).name || '';
  const going = (e.attendees || []).includes(me);
  return `<div class="row" style="gap:14px;align-items:flex-start"><div class="event-date"><b>${d.getDate()}</b><span>${d.toLocaleDateString(LOC(), { month: 'short' })}</span></div>
    <div style="flex:1;min-width:0"><b style="font-size:16px">${esc(e.title)}</b><div class="muted" style="font-size:12px">${d.toLocaleString(LOC(), { weekday: 'long', hour: '2-digit', minute: '2-digit' })} · ${(e.game || 'ets2').toUpperCase()}${e.server ? ' · ' + esc(e.server) : ''}</div>
    ${e.from || e.to ? `<div style="margin-top:6px">🚛 ${esc(e.from || '?')} → ${esc(e.to || '?')}${e.meeting ? `<span class="muted"> · quedada: ${esc(e.meeting)}</span>` : ''}</div>` : ''}
    ${full && e.description ? `<div class="muted" style="margin-top:6px;white-space:pre-wrap">${esc(e.description)}</div>` : ''}
    <div class="row" style="margin-top:10px;gap:6px"><span class="muted" style="font-size:12px">${(e.attendees || []).length} van: ${(e.attendees || []).slice(0, 6).map(esc).join(', ')}</span></div>
    ${full ? `<div class="row" style="margin-top:10px;gap:6px"><button class="btn sm ${going ? '' : 'teal'}" data-attend="${e.id}" data-going="${going ? 0 : 1}">${going ? 'Ya no voy' : '✋ Me apunto'}</button>
      ${e.tmpUrl ? `<button class="btn sm" data-url="${esc(e.tmpUrl)}">Ver en TruckersMP</button>` : ''}${S.mgr ? `<button class="btn sm danger" data-delev="${e.id}">Borrar</button>` : ''}</div>` : ''}</div></div>`;
}

// ---------------------------------------------------------------- lobby (sin empresa)
async function companyLobby(me) {
  const list = await K.call('company:browse').catch(() => []);
  S.lobby = list;
  return `<div class="page-head"><div><h1>Empresas</h1><div class="subtitle">Funda tu propia empresa de transporte o únete a una</div></div></div>
  ${me.pendingCompanyId ? `<div class="notice" style="margin-bottom:16px">⏳ Has enviado una solicitud a <b>${esc((list.find((c) => c.id === me.pendingCompanyId) || {}).name || 'una empresa')}</b>. Te avisaremos cuando respondan. <button class="btn sm ghost" id="req-cancel">Cancelar solicitud</button></div>` : ''}
  <div class="grid g2">
    <div class="card"><h2>Fundar una empresa</h2><div class="grid">
      <div class="row" style="gap:14px"><div id="c-logo-prev">${companyLogo({ color: '#4C8DFF', name: '?' }, 64)}</div><button class="btn sm" id="c-logo">📷 Subir logo</button><span class="muted" style="font-size:12px">Opcional</span></div>
      <div class="grid g2"><label class="field"><span>Nombre</span><input type="text" id="c-name" maxlength="40" placeholder="Transportes Halcón"></label>
      <label class="field"><span>Siglas (máx. 5)</span><input type="text" id="c-tag" maxlength="5" placeholder="HLC"></label></div>
      <label class="field"><span>Descripción</span><textarea id="c-desc" rows="3" maxlength="1000" placeholder="Convoyes los fines de semana en TruckersMP, todos bienvenidos"></textarea></label>
      <div class="grid g2"><label class="field"><span>Comisión de la empresa (%)</span><input type="number" id="c-com" value="15" min="0" max="50"></label>
      <label class="field"><span>Color</span>${colorInput('c-color', '#4C8DFF')}</label></div>
      <div class="notice">La empresa empieza con ${money(300000)} y recibe ${money(300000)} más por cada conductor que entre.</div>
      <button class="btn primary" id="c-create">🏢 Fundar empresa</button></div></div>
    <div class="grid" style="align-content:start">
      <div class="card"><h2>Unirse con código</h2><div class="muted" style="margin-bottom:12px">Pide el código de 6 letras al fundador o a un gerente.</div>
        <div class="row" style="flex-wrap:nowrap"><input type="text" id="j-code" maxlength="6" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:.3em;font-family:var(--display);font-size:20px"><button class="btn teal" id="j-join">Unirme</button></div></div>
      <div class="card"><h2>Buscar empresa</h2><input type="text" id="c-search" placeholder="Buscar por nombre o siglas…" style="margin-bottom:8px">
        <div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><select id="c-filter"><option value="all">Todas</option><option value="open">Públicas</option><option value="apply">Con solicitud</option></select>
          <select id="c-sort"><option value="rating">Mejor valoradas</option><option value="km">Más kilómetros</option><option value="members">Más conductores</option><option value="new">Más nuevas</option></select></div>
        <div id="c-list">${lobbyList(list, me)}</div></div>
    </div></div>`;
}
function lobbyList(list, me) {
  return list.length ? list.map((c) => `<div class="list-item comp-row" data-cprof="${c.id}">${companyLogo(c, 48)}
    <div style="flex:1;min-width:0"><b>${esc(c.name)}</b> <span class="tag">${esc(c.tag)}</span>
      <div style="font-size:13px;margin-top:2px">${ratingLine(c)}</div>
      <div class="muted" style="font-size:12px">${c.membersCount || 1} conductores · ${dist(c.km || 0)}${c.description ? ' · ' + esc(c.description.slice(0, 60)) : ''}</div></div>
    ${me.pendingCompanyId === c.id ? '<span class="pill warn">Enviada</span>' : MODE_PILL[joinModeOf(c)]}</div>`).join('')
    : '<div class="muted">No hay empresas que coincidan.</div>';
}
function lobbyView() {
  const q = (($('#c-search') || {}).value || '').toLowerCase(); const f = ($('#c-filter') || {}).value || 'all'; const so = ($('#c-sort') || {}).value || 'rating';
  const score = { rating: (c) => ratingAvg(c) * 1000 + (c.ratingCount || 0), km: (c) => c.km || 0, members: (c) => c.membersCount || 0, new: (c) => new Date(c.createdAt || 0).getTime() };
  return (S.lobby || []).filter((c) => `${c.name} ${c.tag}`.toLowerCase().includes(q) && (f === 'all' || joinModeOf(c) === f)).sort((a, b) => score[so](b) - score[so](a));
}

// ficha pública de una empresa (al buscar o desde tu empresa)
async function companyProfileModal(id) {
  let data = await K.call('company:profile', id);
  const me = S.profile.online || {};
  const draw = (bg) => {
    const c = data.info; const mode = joinModeOf(c); const mine = me.companyId === id;
    const reqs = reqList(c.requirements || {}); const okReqs = reqs.every((x) => x.ok);
    const canRate = c.ownerUid !== me.uid && (mine || (me.joinedCompanies || []).includes(id));
    const myR = data.myRating || {};
    const action = mine ? '<div class="notice">Ya formas parte de esta empresa.</div>'
      : me.pendingCompanyId === id ? '<div class="notice">⏳ Ya has enviado una solicitud. Te avisaremos cuando respondan.</div>'
      : mode === 'closed' ? '<div class="notice warn">Ahora mismo no acepta conductores. Solo se entra con código de invitación.</div>'
      : !okReqs ? '<div class="notice warn">No cumples todos los requisitos para entrar.</div>'
      : mode === 'open' ? `<button class="btn primary" id="cp-join" ${me.companyId ? 'disabled' : ''}>🚚 Unirme ahora</button>${me.companyId ? '<div class="muted" style="font-size:12px">Primero sal de tu empresa actual</div>' : ''}`
      : `<label class="field"><span>Mensaje para la empresa</span><textarea id="cp-msg" rows="3" maxlength="300" placeholder="Hola, conduzco en ETS2 casi todos los días…"></textarea></label><button class="btn primary" id="cp-apply" ${me.companyId || me.pendingCompanyId ? 'disabled' : ''}>📨 Enviar solicitud</button>`;
    bg.querySelector('.modal').innerHTML = `<div class="cp-banner" style="${c.banner ? `background-image:url('${esc(c.banner)}')` : `background:linear-gradient(135deg,${esc(c.color || '#4C8DFF')},#11162a)`}"><button class="btn sm ghost cp-x" data-close>✕</button></div>
      <div class="cp-head">${companyLogo(c, 86)}<div style="flex:1;min-width:0"><h2 style="margin:0">${esc(c.name)} <span class="tag">${esc(c.tag)}</span></h2>
        <div class="row" style="gap:10px;margin-top:4px">${ratingLine(c)} ${MODE_PILL[mode]}</div></div><div class="row">${linkBtns(c)}<button class="btn sm ghost" id="cp-rep" title="Reportar empresa">🚩</button></div></div>
      <div class="grid g4" style="margin:14px 0"><div class="mini-stat"><span>Conductores</span><b>${c.membersCount || 1}</b></div><div class="mini-stat"><span>Distancia</span><b>${dist(c.km || 0)}</b></div>
        <div class="mini-stat"><span>Entregas</span><b>${nf(c.jobs || 0)}</b></div><div class="mini-stat"><span>Comisión</span><b>${c.commission || 0}%</b></div></div>
      ${c.description ? `<h3>Descripción</h3><div class="muted" style="white-space:pre-wrap">${esc(c.description)}</div>` : ''}
      <div class="grid g2" style="margin-top:14px;align-items:start">
        <div><h3>Requisitos</h3>${reqHtml(c.requirements || {})}</div>
        <div><h3>Normas</h3>${c.rules ? `<div class="rules">${esc(c.rules)}</div>` : '<div class="muted">Esta empresa no ha puesto normas.</div>'}</div></div>
      <div style="margin-top:16px">${action}</div>
      <h3 style="margin-top:20px">Valoraciones</h3>
      ${canRate ? `<div class="rate-box"><div class="star-pick" id="cp-stars">${[1, 2, 3, 4, 5].map((n) => `<button data-star="${n}" class="${(myR.stars || 0) >= n ? 'on' : ''}">★</button>`).join('')}</div>
        <input type="text" id="cp-comment" maxlength="400" placeholder="Cuenta qué tal es la empresa (opcional)" value="${esc(myR.comment || '')}"><button class="btn sm primary" id="cp-rate">${myR.stars ? 'Cambiar valoración' : 'Valorar'}</button></div>`
        : '<div class="muted" style="font-size:12px;margin-bottom:8px">Solo pueden valorar los conductores que han estado en la empresa.</div>'}
      ${data.ratings.length ? data.ratings.map((r) => `<div class="list-item">${avatar(r.photo, r.name, 34)}<div style="flex:1;min-width:0"><b>${esc(r.name || '')}</b> ${stars(r.stars, 13)}
        ${r.comment ? `<div class="muted" style="font-size:13px">${esc(r.comment)}</div>` : ''}</div><span class="muted" style="font-size:12px">${ago(r.at)}</span></div>`).join('') : '<div class="muted">Todavía nadie ha valorado esta empresa.</div>'}`;
    $$('[data-close]', bg).forEach((b) => b.onclick = () => bg.remove());
    $$('[data-url]', bg).forEach((b) => b.onclick = () => K.call('open', b.dataset.url));
    const rp = $('#cp-rep', bg); if (rp) rp.onclick = () => reportModal({ type: 'company', target: `${c.name} [${c.tag}]`, targetId: id });
    let pick = myR.stars || 0;
    $$('[data-star]', bg).forEach((b) => b.onclick = () => { pick = +b.dataset.star; $$('[data-star]', bg).forEach((x) => x.classList.toggle('on', +x.dataset.star <= pick)); });
    const rb = $('#cp-rate', bg); if (rb) rb.onclick = () => act(rb, async () => { data = await K.call('company:rate', id, pick, $('#cp-comment', bg).value); toast({ title: 'Valoración guardada ⭐', body: c.name }); draw(bg); });
    const jb = $('#cp-join', bg); if (jb) jb.onclick = () => act(jb, async () => { await K.call('company:joinOpen', id); toast({ title: 'Bienvenido 🎉', body: 'Ya formas parte de la empresa', kind: 'money' }); bg.remove(); S.companyTab = 'dashboard'; await refreshState(); renderSide(); render(); });
    const ab = $('#cp-apply', bg); if (ab) ab.onclick = () => act(ab, async () => { await K.call('company:request', id, $('#cp-msg', bg).value); toast({ title: 'Solicitud enviada', body: c.name }); bg.remove(); await refreshState(); render(); });
  };
  const bg = modal('<div class="muted">Cargando…</div>');
  bg.querySelector('.modal').classList.add('wide', 'cp');
  draw(bg);
}

// ---------------------------------------------------------------- eventos de la página
function formModal(title, fields, onOk, okText = 'Guardar') {
  modal(`<h2>${title}</h2><div class="grid">${fields}<div class="row"><button class="btn primary" id="fm-ok">${okText}</button><button class="btn ghost" data-close>Cancelar</button></div></div>`, (bg, close) => {
    const ok = $('#fm-ok', bg); ok.onclick = () => act(ok, async () => { await onOk(bg); close(); render(); });
  });
}
function mountCompany(root) {
  $('#main').classList.toggle('flush', !!S.company && !!$('.cwrap', root));
  $$('[data-goto]', root).forEach((b) => b.onclick = () => go(b.dataset.goto));
  $$('[data-csec]', root).forEach((b) => b.onclick = () => { S.companyTab = b.dataset.csec; render(); $('#main').scrollTop = 0; });
  const on = (id, fn) => { const el = $(id, root); if (el) el.onclick = () => act(el, fn); };
  const reload = async () => { await refreshState(); renderSide(); render(); };
  const me = S.profile.online || {};
  bindVehPhotos(root);
  $$('[data-url]', root).forEach((b) => { if (!b.classList.contains('credit')) b.onclick = () => K.call('open', b.dataset.url); });

  // ----- lobby
  let newLogo = '';
  on('#c-logo', async () => { const img = await pickLogo(); if (img) { newLogo = img; $('#c-logo-prev').innerHTML = companyLogo({ logo: img }, 64); } });
  on('#c-create', async () => {
    const name = $('#c-name').value.trim(); if (name.length < 3) throw new Error('Pon un nombre de al menos 3 letras');
    await K.call('company:create', { name, tag: $('#c-tag').value || name.slice(0, 3), description: $('#c-desc').value, commission: $('#c-com').value, color: $('#c-color').value, logo: newLogo });
    toast({ title: 'Empresa fundada 🏢', body: `${name} · capital inicial ${money(300000)}`, kind: 'achievement' }); S.companyTab = 'dashboard'; await reload();
  });
  on('#j-join', async () => { await K.call('company:join', $('#j-code').value); toast({ title: 'Bienvenido 🎉', body: 'Ya formas parte de la empresa', kind: 'money' }); await reload(); });
  on('#req-cancel', async () => { await K.call('company:cancelRequest'); await reload(); });
  const bindProf = () => $$('[data-cprof]', root).forEach((b) => b.onclick = () => companyProfileModal(b.dataset.cprof).catch((e) => toast({ title: 'Error', body: e.message, kind: 'warn' })));
  const relist = () => { const l = $('#c-list', root); if (l) { l.innerHTML = lobbyList(lobbyView(), me); bindProf(); } };
  bindProf();
  if ($('#c-list', root)) relist();
  ['#c-search', '#c-filter', '#c-sort'].forEach((s) => { const el = $(s, root); if (el) el.oninput = el.onchange = relist; });
  if (!S.company) return;

  const C = S.company; const info = C.info;
  const member = (id) => C.members.find((m) => m.id === id);
  $$('[data-cjob]', root).forEach((el) => el.onclick = () => tripModal(S.cjobsView[+el.dataset.cjob]));
  const cj = $('#cj-driver', root); if (cj) cj.onchange = () => { S.cjobDriver = cj.value; render(); };

  // ajustes
  on('#c-leave', async () => { if (!confirm('¿Seguro que quieres salir de la empresa?')) return; await K.call('company:leave'); S.companyTab = 'dashboard'; await reload(); });
  on('#code-copy', async () => { await navigator.clipboard.writeText(info.joinCode); toast({ title: 'Código copiado', body: info.joinCode }); });
  on('#code-new', async () => { await K.call('company:newCode'); render(); });
  on('#e-logo', async () => { const img = await pickLogo(); if (!img) return; try { await K.call('company:update', { logo: img }); toast({ title: 'Logo actualizado', body: '' }); render(); } catch (e) { err(e); } });
  on('#e-logo-del', async () => { await K.call('company:update', { logo: '' }); render(); });
  on('#e-banner', async () => { const img = await pickBanner(1200, 300, 'Banner de la empresa'); if (!img) return; try { await K.call('company:update', { banner: img }); toast({ title: 'Banner actualizado', body: '' }); render(); } catch (e) { err(e); } });
  on('#bus-cbanner', async () => { const img = await pickBanner(1200, 300, 'Banner del apartado de buses'); if (!img) return; try { await K.call('company:update', { busBanner: img }); toast({ title: 'Banner de buses actualizado', body: '' }); render(); } catch (e) { err(e); } });
  on('#bus-cbanner-del', async () => { try { await K.call('company:update', { busBanner: '' }); render(); } catch (e) { err(e); } });
  on('#e-banner-del', async () => { await K.call('company:update', { banner: '' }); render(); });
  on('#pp-save', async () => {
    await K.call('company:update', { joinMode: $('#pp-mode').value, rules: $('#pp-rules').value,
      requirements: { minLevel: $('#pp-lvl').value, minKm: $('#pp-km').value, game: $('#pp-game').value, age: $('#pp-age').value, language: $('#pp-lang').value, tmp: $('#pp-tmp').checked, note: $('#pp-note').value } });
    toast({ title: 'Cambios guardados', body: '' }); await reload();
  });
  on('#e-save', async () => {
    const data = { tag: $('#e-tag').value, description: $('#e-desc').value, commission: $('#e-com').value, color: $('#e-color').value, discord: $('#e-discord').value.trim(), website: $('#e-web').value.trim() };
    if (!$('#e-name').disabled) data.name = $('#e-name').value;
    await K.call('company:update', data); toast({ title: 'Cambios guardados', body: '' }); await reload();
  });

  // roles, etiquetas y rangos (listas guardadas en la empresa)
  const saveList = async (key, list) => { await K.call('company:update', { [key]: list }); render(); };
  on('#role-new', async () => formModal('Nuevo rol', `<label class="field"><span>Nombre</span><input type="text" id="r-n" maxlength="24" placeholder="Jefe de tráfico"></label>
      <label class="field"><span>Descripción</span><input type="text" id="r-d" maxlength="120"></label><label class="field"><span>Color</span>${colorInput('r-c', '#FF5A8A')}</label>`,
    async (bg) => { const n = $('#r-n', bg).value.trim(); if (!n) throw new Error('Pon un nombre'); await K.call('company:update', { roles: [...(info.roles || []), { name: n, desc: $('#r-d', bg).value, color: $('#r-c', bg).value }] }); }));
  $$('[data-delrole]', root).forEach((b) => b.onclick = () => act(b, () => saveList('roles', (info.roles || []).filter((_, i) => i !== +b.dataset.delrole))));
  on('#tag-new', async () => formModal('Nueva etiqueta', `<label class="field"><span>Nombre</span><input type="text" id="t-n" maxlength="18" placeholder="Convoy"></label><label class="field"><span>Color</span>${colorInput('t-c', '#9B7BFF')}</label>`,
    async (bg) => { const n = $('#t-n', bg).value.trim(); if (!n) throw new Error('Pon un nombre'); await K.call('company:update', { tags: [...(info.tags || []), { name: n, color: $('#t-c', bg).value }] }); }));
  $$('[data-deltag]', root).forEach((b) => b.onclick = () => act(b, () => saveList('tags', (info.tags || []).filter((_, i) => i !== +b.dataset.deltag))));
  on('#rank-new', async () => formModal('Nuevo rango', `<label class="field"><span>Nombre</span><input type="text" id="k-n" maxlength="20" placeholder="Rey de la carretera"></label>
      <label class="field"><span>Kilómetros necesarios</span><input type="number" id="k-km" min="0" value="5000"></label><label class="field"><span>Color</span>${colorInput('k-c', '#19C3B1')}</label>`,
    async (bg) => { const n = $('#k-n', bg).value.trim(); if (!n) throw new Error('Pon un nombre'); const base = info.ranks && info.ranks.length ? info.ranks : DEFAULT_RANKS;
      await K.call('company:update', { ranks: [...base, { name: n, minKm: Math.max(0, +$('#k-km', bg).value || 0), color: $('#k-c', bg).value }] }); }));
  $$('[data-delrank]', root).forEach((b) => b.onclick = () => act(b, () => saveList('ranks', ranksOf(info).filter((_, i) => i !== +b.dataset.delrank))));

  // miembros
  $$('[data-send]', root).forEach((b) => b.onclick = () => { const m = member(b.dataset.send); sendMoneyModal(m.id, m.name); });
  $$('[data-manage]', root).forEach((b) => b.onclick = () => {
    const m = member(b.dataset.manage); const owner = S.myRole === 'owner'; const self = m.id === me.uid;
    const bg = modal(`<div class="row" style="gap:12px">${avatar(m.photo, m.name, 48)}<div><h2 style="margin:0">${esc(m.name)}</h2><div class="muted">${ROLE[m.role]}${m.title ? ' · ' + esc(m.title) : ''}</div></div></div>
      <div class="manage-grid">
        <button class="btn" data-meta="${m.id}">🏷️ Rol y etiquetas</button><button class="btn" data-salary="${m.id}">💼 Sueldo</button><button class="btn" data-bonus="${m.id}">💸 Pagar desde la empresa</button>
        <button class="btn" data-mview="${m.id}">📊 Ver ficha</button>
        ${!self && m.role !== 'owner' && owner ? `<button class="btn" data-role="${m.id}">${m.role === 'admin' ? '↓ Pasar a conductor' : '↑ Hacer gerente'}</button><button class="btn" data-owner="${m.id}">👑 Ceder la empresa</button>` : ''}
        ${!self && m.role !== 'owner' ? `<button class="btn danger" data-kick="${m.id}">Expulsar</button>` : ''}
      </div><div class="row" style="margin-top:14px"><button class="btn ghost" data-close>Cerrar</button></div>`);
    $$('button[data-meta],button[data-salary],button[data-bonus],button[data-mview],button[data-role],button[data-owner],button[data-kick]', bg).forEach((x) => x.addEventListener('click', () => bg.remove()));
    bindMemberActions(bg);
  });
  bindMemberActions(root);
  function bindMemberActions(root) {
  $$('[data-mview]', root).forEach((b) => b.onclick = () => driverModal(b.dataset.mview, member(b.dataset.mview)));
  $$('[data-meta]', root).forEach((b) => b.onclick = () => {
    const m = member(b.dataset.meta);
    formModal(`Editar a ${esc(m.name)}`, `<label class="field"><span>Rol en la empresa</span><select id="mm-r"><option value="">Sin rol</option>${(info.roles || []).map((r) => `<option ${m.title === r.name ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
      <div class="field"><span>Etiquetas</span><div class="row" style="gap:8px">${(info.tags || []).map((t) => `<label class="row" style="gap:6px"><input type="checkbox" data-mt="${esc(t.name)}" ${(m.tags || []).includes(t.name) ? 'checked' : ''}>${chip(t)}</label>`).join('') || '<span class="muted">Crea etiquetas en la sección Etiquetas</span>'}</div></div>`,
      async (bg) => { await K.call('company:memberMeta', m.id, { title: $('#mm-r', bg).value, tags: $$('[data-mt]', bg).filter((x) => x.checked).map((x) => x.dataset.mt) }); });
  });
  $$('[data-salary]', root).forEach((b) => b.onclick = () => {
    const m = member(b.dataset.salary);
    formModal(`Sueldo de ${esc(m.name)}`, `<div class="muted">Se paga solo desde el banco cada vez que entrega una carga.</div>
      <div class="grid g2"><label class="field"><span>Por kilómetro</span><input type="number" id="sl-k" min="0" step="0.5" value="${m.salaryPerKm || 0}"></label><label class="field"><span>Fijo por entrega</span><input type="number" id="sl-j" min="0" step="100" value="${m.salaryPerJob || 0}"></label></div>`,
      async (bg) => { await K.call('company:salary', m.id, $('#sl-k', bg).value, $('#sl-j', bg).value); toast({ title: 'Sueldo actualizado', body: m.name, kind: 'money' }); });
  });
  $$('[data-bonus]', root).forEach((b) => b.onclick = () => {
    const m = member(b.dataset.bonus);
    formModal(`Pagar a ${esc(m.name)}`, `<label class="field"><span>Cantidad</span><input type="number" id="bn-a" min="1"></label>${accSelect('bn-from')}<label class="field"><span>Motivo</span><input type="text" id="bn-n" placeholder="Conductor del mes"></label>`,
      async (bg) => { await K.call('company:bonus', m.id, m.name, $('#bn-a', bg).value, $('#bn-n', bg).value, $('#bn-from', bg).value); toast({ title: 'Pago enviado', body: `${m.name} lo recibirá al abrir Rutero`, kind: 'money' }); }, 'Pagar');
  });
  $$('[data-role]', root).forEach((b) => b.onclick = () => act(b, async () => { const m = member(b.dataset.role); await K.call('company:role', m.id, m.role === 'admin' ? 'driver' : 'admin'); render(); }));
  $$('[data-owner]', root).forEach((b) => b.onclick = () => act(b, async () => { const m = member(b.dataset.owner); if (!confirm(`¿Ceder la empresa a ${m.name}? Pasarás a ser gerente.`)) return; await K.call('company:transfer', m.id, m.name); await reload(); }));
  $$('[data-kick]', root).forEach((b) => b.onclick = () => act(b, async () => { const m = member(b.dataset.kick); if (!confirm(`¿Expulsar a ${m.name}?`)) return; await K.call('company:kick', m.id, m.name); render(); }));
  }
  $$('[data-accept]', root).forEach((b) => b.onclick = () => act(b, async () => { await K.call('company:answer', b.dataset.accept, true); toast({ title: 'Solicitud aceptada', body: 'Entrará al abrir Rutero', kind: 'money' }); render(); }));
  $$('[data-reject]', root).forEach((b) => b.onclick = () => act(b, async () => { await K.call('company:answer', b.dataset.reject, false); render(); }));

  // saldo
  on('#dep-btn', async () => { await K.call('company:deposit', $('#dep-amt').value, $('#dep-to').value); toast({ title: 'Ingreso realizado', body: money(+$('#dep-amt').value), kind: 'money' }); await reload(); });
  const mvTo = $('#mv-to', root); if (mvTo && mvTo.options.length > 1) mvTo.selectedIndex = 1;
  on('#mv-btn', async () => {
    const f = $('#mv-from').value, t = $('#mv-to').value; const nm = (id) => S.accounts.find((a) => a.id === id).name;
    await K.call('company:move', f, t, $('#mv-amt').value, { from: nm(f), to: nm(t) }); toast({ title: 'Dinero movido 🔁', body: `${nm(f)} → ${nm(t)}`, kind: 'money' }); render();
  });
  on('#acc-new', async () => formModal('Nueva cuenta', `<label class="field"><span>Nombre</span><input type="text" id="ac-n" maxlength="30" placeholder="Salarios"></label><label class="field"><span>Color</span>${colorInput('ac-c', '#19C3B1')}</label>`,
    async (bg) => { await K.call('company:account', $('#ac-n', bg).value.trim(), $('#ac-c', bg).value); }, 'Crear'));
  $$('[data-close-acc]', root).forEach((b) => b.onclick = () => act(b, async () => { const a = S.accounts.find((x) => x.id === b.dataset.closeAcc); if (!confirm(`¿Cerrar la cuenta ${a.name}? Su saldo vuelve al banco principal.`)) return; await K.call('company:closeAccount', a); render(); }));

  // garajes
  on('#g-buy', async () => { await K.call('company:garage', { city: $('#g-city').value.trim(), size: $('#g-size').value }, $('#g-from').value); toast({ title: 'Garaje comprado 🏗️', body: $('#g-city').value, kind: 'money' }); render(); });
  $$('[data-sellg]', root).forEach((b) => b.onclick = () => act(b, async () => { const g = C.garages.find((x) => x.id === b.dataset.sellg); if (!confirm(`¿Vender el garaje de ${g.city}?`)) return; await K.call('company:sellGarage', g); render(); }));

  // flota
  $$('[data-sell]', root).forEach((b) => b.onclick = () => act(b, async () => { const f = C.fleet.find((x) => x.id === b.dataset.sell); if (!confirm(`¿Vender ${f.model} por ${money(Math.round(f.price * .6))}?`)) return; await K.call('company:sell', f); render(); }));
  $$('[data-assign]', root).forEach((b) => b.onclick = () => formModal('Asignar vehículo', `<select id="as-d"><option value="">Sin asignar</option>${C.members.map((m) => `<option>${esc(m.name)}</option>`).join('')}</select>`,
    async (bg) => { await K.call('company:assign', b.dataset.assign, $('#as-d', bg).value); }));
  $$('[data-park]', root).forEach((b) => b.onclick = () => formModal('Aparcar en un garaje', `<select id="pk-g"><option value="">En la sede</option>${C.garages.map((g) => `<option value="${g.id}">${esc(g.city)} (${C.fleet.filter((f) => f.garageId === g.id).length}/${g.slots})</option>`).join('')}</select>`,
    async (bg) => { const gid = $('#pk-g', bg).value; const g = C.garages.find((x) => x.id === gid);
      if (g && C.fleet.filter((f) => f.garageId === g.id && f.id !== b.dataset.park).length >= g.slots) throw new Error('Ese garaje está lleno'); await K.call('company:park', b.dataset.park, gid); }));
  $$('[data-repair]', root).forEach((b) => b.onclick = () => { const f = C.fleet.find((x) => x.id === b.dataset.repair);
    formModal(`Reparar ${esc(f.model)}`, `<div class="muted">Estado ${Math.round(f.condition ?? 100)}% → 100%. Coste: <b>${money(repairCost(f))}</b></div>${accSelect('rp-from', 'Pagar desde')}`,
      async (bg) => { await K.call('company:repair', f, $('#rp-from', bg).value); toast({ title: 'Vehículo reparado 🔧', body: f.model, kind: 'money' }); }, 'Reparar'); });

  // concesionario
  on('#ph-refresh', async () => { await K.call('photos:refresh'); S.photos = null; toast({ title: 'Buscando fotos…', body: 'Puede tardar unos segundos' }); render(); });
  $$('[data-dcat]', root).forEach((b) => b.onclick = () => { S.dealerCat = b.dataset.dcat; render(); });
  $$('[data-dgame]', root).forEach((b) => b.onclick = () => { S.dealerGame = b.dataset.dgame; S.dealerBrand = null; render(); });
  $$('[data-dbrand]', root).forEach((b) => b.onclick = () => { S.dealerBrand = b.dataset.dbrand; render(); });
  $$('[data-buy]', root).forEach((b) => b.onclick = () => {
    const m = S.data.shop.find((x) => x.id === b.dataset.buy);
    const bg = modal(`<div class="row between"><div><div class="muted" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">${esc(m.brand || m.kind)}</div><h2 style="margin:0">${esc(m.name)}</h2></div><button class="btn sm ghost" data-close>Cerrar</button></div>
      <div id="buy-img" style="margin:14px 0">${vehImg(m.id, m.cut ? m.tint : info.color, true)}</div><div class="muted">${esc(m.specs || '')}</div>
      <div class="grid g2" style="margin-top:12px"><label class="field"><span>Color del vehículo</span>${colorInput('buy-c', m.cut ? m.tint : info.color)}</label>${accSelect('buy-from', 'Pagar desde')}</div>
      ${S.mgr ? '' : '<div class="notice warn" style="margin-top:12px">Solo el fundador y los gerentes pueden comprar.</div>'}
      <div class="row between" style="margin-top:14px"><span style="font-family:var(--display);font-size:28px;font-weight:700;color:var(--teal)">${money(m.price)}</span>
      ${S.mgr ? '<button class="btn primary" id="buy-ok">Comprar</button>' : ''}</div>`, (bg2, close) => {
      bindVehPhotos(bg2);
      $('#buy-c', bg2).oninput = (e) => { if (!$('.veh-photo', bg2)) { $('#buy-img', bg2).innerHTML = vehImg(m.id, e.target.value, true); bindVehPhotos(bg2); } };
      const ok = $('#buy-ok', bg2); if (ok) ok.onclick = () => act(ok, async () => { await K.call('company:buy', m.id, $('#buy-c', bg2).value, $('#buy-from', bg2).value); close(); toast({ title: 'Compra realizada 🛒', body: `${m.brand || ''} ${m.name}`, kind: 'money' }); S.companyTab = 'fleet'; render(); });
    });
    bg.querySelector('.modal').style.width = 'min(640px, 94vw)';
  });

  // calendario y eventos
  $$('[data-cal]', root).forEach((b) => b.onclick = () => { const d = new Date(S.calMonth); d.setMonth(d.getMonth() + +b.dataset.cal); S.calMonth = d.toISOString(); render(); });
  $$('[data-ev]', root).forEach((el) => el.onclick = () => { const e = C.events.find((x) => x.id === el.dataset.ev); modal(`<div class="row between"><h2 style="margin:0">Evento</h2><button class="btn sm ghost" data-close>Cerrar</button></div><div style="margin-top:14px">${eventCard(e, true)}</div>`, (bg) => bindEventButtons(bg)); });
  bindEventButtons(root);
  on('#ev-new', async () => {
    const d = new Date(Date.now() + 86400000); d.setMinutes(0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    formModal('Crear evento', `<label class="field"><span>Título</span><input type="text" id="ev-t" maxlength="60" placeholder="Convoy del viernes"></label>
      <div class="grid g2"><label class="field"><span>Fecha y hora</span><input type="datetime-local" id="ev-d" value="${local}" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:inherit"></label>
      <label class="field"><span>Juego</span><select id="ev-g"><option value="ets2">ETS2</option><option value="ats">ATS</option></select></label></div>
      <div class="grid g2"><label class="field"><span>Salida</span><input type="text" id="ev-f" placeholder="Calais"></label><label class="field"><span>Destino</span><input type="text" id="ev-to" placeholder="Duisburgo"></label></div>
      <div class="grid g2"><label class="field"><span>Servidor</span><input type="text" id="ev-s" placeholder="Simulation 1"></label><label class="field"><span>Punto de quedada</span><input type="text" id="ev-m" placeholder="Gasolinera de la salida"></label></div>
      <label class="field"><span>Enlace del evento en TruckersMP (opcional)</span><input type="text" id="ev-u" placeholder="https://truckersmp.com/events/…"></label>
      <label class="field"><span>Descripción</span><textarea id="ev-desc" rows="3"></textarea></label>`,
      async (bg) => { await K.call('company:event', { title: $('#ev-t', bg).value.trim(), date: new Date($('#ev-d', bg).value).toISOString(), game: $('#ev-g', bg).value, from: $('#ev-f', bg).value, to: $('#ev-to', bg).value, server: $('#ev-s', bg).value, meeting: $('#ev-m', bg).value, tmpUrl: $('#ev-u', bg).value.trim(), description: $('#ev-desc', bg).value }); toast({ title: 'Evento creado 📅', body: '' }); }, 'Crear evento');
  });

  // noticias
  // préstamos y servicio de autobuses
  $$('[data-loan]', root).forEach((b) => b.onclick = () => act(b, async () => {
    const a = +b.dataset.loan; const back = Math.round(a * (1 + (S.data.loanRate || 10) / 100));
    if (!confirm(`¿Pedir un préstamo de ${money(a)}? La empresa tendrá que devolver ${money(back)}.`)) return;
    await K.call('company:loan', a); toast({ title: 'Préstamo concedido 🏛️', body: `+${money(a)} en el banco de la empresa`, kind: 'money' }); render();
  }));
  on('#loan-pay-btn', async () => { await K.call('company:repay', +$('#loan-pay').value); toast({ title: 'Pago hecho', body: '' }); render(); });
  on('#loan-pay-all', async () => { await K.call('company:repay', (info.loan && info.loan.owed) || 0); toast({ title: 'Préstamo devuelto ✅', body: '' }); render(); });
  on('#dc-join', async () => openDiscord());
  bindDiscordLink(root);
  on('#dc-register', async () => { await K.call('company:discord', 'register'); toast({ title: 'Empresa registrada', body: 'Ya está anunciada en Discord. Vuestro rol y vuestra sede llegarán en cuanto el bot se sincronice', kind: 'money' }); await reload(); });
  const pmText = $('#pm-text', root);
  if (pmText) pmText.oninput = () => { S.promo.text = pmText.value; const pv = $('#pm-prev-text', root); if (pv) pv.textContent = pmText.value; };
  on('#pm-photo', async () => { const img = await cropImage({ w: 1280, h: 720, title: 'Foto de la promoción', maxKB: 450 }); if (img) { S.promo.photo = img; render(); } });
  on('#pm-photo-del', async () => { S.promo.photo = ''; render(); });
  on('#dc-promo', async () => { const r = await K.call('company:discord', 'promo', { text: S.promo.text, photo: S.promo.photo }); S.promo = null; toast({ title: 'Promoción publicada', body: r && r.posted ? 'Ya está en #promociona-tu-empresa' : 'Aparecerá en #promociona-tu-empresa en unos minutos', kind: 'money' }); await reload(); });
  on('#bus-unlock', async () => {
    if (!confirm(`¿Activar el servicio de autobuses por ${money(S.data.busUnlockPrice || 700000)}?`)) return;
    await K.call('company:unlockBus'); toast({ title: 'Servicio de autobuses activado 🚌', body: 'Ya puedes crear rutas', kind: 'achievement' }); render();
  });
  // rutas de bus
  const routeForm = (r = {}) => formModal(r.id ? 'Editar ruta' : 'Nueva ruta de bus', `
      <div class="grid g2"><label class="field"><span>Código de línea</span><input type="text" id="rt-code" maxlength="8" placeholder="L1" value="${esc(r.code || '')}"></label>
        <label class="field"><span>Nombre</span><input type="text" id="rt-name" maxlength="60" placeholder="Exprés de la costa" value="${esc(r.name || '')}"></label></div>
      <label class="field"><span>Paradas (una por línea: la primera es la salida y la última el destino)</span><textarea id="rt-stops" rows="7" placeholder="Barcelona&#10;Tarragona&#10;Castellón&#10;Valencia">${esc((r.stops || []).join('\n'))}</textarea></label>
      <div class="grid g3"><label class="field"><span>Precio billete</span><input type="number" id="rt-fare" min="0" step="0.5" value="${r.fare ?? 3}"></label>
        <label class="field"><span>Pago extra al completar</span><input type="number" id="rt-bonus" min="0" step="100" value="${r.bonus ?? 500}"></label>
        <label class="field"><span>Juego</span><select id="rt-game"><option value="any">Cualquiera</option><option value="ets2" ${r.game === 'ets2' ? 'selected' : ''}>ETS2</option><option value="ats" ${r.game === 'ats' ? 'selected' : ''}>ATS</option></select></label></div>
      <div class="grid g2"><label class="field"><span>Color</span>${colorInput('rt-color', r.color || '#FF9F1C')}</label>
        <label class="row" style="align-self:end"><span class="switch"><input type="checkbox" id="rt-active" ${r.active === false ? '' : 'checked'}><i></i></span> Ruta activa</label></div>
      <label class="field"><span>Descripción</span><textarea id="rt-desc" rows="2" maxlength="600" placeholder="Servicio diario, salida a las 21:00 en Simulation 1">${esc(r.description || '')}</textarea></label>`,
    async (bg) => { await K.call('company:busroute', { id: r.id, code: $('#rt-code', bg).value, name: $('#rt-name', bg).value, stops: $('#rt-stops', bg).value, fare: $('#rt-fare', bg).value, bonus: $('#rt-bonus', bg).value, game: $('#rt-game', bg).value, color: $('#rt-color', bg).value, active: $('#rt-active', bg).checked, description: $('#rt-desc', bg).value });
      toast({ title: 'Ruta guardada 🚌', body: $('#rt-name', bg).value }); }, r.id ? 'Guardar cambios' : 'Crear ruta');
  on('#route-new', async () => routeForm());
  $$('[data-editroute]', root).forEach((b) => b.onclick = () => routeForm((S.busRoutes || []).find((r) => r.id === b.dataset.editroute)));
  $$('[data-delroute]', root).forEach((b) => b.onclick = () => act(b, async () => { if (!confirm('¿Borrar esta ruta?')) return; await K.call('company:busrouteDel', b.dataset.delroute); render(); }));
  $$('[data-drive]', root).forEach((b) => b.onclick = () => act(b, async () => { await startCompanyRoute((S.busRoutes || []).find((r) => r.id === b.dataset.drive)); }));
  on('#news-new', async () => {
    let img = '';
    formModal('Publicar noticia', `<label class="field"><span>Título</span><input type="text" id="n-t" maxlength="90"></label><label class="field"><span>Texto</span><textarea id="n-b" rows="6" maxlength="4000"></textarea></label>
      <div class="row"><button class="btn sm" id="n-img">🖼️ Añadir imagen</button><span class="muted" id="n-imgok" style="font-size:12px"></span></div>
      <label class="row"><span class="switch"><input type="checkbox" id="n-p"><i></i></span> Fijar arriba</label>`,
      async (bg) => { await K.call('company:news', { title: $('#n-t', bg).value.trim(), body: $('#n-b', bg).value, image: img, pinned: $('#n-p', bg).checked }); toast({ title: 'Noticia publicada 📰', body: '' }); }, 'Publicar');
    const bg = $$('.modal-bg').pop();
    $('#n-img', bg).onclick = async () => { const i = await pickWideImage(); if (i) { img = i; $('#n-imgok', bg).textContent = 'Imagen añadida ✓'; } };
  });
  $$('[data-delnews]', root).forEach((b) => b.onclick = () => act(b, async () => { if (!confirm('¿Borrar la noticia?')) return; await K.call('company:deleteNews', b.dataset.delnews); render(); }));
}
function bindEventButtons(root) {
  $$('[data-attend]', root).forEach((b) => b.onclick = () => act(b, async () => { await K.call('company:attend', b.dataset.attend, b.dataset.going === '1'); $$('.modal-bg').forEach((x) => x.remove()); render(); }));
  $$('[data-delev]', root).forEach((b) => b.onclick = () => act(b, async () => { if (!confirm('¿Borrar el evento?')) return; await K.call('company:deleteEvent', b.dataset.delev); $$('.modal-bg').forEach((x) => x.remove()); render(); }));
  $$('[data-url]', root).forEach((b) => { if (!b.classList.contains('credit')) b.onclick = () => K.call('open', b.dataset.url); });
}
// imagen ancha para noticias (máx. 900 px, JPEG)
function pickWideImage() {
  return new Promise((resolve) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return resolve(null);
      const img = new Image();
      img.onload = () => { const sc = Math.min(1, 900 / img.width); const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.8)); };
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  });
}

// ficha de un conductor: estadísticas, viajes y multas
async function driverModal(uid, member) {
  try {
    const d = await K.call('cloud:driver', uid); const u = d.info || {}; const m = member || {};
    const me = S.profile.online || {};
    const bg = modal(`<div class="row between"><div class="row" style="gap:14px">${avatar(u.photo, u.name, 64, 'linear-gradient(135deg,var(--accent),var(--accent2))', '#fff')}<div><h2 style="margin:0">${esc(u.name || 'Conductor')}</h2>
        <div class="muted">${u.companyName ? esc(u.companyName) : 'Sin empresa'}${m.role ? ' · ' + ROLE[m.role] : ''}${u.tmpName ? ' · TruckersMP: ' + esc(u.tmpName) : ''}</div></div></div>
        <div class="row">${uid !== me.uid ? '<button class="btn sm" id="dm-send">💸 Enviar dinero</button><button class="btn sm ghost" id="dm-rep" title="Reportar conductor">🚩</button>' : ''}<button class="btn sm ghost" data-close>Cerrar</button></div></div>
      <div class="kv" style="margin-top:16px"><div><div class="k">Distancia</div><div class="v mono">${dist(u.km || 0)}</div></div><div><div class="k">Entregas</div><div class="v mono">${nf(u.jobs)}</div></div>
        <div><div class="k">Nivel</div><div class="v mono">${Math.floor(Math.sqrt((u.xp || 0) / 120)) + 1}</div></div><div><div class="k">Multas</div><div class="v mono">${nf(u.fineCount || 0)}</div></div>
        ${member ? `<div><div class="k">Ha ganado</div><div class="v mono pos">${money(m.driverEarned || 0)}</div></div><div><div class="k">Aportado</div><div class="v mono">${money(m.earned || 0)}</div></div>
        <div><div class="k">Sueldos cobrados</div><div class="v mono">${money(m.salaryEarned || 0)}</div></div><div><div class="k">Sueldo</div><div class="v mono" style="font-size:16px">${nf(m.salaryPerKm || 0, 2)}/km</div></div>` : ''}</div>
      <h3 style="margin-top:16px">Últimos viajes</h3><div>${d.jobs.map((j, i) => `<div class="list-item" data-dj="${i}" style="cursor:pointer"><div class="avatar">${j.type === 'bus' ? '🚌' : '📦'}</div><div style="flex:1">${esc(j.cargo)} · ${esc(j.from)} → ${esc(j.to)}<div class="muted" style="font-size:12px">${dist(j.km)} · ${j.score} pts · ${ago(j.finishedAt)}</div></div><b class="mono pos">${money((j.net || 0) + (j.salary || 0), j.game)}</b></div>`).join('') || '<div class="muted">Sin viajes</div>'}</div>
      <h3 style="margin-top:16px">Multas</h3>${d.fines.map((f) => `<div class="list-item"><div class="avatar">🚨</div><div style="flex:1">${esc(fineName(f.offence))}<div class="muted" style="font-size:12px">${dateStr(f.at)} · ${esc(f.route || '')}</div></div><b class="mono neg">${money(-f.amount)}</b></div>`).join('') || '<div class="muted">Sin multas 😇</div>'}`);
    bg.querySelector('.modal').style.width = 'min(720px, 94vw)';
    $$('[data-dj]', bg).forEach((el) => el.onclick = () => tripModal(d.jobs[+el.dataset.dj]));
    const sb = $('#dm-send', bg); if (sb) sb.onclick = () => { bg.remove(); sendMoneyModal(uid, u.name); };
    const rb = $('#dm-rep', bg); if (rb) rb.onclick = () => { bg.remove(); reportModal({ type: 'driver', target: u.name || '', targetId: uid }); };
  } catch (e) { err(e); }
}
