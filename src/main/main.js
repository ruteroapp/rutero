const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { parse, SharedMemoryReader, EXPECTED_REV } = require('./telemetry');
const { Tracker } = require('./tracker');
const { Store } = require('./store');
const { Cloud, GARAGES, BASE_SLOTS, LOAN_OPTIONS, LOAN_RATE, LOAN_AUTOPAY, BUS_UNLOCK_PRICE, BUS_BOOST } = require('./cloud');
const { tmp } = require('./truckersmp');
const plugin = require('./plugin');
const { Photos } = require('./photos');
const { setupUpdater } = require('./updater');
const P = require('./progress');
const { DiscordBot } = require('./discordbot');
const DISCORD_CLIENT = '1563527823522533426';
const DISCORD_REDIRECT = 'https://ruteroapp.github.io/rutero/discord.html';

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.rutero.app');

const ROOT = path.join(__dirname, '..', '..');
const RES = app.isPackaged ? process.resourcesPath : ROOT;
const ICON = path.join(ROOT, 'build', 'icon.png');

let win, overlay, tray, store, cloud, tracker, reader, photos, updater, bot;
let me = null;          // perfil online
let myCompany = null;   // datos básicos de mi empresa (comisión)
let myMember = null;    // mi ficha dentro de la empresa (sueldo)
let last = null;        // último fotograma
let status = 'waiting';
let tmpRunning = false;
let todayStats = { todayEarned: 0, todayFines: 0, todayKm: 0 };
function computeToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const jobs = store.get('jobs').filter((j) => j.finishedAt >= +d);
  return {
    todayEarned: jobs.reduce((a, j) => a + (j.net || 0) + (j.salary || 0), 0),
    todayKm: jobs.reduce((a, j) => a + (j.km || 0), 0),
    todayFines: store.get('expenses').filter((e) => e.kind === 'fine' && e.at >= +d).length,
  };
}

// la clave puede venir de la carpeta de datos (pegada desde Ajustes) o de config/cloud.json
const userCloudFile = () => path.join(app.getPath('userData'), 'cloud.json');
function loadCloudConfig() {
  let base = {};
  for (const p of [userCloudFile(), path.join(RES, 'config', 'cloud.json'), path.join(ROOT, 'config', 'cloud.json')]) {
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!base.projectId && c.projectId) base.projectId = c.projectId;
      if (c.apiKey && !String(c.apiKey).includes('PEGA')) return { ...base, ...c, projectId: c.projectId || base.projectId };
    } catch { /* sigue */ }
  }
  return base;
}

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const sendOverlay = (ch, data) => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send(ch, data); };
const I18N = require('../renderer/i18n.js');
const langNow = () => { const l = store.get('settings').language; return l && l !== 'auto' ? l : I18N.pick(app.getLocale()); };
function toast(title, body, kind = 'info') {
  I18N.set(langNow()); title = I18N.tr(title); body = I18N.tr(body);
  send('toast', { title, body, kind });
  sendOverlay('toast', { title, body, kind });
  if (win && !win.isFocused() && Notification.isSupported()) new Notification({ title, body, icon: ICON, silent: !store.get('settings').sounds }).show();
}

// ------------------------------------------------------------- ventanas
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 1040, minHeight: 680, frame: false, backgroundColor: '#0B0E15',
    icon: ICON, show: false, title: 'Rutero',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
