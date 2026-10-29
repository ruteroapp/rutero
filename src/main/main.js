const { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { parse, SharedMemoryReader, EXPECTED_REV } = require('./telemetry');
const { Tracker } = require('./tracker');
const { Store } = require('./store');
const { Cloud, CREATE_PRICE, GARAGES, BASE_SLOTS, LOAN_OPTIONS, LOAN_RATE, LOAN_AUTOPAY, BUS_UNLOCK_PRICE, BUS_BOOST } = require('./cloud');
const { tmp } = require('./truckersmp');
const plugin = require('./plugin');
const { Photos } = require('./photos');
const { setupUpdater } = require('./updater');
const P = require('./progress');
const { watchKey, watchKeys } = require('./keys');
const { DiscordBot, buildRegister, buildPromo, postWebhook, announceRelease, announceBusWeek } = require('./discordbot');
const DISCORD_CLIENT = '1563527823522533426';
const DISCORD_REDIRECT = 'https://ruteroapp.github.io/rutero/discord.html';

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('com.rutero.app');
// enlace rutero:// (para volver a la app después de conectar Discord en el navegador)
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('rutero', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('rutero');

const ROOT = path.join(__dirname, '..', '..');
const RES = app.isPackaged ? process.resourcesPath : ROOT;
const ICON = path.join(ROOT, 'build', 'icon.png');

let win, overlay, tray, store, cloud, tracker, reader, photos, updater, bot;
let me = null;          // perfil online
let myCompany = null;   // datos básicos de mi empresa (comisión)
let myMember = null;    // mi ficha dentro de la empresa (sueldo)
let last = null;        // último fotograma
let status = 'waiting';
let gameSeenAt = 0; // última vez que el juego estaba abierto
// Actualización descargada: se instala sola (sin preguntar) cuando el juego lleva 2 minutos cerrado y no hay ruta en marcha.
let autoInstalling = false;
function autoInstall() {
  if (!updater || autoInstalling || updater.state().status !== 'ready') return;
  if (status !== 'waiting' || Date.now() - gameSeenAt < 2 * 60_000 || (tracker && tracker.bus) || recording) return;
  autoInstalling = true;
  toast('Actualizando Rutero', 'Se cierra y se vuelve a abrir solo en unos segundos');
  setTimeout(() => { if (status === 'waiting') updater.install(true); else autoInstalling = false; }, 12_000);
}
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
// ---------- overlay personalizable ----------
const OVERLAY_DEFAULT = {
  widgets: { speed: true, limit: true, gear: true, job: true, remaining: true, eta: true, score: true, fuel: true, damage: false, clock: false, rpm: false, cruise: false, earnings: false, rest: false },
  position: 'tl', layout: 'box', scale: 1, accent: '#4C8DFF', theme: 'dark', compact: false, locked: false, opacity: 0.88, x: null, y: null,
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
    const right = c.position === 'tr' || c.position === 'br'; const bottom = c.position === 'bl' || c.position === 'br' || c.position === 'bc';
    const center = c.position === 'tc' || c.position === 'bc';
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
    const bank = (myCompany && myCompany.companyAccBalance || 0) + companyCut; // el sueldo sale de la cuenta de empresa
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
    local: p, online: me, company: myCompany, member: myMember, level, busUnlocked: busAllowed(), canRoutes: canRoutes(), busName: (myCompany && myCompany.busName) || '', photo: (me && me.photo) || p.photo || '', rank: P.rankName(level), xp,
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
      if (myCompany) myCompany.companyAccBalance = await cloud.available(me.companyId, 'empresa').catch(() => 0);
      myMember = await cloud.myMember(me).catch(() => null);
    } else { myCompany = null; myMember = null; }
  } catch (e) { console.warn('online', e.message); }
  send('profile', publicProfile());
}