// ---------- overlay personalizable ----------
const OVERLAY_DEFAULT = {
  widgets: { speed: true, limit: true, gear: true, job: true, remaining: true, eta: true, score: true, fuel: true, damage: false, clock: false, rpm: false, cruise: false, earnings: false, rest: false },
  position: 'tl', scale: 1, accent: '#4C8DFF', theme: 'dark', compact: false, locked: false, opacity: 0.88, x: null, y: null,
};
const overlayCfg = () => {
  const c = store.get('settings').overlayCfg || {};
  return { ...OVERLAY_DEFAULT, ...c, widgets: { ...OVERLAY_DEFAULT.widgets, ...(c.widgets || {}) } };
};
function placeOverlay(w, h) {
  if (!overlay || overlay.isDestroyed()) return;
  const { screen } = require('electron');
  const c = overlayCfg();
  const wa = screen.getPrimaryDisplay().workArea; const m = 24;
  let x, y;
  if (c.position === 'free' && c.x !== null && c.y !== null) { x = c.x; y = c.y; }
  else {
    const right = c.position === 'tr' || c.position === 'br'; const bottom = c.position === 'bl' || c.position === 'br';
    const center = c.position === 'tc';
    x = center ? Math.round(wa.x + (wa.width - w) / 2) : right ? wa.x + wa.width - w - m : wa.x + m;
    y = bottom ? wa.y + wa.height - h - m : wa.y + m;
  }
  overlay.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
}
function applyOverlayCfg() {
  if (!overlay || overlay.isDestroyed()) return;
  const c = overlayCfg();
  overlay.setIgnoreMouseEvents(!!c.locked, { forward: true });
  overlay.webContents.send('overlay:cfg', c);
}
function toggleOverlay(force) {
  const on = force !== undefined ? force : !(overlay && !overlay.isDestroyed());
  if (!on) { if (overlay && !overlay.isDestroyed()) overlay.close(); overlay = null; }
  else if (!overlay || overlay.isDestroyed()) {
    overlay = new BrowserWindow({
      width: 360, height: 270, x: 40, y: 40, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, focusable: true, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setVisibleOnAllWorkspaces(true);
    overlay.loadFile(path.join(ROOT, 'src', 'renderer', 'overlay.html'));
    overlay.once('ready-to-show', () => { applyOverlayCfg(); overlay.showInactive(); });
    overlay.on('moved', () => {
      if (!overlay || overlay.isDestroyed()) return;
      const [x, y] = overlay.getPosition();
      const cur = store.get('settings').overlayCfg || {};
      store.patch('settings', { overlayCfg: { ...cur, position: 'free', x, y } });
      send('overlay:cfg', overlayCfg());
    });
    overlay.on('closed', () => { overlay = null; send('overlay', false); });
  }
  store.patch('settings', { overlay: on });
  send('overlay', on);
}
function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'build', 'icon-32.png')));
  tray.setToolTip('Rutero');
  trayMenu();
  tray.on('click', () => { win.show(); win.focus(); });
}
function trayMenu() {
  if (!tray) return;
  I18N.set(langNow()); const t = I18N.tr;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('Abrir Rutero'), click: () => { win.show(); win.focus(); } },
    { label: t('Mostrar/ocultar overlay (Ctrl+Mayús+K)'), click: () => toggleOverlay() },
    { label: t('Buscar actualizaciones'), click: () => { win.show(); updater.check(); } },
    { type: 'separator' },
    { label: t('Salir'), click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

// ------------------------------------------------------------- economía y progreso
function localProfile() { return store.get('profile'); }
function checkAchievements(trip) {
  const p = localProfile(); const got = store.get('achievements');
  for (const a of P.ACHIEVEMENTS) {
    if (got[a.id]) continue;
    if (a.test(p, trip)) {
      got[a.id] = Date.now();
      toast(`Logro desbloqueado ${a.icon}`, a.name, 'achievement');
    }
  }
  store.set('achievements', got);
}
function dailyState() {
  const d = store.get('daily');
  const day = P.today();
  if (d.day !== day) { const nd = { day, progress: {}, claimed: {} }; store.set('daily', nd); return nd; }
  return d;
}
function bumpDaily(id, amount = 1) {
  const d = dailyState();
  d.progress[id] = (d.progress[id] || 0) + amount;
  d.claimed = d.claimed || {};
  for (const c of P.dailyChallenges(d.day)) {
    if (c.id === id && !d.claimed[c.id] && d.progress[id] >= c.goal) {
      d.claimed[c.id] = true;
      addWallet(c.reward, 'Reto diario');
      toast('Reto diario completado 🎯', `${c.text} · +${c.reward.toLocaleString(I18N.locale())}`, 'achievement');
    }
  }
  store.set('daily', d);
}
function addWallet(amount, reason) {
  const p = localProfile();
  store.patch('profile', { wallet: Math.round((p.wallet || 0) + amount) });
  if (me) me.money = Math.round((me.money || 0) + amount);
  if (cloud.uid) cloud.addMoney(Math.round(amount), reason).catch(() => queueCloud({ kind: 'money', amount, reason }));
  send('profile', publicProfile());
}
function queueCloud(item) { store.push('pendingCloud', { ...item, at: Date.now() }, 500); }
async function flushCloud() {
  if (!cloud.uid || !cloud.configured) return;
  const q = [...store.get('pendingCloud')].reverse();
  const keep = [];
  for (const it of q) {
    try {
      if (it.kind === 'trip') await cloud.submitTrip(it.trip, it.split, me || {});
      else if (it.kind === 'money') await cloud.addMoney(it.amount, it.reason);
      else if (it.kind === 'fine') await cloud.submitFine(it.fine, me || {});
    } catch { keep.push(it); }
  }
  store.set('pendingCloud', keep.reverse());
}

// Economía realista: el conductor no se queda todo el pago del juego, solo su parte (≈45 %).
// Según la carga se gana más o menos: peligrosas, pesadas o delicadas pagan mejor; las de granel, menos.
const CARGO_RULES = [
  [/explos|adr|gas|acid|ácid|acide|säure|kwas|chem|quím|chim|fuel|petrol|diesel|combust|kraftstoff|paliw|carbur|propan|butan|radio|toxic|tóxic|cyan|amoni|chlor|clor|hydrogen|hidrógen|nitro|pestic/i, 0.12],
  [/glass|vidri|verre|glas|vetro|szkł|electr|elektr|lux|lujo|medic|pharm|farm|arznei|lek|tv|computer|ordenad|jewel|joy|art|helic|yacht|yate|transformer|transformad/i, 0.07],
  [/excav|tract|crane|grúa|grue|kran|dźwig|bulldoz|track|oruga|turbin|beam|viga|pipe|tuber|rohr|rur|machin|maquin|maschin|maszyn|transform|loader|cargador/i, 0.05],
  [/fruit|frut|obst|owoc|meat|carne|viande|fleisch|mięs|fish|pesc|poisson|fisch|ryb|ice|helad|glace|eis|lód|frozen|congel|milk|leche|lait|milch|mlek|yogur|chees|queso|fromage|käse|ser|vacc|vacun|flower|flor|fleur|blum|kwiat/i, 0.04],
  [/sand|arena|sable|piasek|gravel|grava|gravier|kies|żwir|scrap|chatarr|ferraille|schrott|złom|straw|paja|paille|stroh|słom|wood|madera|bois|holz|drewn|log|tronc|stamm|kłod|cement|ciment|zement|brick|ladrill|brique|ziegel|cegł|soil|tierra|terre|erde|ziemia|waste|residu|déchet|abfall|odpad|paper|papel|papier|carton|cartón|karton/i, -0.06],
];
function cargoShare(trip) {
  let share = 0.45;
  const name = `${trip.cargo || ''} ${trip.cargoId || ''}`;
  for (const [re, add] of CARGO_RULES) if (re.test(name)) { share += add; break; }
  const t = (trip.cargoMass || 0) / 1000;
  if (t >= 30) share += 0.04; else if (t > 0 && t < 8) share -= 0.02;
  if ((trip.km || 0) >= 1000) share += 0.03;
  if (trip.special) share += 0.1;
  return Math.max(0.35, Math.min(0.65, Math.round(share * 100) / 100));
}

// requisitos de entrada de una empresa (nivel, km, TruckersMP)
function reqStatus(r = {}) {
  const p = localProfile();
  const lvl = P.levelFromXp(Math.max(p.xp || 0, (me && me.xp) || 0));
  const km = Math.max(p.km || 0, (me && me.km) || 0);
  const out = [];
  if (r.minLevel > 1) out.push({ label: `Nivel ${r.minLevel} o más`, ok: lvl >= r.minLevel });
  if (r.minKm > 0) out.push({ label: `${Math.round(r.minKm).toLocaleString(I18N.locale())} km recorridos`, ok: km >= r.minKm });
  if (r.tmp) out.push({ label: 'Cuenta de TruckersMP enlazada', ok: !!store.get('settings').tmpId });
  return out;
}
async function checkReqs(cid) {
  const { info } = await cloud.companyProfile(cid);
  const miss = reqStatus(info.requirements || {}).filter((x) => !x.ok);
  if (miss.length) throw new Error(`No cumples los requisitos: ${miss.map((x) => x.label).join(', ')}`);
}

// ¿el conductor lleva un vehículo de la flota de su empresa?
const WORD = (s) => String(s || '').toLowerCase().replace(/mercedes-benz/g, 'mercedes').replace(/renault trucks/g, 'renault').replace(/western star/g, 'westernstar');
const GENERIC = new Set(['day', 'cab', 'sleeper', 'roof', 'rise', 'hi', 'mid', 'low', 'high', 'flat', 'stand', 'up', 'ultra', 'studio', 'aerodyne', 'sky', 'new', 'gen', 'rhd', 'shd']);
function sameVehicle(f, truck) {
  const t = WORD(truck); if (!t) return true; // sin datos del juego: no penalizar
  const m = CATALOG.find((x) => x.id === f.modelId) || {};
  const brand = WORD(m.brand || f.brand).split(' ')[0];
  if (brand && !t.includes(brand)) return false;
  const tokens = WORD(m.name || f.model).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !GENERIC.has(w) && !/^\d{4}$/.test(w) && w !== brand);
  return !tokens.length || tokens.some((w) => t.includes(w));
}
async function vehicleCheck(trip) {
  const fleet = (await cloud.fleetOf(me.companyId)).filter((f) => f.kind === 'Camión' || f.kind === 'Autobús');
  if (!fleet.length) return null; // la empresa no tiene flota: cada uno usa su camión
  const mine = fleet.filter((f) => !f.assignedTo || f.assignedTo === (me.name || ''));
  return { own: mine.some((f) => sameVehicle(f, trip.truck)) };
}

// enlaces públicos (Discord, web) y aviso de reportes al canal de moderación de Discord
function loadLinks() {
  for (const p of [path.join(RES, 'config', 'links.json'), path.join(ROOT, 'config', 'links.json')]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* sigue */ }
  }
  return {};
}
const REPORT_TYPES = { driver: '🚚 Conductor', company: '🏢 Empresa', bug: '🐞 Error de la app', other: '📝 Otro' };
async function sendReportToDiscord(r) {
  const hook = loadCloudConfig().discordWebhook;
  if (!hook || !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(hook)) return;
  const clip = (s, n) => String(s || '').slice(0, n) || '—';
  const fields = [
    { name: 'Tipo', value: REPORT_TYPES[r.type] || r.type, inline: true },
    { name: 'Motivo', value: clip(r.reason, 100), inline: true },
  ];
  if (r.target) fields.push({ name: 'Reportado', value: clip(r.target, 100), inline: true });
  if (r.evidence) fields.push({ name: 'Pruebas', value: clip(r.evidence, 400) });
  fields.push({ name: 'Enviado por', value: `${clip(r.reporterName, 60)} · Rutero ${r.version}`, inline: true }, { name: 'ID', value: `\`${r.id}\``, inline: true });
  await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    username: 'Rutero · Reportes', allowed_mentions: { parse: [] },
    embeds: [{ title: `Nuevo reporte: ${clip(r.reason, 200)}`, description: clip(r.description, 1800), color: r.type === 'bug' ? 0xFFB020 : 0xFF5A5F, fields, timestamp: new Date().toISOString() }],
  }) });
}