// ------------------------------------------------------------- bucle de telemetría
function startTelemetry() {
  reader = new SharedMemoryReader();
  tracker = new Tracker((type, data) => {
    // Rutero solo cuenta en multijugador (TruckersMP o HaulMP): en el juego base no se guardan trabajos, rutas ni multas
    if (['job:started', 'job:delivered', 'job:cancelled', 'bus:finished', 'expense'].includes(type) && !(data.multiplayer || (last && last.multiplayer) || tmpRunning)) {
      if (type === 'job:started' || type === 'bus:finished') toast('Solo en multijugador', 'Rutero solo registra trabajos jugando en TruckersMP o HaulMP', 'warn');
      return;
    }
    if (['job:delivered', 'job:cancelled', 'bus:finished'].includes(type)) { data.multiplayer = true; data.mp = tmpRunning || 'TruckersMP'; }
    switch (type) {
      case 'job:started': { const { samples, expenses, ...d } = data; data = d; } send('job', data); toast('Nueva carga', `${data.cargo}: ${data.from} → ${data.to}`); break;
      case 'job:delivered': handleTrip({ type: 'cargo', ...data }); toast('Carga entregada ✅', `${data.cargo} · ${Math.round(data.km)} km · ${data.score} pts`, 'money'); break;
      case 'job:cancelled': handleTrip({ type: 'cargo', ...data }); toast('Trabajo cancelado', `Penalización ${Math.abs(data.revenue).toLocaleString(I18N.locale())}`, 'warn'); break;
      case 'bus:finished':
        // la fama de tus rutas: la media de satisfacción hace que la próxima vez espere más (o menos) gente
        if (data.myRouteId) store.set('busRoutes', (store.get('busRoutes') || []).map((r) => (r.id === data.myRouteId ? { ...r, rating: Math.round(((r.rating ?? 80) + data.satisfaction) / 2), runs: (r.runs || 0) + 1 } : r)));
        handleTrip(data); toast(data.routeDone ? 'Ruta completada 🚌✅' : 'Ruta de autobús terminada 🚌', `${data.stops} paradas · ${data.passengers} pasajeros · ${'★'.repeat(data.stars)}${'☆'.repeat(5 - data.stars)}${data.routeBonus ? ` · +${data.routeBonus.toLocaleString(I18N.locale())} extra` : ''}`, 'money'); break;
      case 'bus:announce': announceStop(data); break;
      case 'bus:update': send('bus', data); sendOverlay('bus', data); break;
      case 'bus:stop': if (data.doors) send('sound', 'doorClose'); toast(data.name ? `Parada ${data.stop}: ${data.name}` : `Parada ${data.stop}`, `Suben ${data.on} · bajan ${data.off} · a bordo ${data.onBoard}${data.left ? ` · ${data.left} se quedan en tierra` : ''}${data.tip >= 1 ? ` · propinas ${Math.round(data.tip)}` : ''}`); sendOverlay('toast', { title: `🚏 ${data.name || `Parada ${data.stop}`}`, body: `+${data.on} / -${data.off} · ${data.onBoard} a bordo` }); break;
      case 'bus:doors': if (data.open === false) break; send('sound', 'doorOpen'); if (data.offStop) break; sendOverlay('toast', { title: '🚪 Puertas abiertas', body: `${data.alighting} bajan · ${data.waiting} esperando${data.name ? ` · ${data.name}` : ''}` });
        if (data.delay !== null && data.delay !== undefined) {
          if (data.delay <= Tracker.ON_TIME) toast('⏱ Puntual', data.delay < -60 ? `Llegas ${Math.round(-data.delay / 60)} min antes · cobras el extra de puntualidad` : 'Cobras el extra de puntualidad', 'money');
          else toast('⏱ Llegas tarde', `${Math.round(data.delay / 60)} min de retraso${data.delay > Tracker.VERY_LATE ? ': parte de la gente se ha cansado de esperar' : ''}`, 'warn');
        }
        break;
      case 'bus:stopPos':
        if (data.mine) { store.set('busRoutes', (store.get('busRoutes') || []).map((r) => (r.id === data.routeId ? { ...r, stopPos: [...(r.stopPos || []).filter((x) => !(x.name === data.pos.name && x.g === data.pos.g)), data.pos] } : r))); }
        else if (data.routeId && me && me.companyId) cloud.saveStopPos(me.companyId, data.routeId, data.pos).catch((e) => console.warn('parada', e.message));
        break;
      case 'bus:warn': sendOverlay('toast', { title: '⚠️ Autobús', body: data }); toast('Autobús', data); break;
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
    if (buf) gameSeenAt = Date.now();
    if (!buf) { status = 'waiting'; if (n++ % 10 === 0) send('status', { status, tmp: !!tmpRunning, mpName: tmpRunning || 'TruckersMP' }); return; }
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
      const live = { ...t, status, tmp: !!(tmpRunning || t.multiplayer), mpName: tmpRunning || 'TruckersMP', ...todayStats, job: pj || null, rawJob: t.job, session: tracker.session };
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
// en venta: autobuses y solo los camiones que tienen foto sacada del juego (config/fotos/<id>.png…); los remolques ya no se venden
const hasGamePhoto = (id) => [RES, ROOT].some((r) => ['png', 'webp', 'jpg', 'jpeg'].some((e) => fs.existsSync(path.join(r, 'config', 'fotos', `${id}.${e}`))));
const TRUCK_SHOP = CATALOG.filter((m) => !['garage', 'hq'].includes(m.id) && m.kind !== 'Remolque' && (m.kind !== 'Camión' || hasGamePhoto(m.id)));

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
// Se abre en el navegador normal (Chrome, Edge…): Discord vuelve a la web de Rutero y esta abre la app con rutero://discord
let discordPending = null;
function discordLogin() {
  if (discordPending) discordPending.reject(new Error('Se ha empezado otra conexión'));
  return new Promise((resolve, reject) => {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT}&response_type=token&scope=identify&prompt=consent&state=${state}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT)}`;
    const timer = setTimeout(() => { if (discordPending && discordPending.state === state) { discordPending = null; reject(new Error('No se ha completado la conexión con Discord (5 minutos)')); } }, 5 * 60 * 1000);
    discordPending = { state, resolve: (t) => { clearTimeout(timer); discordPending = null; resolve(t); }, reject: (e) => { clearTimeout(timer); discordPending = null; reject(e); } };
    shell.openExternal(url);
  });
}
// rutero://discord?access_token=…&state=…  (llega al abrir el enlace desde el navegador)
function handleProtocolUrl(u) {
  if (!u || !/^rutero:\/\//i.test(u)) return;
  if (win) { win.show(); win.focus(); }
  const q = new URLSearchParams(String(u).replace(/^rutero:\/\/[^?#]*[?#]?/i, ''));
  if (!discordPending) return;
  if (q.get('error')) return discordPending.reject(new Error('Has cancelado la conexión con Discord'));
  if (q.get('state') !== discordPending.state || !q.get('access_token')) return discordPending.reject(new Error('No se pudo conectar con Discord, inténtalo otra vez'));
  discordPending.resolve(q.get('access_token'));
}
// ---------------------------------------------------------------- voz de las paradas (español o inglés)
const VOICE = {
  es: { next: (n, last) => `Próxima parada: ${n}.${last ? ' Final de trayecto.' : ''}`, arriving: (n, last) => `${last ? 'Final de trayecto' : 'Parada'}: ${n}.`, end: () => 'Final de trayecto. Gracias por viajar con nosotros.' },
  en: { next: (n, last) => `Next stop: ${n}.${last ? ' This is the last stop.' : ''}`, arriving: (n, last) => `${last ? 'Last stop' : 'This is'}: ${n}.`, end: () => 'This is the last stop. Thank you for travelling with us.' },
};
function voiceLang() {
  const v = store.get('settings').busVoice || 'auto';
  if (v === 'off') return '';
  if (v === 'es' || v === 'en') return v;
  return langNow() === 'es' ? 'es' : 'en';
}
function announceStop(d) {
  const lang = voiceLang(); if (!lang) return;
  const V = VOICE[lang]; const text = V[d.kind] && V[d.kind](d.name || '', !!d.last);
  if (text) send('say', { text, lang, chime: d.kind !== 'arriving' });
}
// ---------------------------------------------------------------- grabar una ruta de autobús conduciendo
let recording = null; // { startedAt, game, points: [{x,z} salida, {x,z} parada 1, …] }
function notify(title, body) { sendOverlay('toast', { title, body }); send('rec', recording ? publicRec() : null); toast(title, body); }
const publicRec = () => ({ startedAt: recording.startedAt, count: recording.points.length, stops: recording.points.map((_, i) => i) });
// el modo autobús solo funciona si la empresa ha activado el servicio de autobuses
const busAllowed = () => !!(myCompany && myCompany.busUnlocked);
// permiso «rutas» del rol (Roles y permisos): gerentes y fundador siempre pueden
const canRoutes = () => {
  if (!myCompany || !myMember) return false;
  if (myMember.role === 'owner' || myMember.role === 'admin') return true;
  const rp = myCompany.rolePerms || {};
  const list = (myMember.title && rp[myMember.title]) || myCompany.basePerms || [];
  return list.includes('rutas');
};
// grabar una ruta conduciendo (con Mayús pulsada): F1 empieza en la salida y termina en el destino, F2 marca cada parada, F3 deshace la última
function recordKey(k) {
  if (!busAllowed()) return;
  if (k === 'F1' && !recording && !canRoutes()) return notify('Sin permiso', 'Tu rol no puede crear rutas de bus');
  const p = last && last.pos;
  if (!p) return;
  const here = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 };
  const far = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) > 60;
  if (k === 'F1') {
    if (!recording) {
      recording = { startedAt: Date.now(), game: last.game || '', points: [here] };
      return notify('⏺ Grabando ruta', 'Salida guardada. Shift+F2 en cada parada, Shift+F1 en el destino');
    }
    // el sitio donde se pulsa F1 es el destino
    const pts = recording.points.slice();
    if (far(pts[pts.length - 1], here)) pts.push(here);
    if (pts.length < 2) { recording = null; send('rec', null); return notify('Grabación cancelada', 'Conduce hasta el destino antes de pulsar Shift+F1'); }
    const names = pts.map((_, n) => (n === 0 ? 'Salida' : n === pts.length - 1 ? 'Destino' : `Parada ${n}`));
    const d = new Date();
    const route = { id: `r${Date.now().toString(36)}`, code: '', name: `Ruta grabada ${d.toLocaleDateString(I18N.locale(), { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })}`,
      stops: names, color: '#19C3B1', fare: 5, perKm: 8, capacity: 55, recorded: true,
      stopPos: pts.map((pt, n) => ({ name: names[n], ...pt, g: recording.game })) };
    store.set('busRoutes', [route, ...(store.get('busRoutes') || [])].slice(0, 50));
    recording = null;
    send('busRoutes', store.get('busRoutes'));
    return notify('✅ Ruta guardada', `${names.length} paradas. Ponle nombre en Rutero → Autobús → Mis rutas`);
  }
  // durante una ruta (sin grabar), Mayús+F2 = «la parada está aquí»: corrige dónde está la próxima parada
  if (!recording && k === 'F2' && tracker && tracker.bus) {
    const name = tracker.relocateStop();
    return name ? notify('📍 Parada movida aquí', name) : null;
  }
  if (!recording) return; // F2 y F3 solo cuentan mientras se graba
  if (k === 'F2') {
    if (!far(recording.points[recording.points.length - 1], here)) return notify('📍 Ya hay una parada aquí', 'Avanza hasta la siguiente parada');
    recording.points.push(here);
    return notify(`📍 Parada ${recording.points.length - 1} guardada`, 'Shift+F2 siguiente parada · Shift+F3 deshacer · Shift+F1 destino');
  }
  if (k === 'F3') {
    if (recording.points.length < 2) return notify('Nada que deshacer', 'Todavía no has marcado paradas');
    recording.points.pop();
    return notify('↩ Última parada borrada', `${recording.points.length - 1} paradas`);
  }
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
  return { ...bot.status(), admin: !cfg || !cfg.adminUid ? 'none' : cfg.adminUid === cloud.uid ? 'me' : 'other', workerUrl: store.get('settings').botWorker || loadLinks().botWorker || '', workerBeat: (cfg && cfg.workerBeat) || '' };
}
function registerIpc() {
  const NEEDS_ME = /^(company:|cloud:send|cloud:linkTmp)/;
  const h = (ch, fn) => ipcMain.handle(ch, wrap(async (...a) => { if (NEEDS_ME.test(ch)) await ensureMe(); return fn(...a); }));
  h('win', (cmd) => { if (cmd === 'min') win.minimize(); else if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (cmd === 'close') win.hide(); else if (cmd === 'quit') { app.isQuitting = true; app.quit(); } });
  h('state', () => ({
    lang: langNow(), createPrice: CREATE_PRICE, busUnlocked: busAllowed(), canRoutes: canRoutes(), busName: (myCompany && myCompany.busName) || '', links: loadLinks(), loanOptions: LOAN_OPTIONS, loanRate: LOAN_RATE, loanAutopay: LOAN_AUTOPAY, busUnlockPrice: BUS_UNLOCK_PRICE, busBoost: BUS_BOOST,
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
  h('bus:start', (o) => { if (!busAllowed()) throw new Error('Tu empresa tiene que activar el servicio de autobuses'); tracker.startBus(o); return tracker.bus; });
  h('bus:end', () => tracker.endBus());
  h('bus:doors', () => tracker.toggleDoors());
  h('bus:relocate', () => { const n = tracker.relocateStop(); if (!n) throw new Error('No hay ninguna parada que mover'); return tracker.bus; });
  h('bus:routes', () => store.get('busRoutes') || []);
  h('bus:rec', () => (recording ? publicRec() : null));
  h('bus:recCancel', () => { recording = null; send('rec', null); return null; });
  h('bus:routeSave', (r) => {
    if (!canRoutes()) throw new Error('Tu rol no puede crear rutas de bus');
    const stops = (Array.isArray(r.stops) ? r.stops : String(r.stops || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 60);
    if (!String(r.name || '').trim()) throw new Error('Pon un nombre a la ruta');
    if (stops.length < 2) throw new Error('La ruta necesita al menos 2 paradas (salida y destino)');
    const route = { id: r.id || `r${Date.now().toString(36)}`, code: String(r.code || '').trim().slice(0, 8), name: String(r.name).trim().slice(0, 60), stops, color: r.color || '#4C8DFF',
      fare: Math.max(0, Math.min(100, Number(r.fare ?? 5) || 0)), perKm: Math.max(0, Math.min(30, Number(r.perKm ?? 8) || 0)), capacity: Math.max(8, Math.min(120, Math.round(Number(r.capacity) || 55))) };
    const prev = (store.get('busRoutes') || []).find((x) => x.id === route.id);
    // se conservan las paradas ya ubicadas (si solo se han renombrado, se siguen por su posición en la lista)
    const old = (prev && prev.stopPos) || [];
    route.stopPos = prev && prev.stops && prev.stops.length === stops.length
      ? old.map((p) => { const i = prev.stops.indexOf(p.name); return i >= 0 ? { ...p, name: stops[i] } : null; }).filter(Boolean)
      : old.filter((p) => stops.includes(p.name));
    const list = (store.get('busRoutes') || []).filter((x) => x.id !== route.id);
    store.set('busRoutes', [route, ...list].slice(0, 50));
    return store.get('busRoutes');
  });
  h('bus:routeDel', (id) => { store.set('busRoutes', (store.get('busRoutes') || []).filter((x) => x.id !== id)); return store.get('busRoutes'); });
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
  h('company:mine', async () => { await ensureMe(); return cloud.myCompanies(me); });
  h('company:createPrice', async () => { await ensureMe(); return cloud.createPrice(await cloud.me()); });
  h('company:switch', async (cid) => { await cloud.switchCompany(cid, me); await refreshOnline(); return publicProfile(); });
  h('company:forSale', () => cloud.companiesForSale());
  h('company:sellCompany', async (price) => { await cloud.setForSale(me.companyId, price); });
  h('company:buyCompany', async (cid) => { await ensureMe(); const c = await cloud.buyCompany(cid, me); await refreshOnline(); return c.name; });
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
  h('company:busGift', async () => { const gift = TRUCK_SHOP.find((m) => m.id === 'mb-travego16') || TRUCK_SHOP.find((m) => m.kind === 'Autobús'); await cloud.claimBusGift(me.companyId, me, gift); await refreshOnline(); return `${gift.brand || ''} ${gift.name}`.trim(); });
  h('company:unlockBus', async () => { const gift = TRUCK_SHOP.find((m) => m.id === 'mb-travego16') || TRUCK_SHOP.find((m) => m.kind === 'Autobús'); await cloud.unlockBus(me.companyId, me, gift); await refreshOnline(); return gift ? `${gift.brand || ''} ${gift.name}`.trim() : ''; });
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
    if (!['register', 'promo', 'lang'].includes(type)) throw new Error('Petición no válida');
    extra = extra || {};
    // las apps de todos publican directamente con el enlace de publicación del canal (sin el token del bot)
    const cfg = await cloud.discordConfig().catch(() => null);
    const hook = type !== 'lang' && cfg && cfg.hooks && cfg.hooks[type];
    await cloud.discordRequest(me.companyId, type, { ...extra, posted: !!hook }, me);
    if (hook) {
      const c = await cloud.getDoc(`companies/${me.companyId}`);
      const q = { text: extra.text || '', photo: extra.photo || '', by: cloud.uid, byDiscord: me.discordId || '' };
      const build = (lang) => (type === 'register' ? buildRegister(c, q, null, lang) : buildPromo(c, q, lang));
      { const { msg, files } = build('es'); await postWebhook(hook, msg, files); }
      // y lo mismo en el canal en inglés
      const hookEn = cfg.hooks[`${type}En`];
      if (hookEn) { const { msg, files } = build('en'); await postWebhook(hookEn, msg, files).catch(() => {}); }
    }
    if (bot && bot.state.running) setTimeout(() => bot.sync().catch(() => {}), 1000);
    return { posted: !!hook };
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
  // pasa el bot a Cloudflare (funciona 24 h sin este PC). Las claves van directas de este PC al Worker.
  h('bot:cloudflare', async (url) => {
    const base = String(url || loadLinks().botWorker || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[\w.-]+\.workers\.dev$/.test(base)) throw new Error('Dirección del Worker no válida');
    const token = store.get('settings').botToken;
    if (!token) throw new Error('Pon primero el token del bot');
    if (!cloud.auth || !cloud.auth.refreshToken) throw new Error('Inicia sesión primero');
    const r = await fetch(`${base}/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botToken: token, refreshToken: cloud.auth.refreshToken, apiKey: cloud.cfg.apiKey }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `Cloudflare respondió ${r.status}`);
    store.patch('settings', { botWorker: base });
    return botInfo();
  });
  h('bot:workerStatus', async () => {
    const base = store.get('settings').botWorker || loadLinks().botWorker;
    if (!base) return null;
    try { const r = await fetch(`${base}/status`); return await r.json(); } catch { return { ok: false, error: 'No responde' }; }
  });
  h('bot:forget', async () => { bot.stop(); store.patch('settings', { botToken: '' }); return botInfo(); });
  h('report:send', async (r) => {
    if (!cloud.uid) throw new Error('Inicia sesión primero');
    const rep = await cloud.submitReport({ ...r, version: app.getVersion() }, me || {});
    await sendReportToDiscord(rep).catch(() => {});
    return true;
  });
  h('company:deleteNews', (id) => cloud.deleteNews(me.companyId, id));
  h('company:addLivery', (l) => cloud.addLivery(me.companyId, l, me));
  h('company:deleteLivery', (id) => cloud.deleteLivery(me.companyId, id));
  h('company:assign', (truckId, driver) => cloud.assignTruck(me.companyId, truckId, driver));
  h('company:sell', (truck) => cloud.sellTruck(me.companyId, truck, me));
}