async function handleTrip(trip) {
  const delivered = trip.status === 'delivered';
  const commission = me && me.companyId && myCompany ? (myCompany.commission || 0) : 0;
  let gross = Math.round(trip.revenue || 0);
  if (delivered && gross > 0 && trip.type !== 'bus' && store.get('settings').realisticEconomy) {
    trip.gameRevenue = gross; trip.share = cargoShare(trip);
    gross = Math.round(gross * trip.share);
  }
  // servicio de autobuses de la empresa: sus rutas pagan más
  if (delivered && gross > 0 && trip.type === 'bus' && trip.routeId && myCompany && myCompany.busUnlocked) {
    trip.busBoost = Math.round(gross * (BUS_BOOST - 1)); gross += trip.busBoost;
  }
  // trabajo de empresa con un vehículo que no es de la flota: se cobra un porcentaje
  if (delivered && gross > 0 && me && me.companyId && (trip.type !== 'bus' || trip.routeId)) {
    const v = await vehicleCheck(trip).catch(() => null);
    if (v && !v.own) { trip.foreignVehicle = true; trip.foreignPct = trip.type === 'bus' ? 15 : 5; trip.foreignFee = Math.round(gross * trip.foreignPct / 100); gross -= trip.foreignFee; }
  }
  const companyCut = delivered && gross > 0 ? Math.round(gross * commission / 100) : 0;
  const net = gross - companyCut;
  let salary = 0;
  if (delivered && me && me.companyId && myMember) {
    salary = Math.round((trip.km || 0) * (myMember.salaryPerKm || 0) + (myMember.salaryPerJob || 0));
    const bank = (myCompany && myCompany.balance || 0) + companyCut;
    salary = Math.max(0, Math.min(salary, bank));
  }
  const xp = delivered ? Math.max(trip.xp || 0, 0) + Math.round((trip.km || 0) / 4) + (trip.score >= 95 ? 60 : 0) + (trip.type === 'bus' ? (trip.stops || 0) * 5 : 0) : 0;
  const owed = (myCompany && myCompany.loan && myCompany.loan.owed) || 0;
  const loanRepay = owed > 0 && companyCut > 0 ? Math.min(owed, Math.round(companyCut * LOAN_AUTOPAY / 100)) : 0;
  const split = { net, companyCut, salary, xp, loanRepay };
  trip.id = trip.id || require('./cloud').newId();
  trip.net = net; trip.companyCut = companyCut; trip.salary = salary; trip.xpGained = xp;

  // perfil local
  const p = localProfile();
  const levelBefore = P.levelFromXp(p.xp);
  const perfect = delivered && trip.score >= 100 && (trip.damage || 0) < 0.005;
  const cleanStreak = delivered ? ((trip.fines || 0) > 0 ? 0 : (p.cleanStreak || 0) + 1) : p.cleanStreak || 0;
  store.patch('profile', {
    wallet: Math.round((p.wallet || 0) + net + salary), xp: (p.xp || 0) + xp, km: (p.km || 0) + (trip.km || 0),
    jobs: (p.jobs || 0) + (delivered && trip.type !== 'bus' ? 1 : 0), busTrips: (p.busTrips || 0) + (delivered && trip.type === 'bus' ? 1 : 0),
    perfect: (p.perfect || 0) + (perfect ? 1 : 0), cancelled: (p.cancelled || 0) + (delivered ? 0 : 1), cleanStreak,
  });
  store.push('jobs', trip, 3000);
  const levelAfter = P.levelFromXp(localProfile().xp);
  if (levelAfter > levelBefore) toast('¡Subes de nivel! ⭐', `Nivel ${levelAfter} · ${P.rankName(levelAfter)}`, 'achievement');

  if (delivered) {
    bumpDaily(trip.type === 'bus' ? 'bus' : 'deliver');
    if (trip.score >= 95) bumpDaily('score');
    if (!(trip.fines > 0) && (trip.damage || 0) < 0.01) bumpDaily('nofine');
  }
  checkAchievements(trip);

  // nube
  if (cloud.uid && cloud.configured) {
    try { await cloud.submitTrip(trip, split, me || {}); me = await cloud.me(); }
    catch { queueCloud({ kind: 'trip', trip, split }); }
    if (delivered && me && me.companyId && trip.km > 0) {
      cloud.wearMyTruck(me.companyId, me.name || '', trip.km).then((t) => {
        if (t && t.condition < 30) toast('Tu vehículo necesita taller 🔧', `${t.model}: ${Math.round(t.condition)}% de estado`, 'warn');
      }).catch(() => {});
    }
  }
  send('trip', trip);
  send('profile', publicProfile());
}

function publicProfile() {
  const p = localProfile();
  const xp = me ? me.xp || 0 : p.xp;
  const level = P.levelFromXp(xp);
  return {
    local: p, online: me, company: myCompany, member: myMember, level, photo: (me && me.photo) || p.photo || '', rank: P.rankName(level), xp,
    xpThis: P.xpForLevel(level), xpNext: P.xpForLevel(level + 1),
    wallet: me ? me.money || 0 : p.wallet,
  };
}

async function refreshOnline() {
  if (!cloud.uid || !cloud.configured) { me = null; myCompany = null; return; }
  try {
    me = await cloud.me();
    if (!me) { try { await ensureMe(); } catch { return; } }
    const inbox = await cloud.claimInbox().catch(() => []);
    for (const x of inbox) toast('Has recibido dinero 💸', `${x.fromName}: +${x.amount.toLocaleString(I18N.locale())}${x.note ? ' · ' + x.note : ''}`, 'money');
    const req = await cloud.checkMyRequest(me).catch(() => null);
    if (req && req.status === 'accepted') toast('¡Te han aceptado! 🏢', `Ya eres parte de ${req.company ? req.company.name : 'la empresa'}`, 'achievement');
    if (req && req.status === 'rejected') toast('Solicitud rechazada', 'La empresa no ha aceptado tu solicitud', 'warn');
    if (inbox.length || (req && req.status !== 'pending')) me = await cloud.me();
    if (me && me.companyId) {
      const bonus = await cloud.claimBonus(me);
      if (bonus > 0) toast('Has recibido un bonus 💸', `+${bonus.toLocaleString(I18N.locale())} de tu empresa`, 'money');
      if (bonus === -1) toast('Empresa', 'Ya no formas parte de tu empresa', 'warn');
      me = await cloud.me();
      myCompany = me.companyId ? await cloud.getDoc(`companies/${me.companyId}`) : null;
      myMember = await cloud.myMember(me).catch(() => null);
    } else { myCompany = null; myMember = null; }
  } catch (e) { console.warn('online', e.message); }
  send('profile', publicProfile());
}

// ------------------------------------------------------------- bucle de telemetría
function startTelemetry() {
  reader = new SharedMemoryReader();
  tracker = new Tracker((type, data) => {
    switch (type) {
      case 'job:started': { const { samples, expenses, ...d } = data; data = d; } send('job', data); toast('Nueva carga', `${data.cargo}: ${data.from} → ${data.to}`); break;
      case 'job:delivered': handleTrip({ type: 'cargo', ...data }); toast('Carga entregada ✅', `${data.cargo} · ${Math.round(data.km)} km · ${data.score} pts`, 'money'); break;
      case 'job:cancelled': handleTrip({ type: 'cargo', ...data }); toast('Trabajo cancelado', `Penalización ${Math.abs(data.revenue).toLocaleString(I18N.locale())}`, 'warn'); break;
      case 'bus:finished': handleTrip(data); toast(data.routeDone ? 'Ruta completada 🚌✅' : 'Ruta de autobús terminada 🚌', `${data.stops} paradas · ${data.passengers} pasajeros${data.routeBonus ? ` · +${data.routeBonus.toLocaleString(I18N.locale())} extra` : ''}`, 'money'); break;
      case 'bus:update': send('bus', data); sendOverlay('bus', data); break;
      case 'bus:stop': toast(data.name ? `Parada ${data.stop}: ${data.name}` : `Parada ${data.stop}`, `Suben ${data.on} · bajan ${data.off} · a bordo ${data.onBoard}`); break;
      case 'expense': {
        const names = { fine: 'Multa', toll: 'Peaje', ferry: 'Ferry', train: 'Tren' };
        store.push('expenses', { ...data, at: Date.now() }, 2000);
        if (data.kind === 'fine') {
          store.patch('profile', { fines: (localProfile().fines || 0) + 1, finesTotal: (localProfile().finesTotal || 0) + (data.amount || 0), cleanStreak: 0 });
          if (cloud.uid && cloud.configured) cloud.submitFine(data, me || {}).catch(() => queueCloud({ kind: 'fine', fine: data }));
        }
        if (store.get('settings').realisticEconomy && data.amount) addWallet(-data.amount, names[data.kind]);
        toast(names[data.kind] || 'Gasto', `${data.detail ? data.detail + ' · ' : ''}-${(data.amount || 0).toLocaleString(I18N.locale())}`, data.kind === 'fine' ? 'warn' : 'info');
        send('expense', data);
        break;
      }
      case 'refuel': send('refuel', data); break;
      case 'alert': toast('Aviso', data.text, 'warn'); break;
    }
  });
  let n = 0;
  setInterval(() => {
    const buf = reader.read();
    if (!buf) { status = 'waiting'; if (n++ % 10 === 0) send('status', { status, tmp: tmpRunning }); return; }
    const t = parse(buf);
    if (!t.sdkActive) status = 'menu';
    else if (t.pluginRev && t.pluginRev !== EXPECTED_REV) status = 'plugin-version';
    else status = t.paused ? 'paused' : 'driving';
    try { tracker.frame(t); } catch (e) { console.error(e); }
    last = t;
    // dKm del odómetro para el reto diario de km
    if (n % 2 === 0) {
      const pj = tracker.publicJob(); if (pj) { delete pj.samples; delete pj.expenses; }
      if (n % 50 === 0) todayStats = computeToday();
      const live = { ...t, status, tmp: tmpRunning || t.multiplayer, ...todayStats, job: pj || null, rawJob: t.job, session: tracker.session };
      send('telemetry', live); sendOverlay('telemetry', live);
    }
    n++;
  }, 100);

  // km para el reto diario (cada 30 s)
  let lastSessionKm = 0;
  setInterval(() => { const d = tracker.session.km - lastSessionKm; lastSessionKm = tracker.session.km; if (d > 0) bumpDaily('km', d); }, 30_000);
  setInterval(async () => { tmpRunning = await tmp.running(); }, 15_000);
  tmp.running().then((r) => { tmpRunning = r; });
}

// ------------------------------------------------------------- IPC
const { CATALOG, BRANDS } = require('./catalog');
const TRUCK_SHOP = CATALOG.filter((m) => !['garage', 'hq'].includes(m.id));