// ------------------------------------------------------------- arranque
app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  cloud = new Cloud(loadCloudConfig(), store);
  photos = new Photos(store, [path.join(RES, 'config'), path.join(ROOT, 'config')]);
  // Mayús + F1/F2/F3 (solas, F1–F3 las usa el juego)
  const REC_KEYS = ['SHIFT+F1', 'SHIFT+F2', 'SHIFT+F3'];
  watchKeys(() => REC_KEYS, () => store.get('settings').busHotkeys !== false && status === 'driving', (k) => recordKey(k.replace('SHIFT+', '')));
  // tecla de puertas del autobús (U por defecto) mientras haya una ruta en marcha
  watchKey(() => store.get('settings').busDoorKey || 'U', () => !!(tracker && tracker.bus), () => tracker.toggleDoors());
  bot = new DiscordBot({ store, getCloud: () => cloud, root: ROOT, log: (...a) => console.warn('[bot]', ...a) });
  updater = setupUpdater(send, { onReady: (v) => { toast(`Rutero ${v || ''}`, 'Actualización lista: se instalará sola cuando cierres el juego'); setTimeout(autoInstall, 5000); } });
  setInterval(autoInstall, 60_000);
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
  // anuncia en Discord la versión nueva (lo hace la primera app que la ve, sea de quien sea)
  const announce = () => { if (cloud.uid) { announceRelease(cloud, ROOT).catch(() => {}); announceBusWeek(cloud).catch(() => {}); } };
  setTimeout(announce, 60_000);
  setInterval(announce, 3 * 3600_000);
  setInterval(() => updater.check(), 30 * 60_000); // cada 30 minutos
});
app.on('second-instance', (e, argv) => { if (win) { win.show(); win.focus(); } handleProtocolUrl((argv || []).find((a) => /^rutero:\/\//i.test(a))); });
app.on('open-url', (e, u) => { e.preventDefault(); handleProtocolUrl(u); });
app.on('before-quit', () => { app.isQuitting = true; store && store.flush(); reader && reader.disconnect(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault());