function wrap(fn) {
  return async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  };
}
// se asegura de tener el perfil online cargado (y lo crea si la cuenta no tiene ficha)
async function ensureMe() {
  if (!cloud.configured) throw new Error('El modo online no está configurado');
  if (!cloud.uid) throw new Error('Inicia sesión primero en Ajustes → Cuenta online');
  if (!me) me = await cloud.me();
  if (!me) {
    await cloud.updateMe({ name: localProfile().name || 'Conductor', photo: localProfile().photo || '', money: 0, xp: 0, km: 0, jobs: 0, busTrips: 0, companyId: '', companyName: '', companyTag: '', pendingCompanyId: '' });
    me = await cloud.me();
  }
  if (!me) throw new Error('No se pudo cargar tu perfil online');
  return me;
}
const safeSettings = () => { const { botToken, ...rest } = store.get('settings'); return { ...rest, hasBotToken: !!botToken }; };
// ---------------------------------------------------------------- Discord
// Enlaza la cuenta de Discord del conductor (OAuth en una ventanita; solo pide «identify»)
function discordLogin() {
  return new Promise((resolve, reject) => {
    const state = Math.random().toString(36).slice(2);
    const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT}&response_type=token&scope=identify&prompt=consent&state=${state}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT)}`;
    const w = new BrowserWindow({ width: 520, height: 800, parent: win, modal: false, autoHideMenuBar: true, title: 'Conectar Discord', icon: ICON, backgroundColor: '#0A0D18', webPreferences: { partition: 'persist:discord-login' } });
    let done = false;
    const check = (e, u) => {
      if (done || !String(u).startsWith(DISCORD_REDIRECT)) return;
      if (e && e.preventDefault) e.preventDefault();
      done = true;
      const q = new URLSearchParams(String(u).split('#')[1] || String(u).split('?')[1] || '');
      setTimeout(() => { if (!w.isDestroyed()) w.close(); }, 50);
      if (q.get('error')) return reject(new Error('Has cancelado la conexión con Discord'));
      if (q.get('state') !== state || !q.get('access_token')) return reject(new Error('No se pudo conectar con Discord'));
      resolve(q.get('access_token'));
    };
    w.webContents.on('will-redirect', check);
    w.webContents.on('will-navigate', check);
    w.webContents.on('did-navigate', (e, u) => check(null, u));
    w.on('closed', () => { if (!done) reject(new Error('Has cerrado la ventana de Discord')); });
    w.loadURL(url);
  });
}
async function maybeStartBot() {
  if (!bot || !store.get('settings').botToken || !cloud.uid) return;
  try {
    const cfg = await cloud.discordConfig();
    if (cfg && cfg.adminUid === cloud.uid) await bot.start();
  } catch (e) { console.warn('bot', e.message); }
}
async function botInfo() {
  let cfg = null; try { cfg = cloud.uid ? await cloud.discordConfig() : null; } catch { /* */ }
  return { ...bot.status(), admin: !cfg || !cfg.adminUid ? 'none' : cfg.adminUid === cloud.uid ? 'me' : 'other' };
}
function registerIpc() {
  const NEEDS_ME = /^(company:|cloud:send|cloud:linkTmp)/;
  const h = (ch, fn) => ipcMain.handle(ch, wrap(async (...a) => { if (NEEDS_ME.test(ch)) await ensureMe(); return fn(...a); }));
  h('win', (cmd) => { if (cmd === 'min') win.minimize(); else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (cmd === 'close') win.hide(); else if (cmd === 'quit') { app.isQuitting = true; app.quit(); } });
  h('state', () => ({
    lang: langNow(), links: loadLinks(), loanOptions: LOAN_OPTIONS, loanRate: LOAN_RATE, loanAutopay: LOAN_AUTOPAY, busUnlockPrice: BUS_UNLOCK_PRICE, busBoost: BUS_BOOST,
    settings: safeSettings(), profile: publicProfile(), jobs: store.get('jobs').slice(0, 300), expenses: store.get('expenses').slice(0, 200),
    achievements: P.ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, unlockedAt: store.get('achievements')[a.id] || null })),
    daily: { ...dailyState(), list: P.dailyChallenges(dailyState().day) },
    cloudReady: cloud.configured, loggedIn: !!cloud.uid, email: cloud.auth && cloud.auth.email,
    pending: store.get('pendingCloud').length, version: app.getVersion(), status, bus: tracker && tracker.bus, shop: TRUCK_SHOP, brands: BRANDS, garages: GARAGES, baseSlots: BASE_SLOTS,
  }));
  h('settings:set', (s) => {
    store.patch('settings', s);
    if (s.startWithWindows !== undefined) app.setLoginItemSettings({ openAtLogin: !!s.startWithWindows });
    if (s.overlay !== undefined) toggleOverlay(!!s.overlay);
    if (s.overlayOpacity !== undefined) sendOverlay('opacity', s.overlayOpacity);
    if (s.overlayCfg !== undefined) applyOverlayCfg();
    if (s.language !== undefined) { trayMenu(); if (overlay && !overlay.isDestroyed()) overlay.reload(); }
    return safeSettings();
  });
  h('profile:name', async (name) => { store.patch('profile', { name }); if (cloud.uid) { await cloud.setName(name, me || {}); me = await cloud.me(); } return publicProfile(); });
  h('overlay', (on) => toggleOverlay(on));
  h('overlay:cfg', () => overlayCfg());
  h('overlay:size', (w, h2) => { placeOverlay(w, h2); });
  h('overlay:reset', () => { store.patch('settings', { overlayCfg: {} }); applyOverlayCfg(); return overlayCfg(); });
  h('cloud:reset', (email) => cloud.resetPassword(email));
  h('open', (url) => shell.openExternal(url));

  // plugin
  h('plugin:status', async () => {
    const games = await plugin.findGames(store.get('settings').gamePaths || {});
    return Object.fromEntries(Object.entries(games).map(([id, dir]) => [id, { dir, ...plugin.pluginStatus(dir) }]));
  });
  h('plugin:install', async (id) => {
    const games = await plugin.findGames(store.get('settings').gamePaths || {});
    if (!games[id]) throw new Error('No se encuentra el juego. Elige la carpeta manualmente.');
    return plugin.installPlugin(games[id], RES, (m) => send('plugin:log', m));
  });
  h('plugin:choose', async (id) => {
    const r = await dialog.showOpenDialog(win, { title: `Carpeta de ${plugin.GAMES[id]}`, properties: ['openDirectory'] });
    if (r.canceled) return null;
    const dir = r.filePaths[0];
    if (!fs.existsSync(path.join(dir, 'bin', 'win_x64'))) throw new Error('Esa carpeta no contiene bin\\win_x64');
    const gp = { ...(store.get('settings').gamePaths || {}), [id]: dir };
    store.patch('settings', { gamePaths: gp });
    return dir;
  });

  // autobús
  h('bus:start', (o) => { tracker.startBus(o); return tracker.bus; });
  h('bus:end', () => tracker.endBus());
  h('bus:cancel', () => { tracker.bus = null; send('bus', null); sendOverlay('bus', null); });

  // TruckersMP
  for (const k of Object.keys(tmp)) h(`tmp:${k}`, (...a) => tmp[k](...a));

  // nube
  h('cloud:setKey', async (apiKey, projectId) => {
    apiKey = String(apiKey || '').trim();
    if (!/^AIza[\w-]{20,}$/.test(apiKey)) throw new Error('Esa clave no parece correcta: debe empezar por AIza');
    const cur = loadCloudConfig();
    const cfg = { apiKey, projectId: String(projectId || cur.projectId || 'rutero-a0abb').trim() };
    fs.writeFileSync(userCloudFile(), JSON.stringify(cfg, null, 2));
    cloud = new Cloud(cfg, store);
    me = null; myCompany = null; myMember = null;
    await refreshOnline();
    return true;
  });
  h('cloud:register', async (email, pass, name) => { me = await cloud.register(email, pass, name || localProfile().name || String(email || '').split('@')[0] || 'Conductor'); if (!localProfile().name) store.patch('profile', { name: me.name }); await refreshOnline(); return publicProfile(); });
  h('cloud:login', async (email, pass) => { me = await cloud.login(email, pass); await refreshOnline(); flushCloud(); maybeStartBot(); return publicProfile(); });
  h('cloud:logout', () => { bot && bot.stop(); cloud.signOut(); me = null; myCompany = null; send('profile', publicProfile()); });
  h('cloud:refresh', async () => { await refreshOnline(); return publicProfile(); });
  h('cloud:ranking', (scope, field, period) => cloud.ranking(scope, field, period));
  h('cloud:driver', (uid) => cloud.driver(uid));
  h('cloud:myTrips', () => cloud.myTrips());
  h('cloud:linkTmp', async (id) => { const pl = await tmp.player(id); me = await cloud.updateMe({ tmpId: String(pl.id), tmpName: pl.name }); store.patch('settings', { tmpId: String(pl.id) }); return pl; });
  h('update:state', () => updater.state());
  h('update:check', () => updater.check());
  h('update:download', () => updater.download());
  h('update:install', () => updater.install());
  h('photos:refresh', () => { store.set('photoCache', {}); return true; });
  h('photos', (ids) => photos.many(TRUCK_SHOP.filter((m) => !ids || ids.includes(m.id)), !!store.get('settings').realPhotos));
  h('cloud:fines', () => cloud.myFines());
  h('cloud:transfers', () => cloud.myTransfers());
  h('cloud:send', async (uid, name, amount, note) => { await cloud.sendMoney(uid, name, amount, note, me); await refreshOnline(); });
  h('profile:photo', async (photo) => {
    store.patch('profile', { photo });
    if (cloud.uid) { await cloud.setPhoto(photo, me || {}); me = await cloud.me(); }
    send('profile', publicProfile()); return publicProfile();
  });
  h('company:create', async (o) => { await cloud.createCompany(o, me); await refreshOnline(); return publicProfile(); });
  h('company:join', async (code) => { await cloud.joinCompany(code, me); await refreshOnline(); return publicProfile(); });
  h('company:request', async (cid, msg) => { await checkReqs(cid); await cloud.requestJoin(cid, msg, me); me = await cloud.me(); send('profile', publicProfile()); });
  h('company:joinOpen', async (cid) => { await checkReqs(cid); await cloud.joinOpen(cid, me); await refreshOnline(); return publicProfile(); });
  h('company:profile', (cid) => cloud.companyProfile(cid));
  h('company:rate', async (cid, stars, comment) => { await cloud.rateCompany(cid, stars, comment, me || {}); return cloud.companyProfile(cid); });
  h('company:cancelRequest', async () => { await cloud.cancelRequest(me); me = await cloud.me(); send('profile', publicProfile()); });
  h('company:answer', (uid, ok) => cloud.answerRequest(me.companyId, uid, ok));
  h('company:leave', async () => { await cloud.leaveCompany(me); await refreshOnline(); return publicProfile(); });
  h('company:get', (id) => cloud.company(id || (me && me.companyId)));
  h('company:browse', () => cloud.browseCompanies());
  h('company:update', async (data) => { await cloud.updateCompany(me.companyId, data); await refreshOnline(); });
  h('company:newCode', () => cloud.newJoinCode(me.companyId));
  h('company:role', (uid, role) => cloud.setRole(me.companyId, uid, role));
  h('company:salary', async (uid, perKm, perJob) => { await cloud.setSalary(me.companyId, uid, perKm, perJob); if (uid === cloud.uid) myMember = await cloud.myMember(me); });
  h('company:kick', (uid, name) => cloud.kick(me.companyId, uid, name, me));
  h('company:transfer', async (uid, name) => { await cloud.transferOwnership(me.companyId, uid, name); await refreshOnline(); });
  h('company:bonus', (uid, name, amount, note, from) => cloud.payBonus(me.companyId, uid, name, amount, note, me, from || 'main'));
  h('company:deposit', async (amount, to) => { await cloud.deposit(me.companyId, amount, me, to || 'main'); await refreshOnline(); });
  h('company:account', (name, color) => cloud.createAccount(me.companyId, name, color, me));
  h('company:move', (from, to, amount, names) => cloud.moveMoney(me.companyId, from, to, amount, names, me));
  h('company:closeAccount', (acc) => cloud.deleteAccount(me.companyId, acc, me));
  h('company:buy', (modelId, color, from) => { const mdl = TRUCK_SHOP.find((m) => m.id === modelId); if (!mdl || mdl.soon) throw new Error('Este modelo llegará próximamente'); return cloud.buyTruck(me.companyId, mdl, me, color, from || 'main'); });
  h('company:garage', (o, from) => cloud.buyGarage(me.companyId, o, me, from || 'main'));
  h('company:sellGarage', (g) => cloud.sellGarage(me.companyId, g, me));
  h('company:park', (truckId, garageId) => cloud.parkTruck(me.companyId, truckId, garageId));
  h('company:repair', (truck, from) => cloud.repairTruck(me.companyId, truck, me, from || 'main'));
  h('company:memberMeta', (uid, meta) => cloud.setMemberMeta(me.companyId, uid, meta));
  h('company:event', (ev) => cloud.createEvent(me.companyId, ev, me));
  h('company:deleteEvent', (id) => cloud.deleteEvent(me.companyId, id));
  h('company:attend', (id, going) => cloud.attendEvent(me.companyId, id, me.name || '', going));
  h('company:news', (n) => cloud.postNews(me.companyId, n, me));
  h('company:busroute', (r) => cloud.saveBusRoute(me.companyId, r, me));
  h('company:busrouteDel', (id) => cloud.deleteBusRoute(me.companyId, id));
  h('company:loan', async (amount) => { await cloud.takeLoan(me.companyId, amount, me); await refreshOnline(); });
  h('company:repay', async (amount) => { await cloud.repayLoan(me.companyId, amount, me); await refreshOnline(); });
  h('company:unlockBus', async () => { await cloud.unlockBus(me.companyId, me); await refreshOnline(); });
  // ---- Discord: conductores
  h('discord:link', async () => {
    if (!cloud.uid) throw new Error('Inicia sesión primero');
    const token = await discordLogin();
    const r = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error('Discord no ha devuelto tu cuenta, inténtalo otra vez');
    me = await cloud.linkDiscord(await r.json());
    send('profile', publicProfile());
    if (bot && bot.state.running) setTimeout(() => bot.sync().catch(() => {}), 1500);
    return publicProfile();
  });
  h('discord:unlink', async () => { me = await cloud.unlinkDiscord(); send('profile', publicProfile()); return publicProfile(); });
  h('company:discord', async (type, extra) => {
    if (!['register', 'promo'].includes(type)) throw new Error('Petición no válida');
    await cloud.discordRequest(me.companyId, type, extra || {}, me);
    if (bot && bot.state.running) setTimeout(() => bot.sync().catch(() => {}), 1000);
    return true;
  });
  h('company:discordInfo', async () => (me && me.companyId ? cloud.getDoc(`discordMap/${me.companyId}`) : null));
  // ---- Discord: administrador del bot
  h('bot:info', () => botInfo());
  h('bot:claim', async () => { await cloud.claimDiscordAdmin(); return botInfo(); });
  h('bot:token', async (token) => {
    token = String(token || '').trim().replace(/^Bot\s+/i, '');
    if (token.length < 50) throw new Error('Eso no parece un token de bot');
    const cfg = await cloud.discordConfig();
    if (!cfg || cfg.adminUid !== cloud.uid) await cloud.claimDiscordAdmin();
    await bot.checkToken(token);
    bot.stop(); store.patch('settings', { botToken: token });
    await bot.start();
    return botInfo();
  });
  h('bot:setup', async () => { if (!bot.state.running) await bot.start(); const r = await bot.setup((t) => send('bot:progress', t)); return { ...r, info: await botInfo() }; });
  h('bot:sync', async () => { await bot.sync(); return botInfo(); });
  h('bot:forget', async () => { bot.stop(); store.patch('settings', { botToken: '' }); return botInfo(); });
  h('report:send', async (r) => {
    if (!cloud.uid) throw new Error('Inicia sesión primero');
    const rep = await cloud.submitReport({ ...r, version: app.getVersion() }, me || {});
    await sendReportToDiscord(rep).catch(() => {});
    return true;
  });
  h('company:deleteNews', (id) => cloud.deleteNews(me.companyId, id));
  h('company:assign', (truckId, driver) => cloud.assignTruck(me.companyId, truckId, driver));
  h('company:sell', (truck) => cloud.sellTruck(me.companyId, truck, me));
}

// ------------------------------------------------------------- arranque
app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  cloud = new Cloud(loadCloudConfig(), store);
  photos = new Photos(store, [path.join(RES, 'config'), path.join(ROOT, 'config')]);
  bot = new DiscordBot({ store, getCloud: () => cloud, root: ROOT, log: (...a) => console.warn('[bot]', ...a) });
  updater = setupUpdater(send);
  registerIpc();
  createWindow();
  createTray();
  startTelemetry();
  if (store.get('settings').overlay) toggleOverlay(true);
  globalShortcut.register('CommandOrControl+Shift+K', () => toggleOverlay());
  refreshOnline().then(flushCloud).then(maybeStartBot);
  setInterval(() => { refreshOnline(); flushCloud(); }, 5 * 60_000);
  // busca actualizaciones al arrancar y cada 6 horas
  setTimeout(() => updater.check(), 8000);
  setInterval(() => updater.check(), 6 * 3600_000);
});
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
app.on('before-quit', () => { app.isQuitting = true; store && store.flush(); reader && reader.disconnect(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
