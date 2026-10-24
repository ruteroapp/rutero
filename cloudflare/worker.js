// Rutero Bot en Cloudflare Workers (plan gratuito).
// Se ejecuta solo cada minuto, 24 horas, sin depender de ningún PC:
//  - crea el rol y la sede privada (texto + voz) de cada empresa registrada
//  - da ✅ Verificado, el rango según el nivel de Rutero, el rol de la empresa y 🏢 Dueño de empresa
//  - publica registros/promociones que no se pudieron publicar desde la app
// Las claves (token del bot, sesión de Firebase) las envía la app del administrador a /setup
// y se guardan en el KV de este Worker: no están en el código.

const API = 'https://discord.com/api/v10';
const GUILD = '1563305086074093690';
const PROJECT = 'rutero-a0abb';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const SITE = 'https://ruteroapp.github.io/rutero/';
const APP_ID = '1563527823522533426';
const PUBLIC_KEY = '66f620c20c8b00912d12d27c6b0ec8b8d9db710c2fa7082110aeece7b4a13951';
const BUDGET = 44; // Cloudflare gratis: 50 peticiones por ejecución
const RANKS = [[60, '🔥 Rey del asfalto'], [45, '🌟 Leyenda'], [30, '🧭 Maestro de la ruta'], [20, '🏆 Veterano'], [10, '🛣️ Profesional'], [5, '🚚 Conductor'], [1, '🔰 Novato']];
const VERIFIED = '✅ Verificado', OWNER = '🏢 Dueño de empresa', MOD = '🛡️ Moderador';
const B = { VIEW: 1n << 10n, SEND: 1n << 11n, EMBED: 1n << 14n, ATTACH: 1n << 15n, HISTORY: 1n << 16n, REACT: 1n << 6n, CONNECT: 1n << 20n, SPEAK: 1n << 21n, THREADS: 1n << 38n, PUB: 1n << 35n };
const bits = (...l) => l.reduce((a, b) => a | b, 0n).toString();
const levelFromXp = (xp) => Math.floor(Math.sqrt(Math.max(xp || 0, 0) / 120)) + 1;
const hex = (c) => { const n = parseInt(String(c || '').replace('#', ''), 16); return Number.isFinite(n) ? n : 0x4C8DFF; };
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa';
const nf = (n) => Math.round(Number(n) || 0).toLocaleString('es-ES');

// ---------------------------------------------------------------- Firestore (valores)
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return null;
}
const fromDoc = (d) => d && d.fields ? { id: d.name.split('/').pop(), ...Object.fromEntries(Object.entries(d.fields).map(([k, x]) => [k, fromFs(x)])) } : null;

class Run {
  constructor(env) { this.env = env; this.calls = 0; this.log = []; }
  spend(n = 1) { this.calls += n; if (this.calls > BUDGET) throw new Budget(); }
  async secrets() { this.s = await this.env.KV.get('secrets', 'json'); return this.s; }
  // ---- sesión de Firebase (la del administrador; se renueva cada hora)
  async idToken() {
    const cached = await this.env.KV.get('idtoken', 'json');
    if (cached && cached.exp > Date.now() + 60000) return cached.token;
    this.spend();
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.s.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.s.refreshToken)}` });
    const j = await r.json();
    if (!r.ok) throw new Error('La sesión de Firebase ha caducado: vuelve a pulsar «Pasar a Cloudflare» en la app');
    if (j.refresh_token && j.refresh_token !== this.s.refreshToken) { this.s.refreshToken = j.refresh_token; await this.env.KV.put('secrets', JSON.stringify(this.s)); }
    await this.env.KV.put('idtoken', JSON.stringify({ token: j.id_token, exp: Date.now() + (Number(j.expires_in) - 120) * 1000 }));
    return j.id_token;
  }
  async fs(method, url, body) {
    this.spend();
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${await this.idToken()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Firestore: ${(j.error && j.error.message) || r.status}`);
    return j;
  }
  async getDoc(p) { return fromDoc(await this.fs('GET', `${FS}/${p}`)); }
  async query(q) { const res = await this.fs('POST', `${FS}:runQuery`, { structuredQuery: q }); return (res || []).filter((x) => x.document).map((x) => fromDoc(x.document)); }
  async update(p, data) {
    const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)]));
    const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    return this.fs('PATCH', `${FS}/${p}?${mask}`, { fields });
  }
  async del(p) { return this.fs('DELETE', `${FS}/${p}`); }
  // ---- Discord
  async dc(method, route, body, files) {
    for (let t = 0; t < 3; t++) {
      this.spend();
      const headers = { Authorization: `Bot ${this.s.botToken}` };
      let payload;
      if (files && files.length) {
        const fd = new FormData();
        fd.append('payload_json', JSON.stringify({ ...body, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
        files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.buf], { type: f.type }), f.name));
        payload = fd;
      } else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      const r = await fetch(API + route, { method, headers, body: payload });
      if (r.status === 429) { const j = await r.json().catch(() => ({})); if (Number(j.retry_after) > 5) throw new Error('Discord limita: se reintenta en el siguiente minuto'); await new Promise((ok) => setTimeout(ok, (Number(j.retry_after) || 1) * 1000)); continue; }
      if (r.status === 204) return null;
      const j = await r.json().catch(() => null);
      if (!r.ok) { const e = new Error(`Discord: ${(j && j.message) || r.status}`); e.status = r.status; throw e; }
      return j;
    }
    throw new Error('Discord ocupado');
  }
}
class Budget extends Error { constructor() { super('budget'); this.budget = true; } }

const dataUrlFile = (u, name) => { const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(String(u || '')); if (!m) return null; const bin = atob(m[2]); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i); return { name, type: m[1], buf }; };
const linkBtn = (label, url, emoji) => (/^https?:\/\//i.test(url || '') ? { type: 2, style: 5, label, url: String(url).slice(0, 512), emoji: { name: emoji } } : null);
const row = (...b) => { const c = b.filter(Boolean); return c.length ? [{ type: 1, components: c }] : []; };
const stars = (sum, n) => { if (!n) return '☆☆☆☆☆ · sin valoraciones'; const a = sum / n, f = Math.round(a); return `${'★'.repeat(f)}${'☆'.repeat(5 - f)} · ${a.toFixed(1).replace('.', ',')} (${n})`; };
function companyEmbed(c, q, title) {
  return { color: hex(c.color), title: `${title}${c.name} [${c.tag || ''}]`.slice(0, 256),
    description: [q && q.text ? q.text : (c.description || ''), '', `**${stars(c.ratingSum, c.ratingCount)}**`].join('\n').trim().slice(0, 4000),
    fields: [{ name: '👥 Conductores', value: nf(c.membersCount || 1), inline: true }, { name: '🛣️ Km', value: nf(c.km), inline: true }, { name: '📦 Entregas', value: nf(c.jobs), inline: true }],
    footer: { text: 'Búscala en Rutero → Empresas' }, timestamp: new Date().toISOString() };
}

// ---------------------------------------------------------------- trabajo de cada minuto
async function tick(env) {
  const run = new Run(env);
  if (!(await run.secrets())) return { ok: false, error: 'Sin configurar: pulsa «Pasar a Cloudflare» en la app' };
  const state = (await env.KV.get('state', 'json')) || { applied: {}, lastUsers: 0, lastFull: 0 };
  let changed = false;
  try {
    const cfg = await run.getDoc('config/discord');
    if (!cfg || !cfg.hq) throw new Error('Pulsa «Organizar el servidor» en la app una vez');
    // 1) peticiones pendientes (registros y promociones)
    const queue = await run.query({ from: [{ collectionId: 'discordQueue' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }], limit: 3 });
    let maps = null;
    for (const q of queue) {
      const c = await run.getDoc(`companies/${q.cid}`);
      if (c && q.type === 'register') {
        maps = maps || await loadMaps(run);
        const m = await ensureHq(run, cfg, c, maps);
        if (!q.posted && cfg.channels && cfg.channels.register) await run.dc('POST', `/channels/${cfg.channels.register}/messages`, { content: `🎉 ¡Damos la bienvenida a **${c.name}**! <@&${m.roleId}>`, embeds: [companyEmbed(c, q, '🏢 Nueva empresa · ')], allowed_mentions: { parse: [] } });
        await run.dc('POST', `/channels/${m.textId}/messages`, { content: `🏠 **Sede de ${c.name}** · <@&${m.roleId}>`, embeds: [{ color: hex(c.color), description: 'Este canal y su canal de voz solo los ve vuestra empresa (y los moderadores).\nCada conductor recibe el rol al conectar su Discord en Rutero (Ajustes → Comunidad y ayuda).' }], allowed_mentions: { roles: [m.roleId] } }).catch(() => {});
        state.lastUsers = 0; // repasa los conductores para darles el rol nuevo
      }
      if (c && q.type === 'promo' && !q.posted && cfg.channels && cfg.channels.promo) {
        const files = []; const e = companyEmbed(c, q, '📢 ');
        const ph = dataUrlFile(q.photo, 'foto.jpg') || dataUrlFile(c.banner, 'foto.jpg'); if (ph) { files.push(ph); e.image = { url: 'attachment://foto.jpg' }; }
        await run.dc('POST', `/channels/${cfg.channels.promo}/messages`, { content: q.byDiscord ? `Promoción de <@${q.byDiscord}>` : '', embeds: [e], allowed_mentions: { parse: [] }, components: row(linkBtn('Discord de la empresa', c.discord, '💬'), linkBtn('Web', c.website, '🌐'), linkBtn('Descargar Rutero', SITE, '🚚')) }, files);
      }
      await run.del(`discordQueue/${q.id}`);
    }
    // 2) rangos: conductores activos o recién enlazados (cada 3 min); repaso completo cada 6 h
    const now = Date.now();
    const full = now - (state.lastFull || 0) > 6 * 3600e3;
    if (full || now - (state.lastUsers || 0) > 3 * 60e3) {
      const since = new Date((state.lastUsers || 0) - 10 * 60e3).toISOString();
      const sel = { fields: ['discordId', 'xp', 'companyId'].map((f) => ({ fieldPath: f })) };
      let users;
      if (full) users = await run.query({ from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'discordId' }, op: 'GREATER_THAN', value: { stringValue: '' } } }, select: sel, limit: 1000 });
      else {
        const [a, b] = await Promise.all([
          run.query({ from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'lastActivity' }, op: 'GREATER_THAN', value: { timestampValue: since } } }, select: sel, limit: 300 }),
          run.query({ from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'discordAt' }, op: 'GREATER_THAN', value: { timestampValue: since } } }, select: sel, limit: 300 }),
        ]);
        const seen = new Map(); [...a, ...b].forEach((u) => seen.set(u.id, u)); users = [...seen.values()].filter((u) => u.discordId);
      }
      if (users.length) {
        maps = maps || await loadMaps(run);
        const roles = await run.dc('GET', `/guilds/${GUILD}/roles`);
        const rid = (n) => (roles.find((r) => r.name === n) || {}).id;
        const ver = rid(VERIFIED), own = rid(OWNER);
        const rankIds = RANKS.map(([, n]) => rid(n)).filter(Boolean);
        const compIds = Object.values(maps).map((m) => m.roleId);
        const managed = new Set([ver, own, ...rankIds, ...compIds].filter(Boolean));
        for (const u of users) {
          const lvl = levelFromXp(u.xp);
          const want = new Set([ver, rid((RANKS.find(([l]) => lvl >= l) || [])[1])].filter(Boolean));
          const m = u.companyId && maps[u.companyId];
          if (m && m.roleId) { want.add(m.roleId); if (m.ownerUid === u.id && own) want.add(own); }
          const key = [...want].sort().join(',');
          const prev = state.applied[u.discordId];
          if (prev === key) continue;
          if (prev && prev.startsWith('absent:') && now - Number(prev.slice(7)) < 30 * 60e3 && !full) continue;
          let member;
          try { member = await run.dc('GET', `/guilds/${GUILD}/members/${u.discordId}`); } catch (e) { if (e.status === 404) { state.applied[u.discordId] = `absent:${now}`; changed = true; continue; } throw e; }
          for (const id of want) if (!member.roles.includes(id)) await run.dc('PUT', `/guilds/${GUILD}/members/${u.discordId}/roles/${id}`);
          for (const id of member.roles) if (managed.has(id) && !want.has(id)) await run.dc('DELETE', `/guilds/${GUILD}/members/${u.discordId}/roles/${id}`);
          state.applied[u.discordId] = key; changed = true;
        }
      }
      state.lastUsers = now; if (full) state.lastFull = now; changed = true;
    }
    if (now - (state.beat || 0) > 5 * 60e3) { await run.update('config/discord', { workerBeat: new Date() }); state.beat = now; changed = true; }
    state.error = '';
  } catch (e) {
    if (!e.budget) { state.error = e.message; changed = true; }
  }
  state.lastRun = Date.now();
  if (changed) await env.KV.put('state', JSON.stringify(state));
  return { ok: !state.error, error: state.error, calls: run.calls };
}

async function loadMaps(run) {
  const [maps, comps] = await Promise.all([
    run.query({ from: [{ collectionId: 'discordMap' }], limit: 1000 }),
    run.query({ from: [{ collectionId: 'companies' }], where: { fieldFilter: { field: { fieldPath: 'discordRegistered' }, op: 'EQUAL', value: { booleanValue: true } } }, select: { fields: ['ownerUid'].map((f) => ({ fieldPath: f })) }, limit: 500 }),
  ]);
  const owners = Object.fromEntries(comps.map((c) => [c.id, c.ownerUid]));
  return Object.fromEntries(maps.filter((m) => owners[m.id]).map((m) => [m.id, { ...m, ownerUid: owners[m.id] }]));
}
async function ensureHq(run, cfg, c, maps) {
  const cur = maps[c.id] || {};
  const name = `🏢 ${c.tag || ''} · ${c.name}`.slice(0, 100);
  let roleId = cur.roleId;
  if (!roleId) roleId = (await run.dc('POST', `/guilds/${GUILD}/roles`, { name, color: hex(c.color), mentionable: true, permissions: '0' })).id;
  const ow = [{ id: GUILD, type: 0, allow: '0', deny: bits(B.VIEW) },
    { id: roleId, type: 0, allow: bits(B.VIEW, B.SEND, B.HISTORY, B.ATTACH, B.EMBED, B.REACT, B.CONNECT, B.SPEAK, B.THREADS, B.PUB), deny: '0' },
    ...(cfg.modRole ? [{ id: cfg.modRole, type: 0, allow: bits(B.VIEW, B.HISTORY), deny: '0' }] : [])];
  let textId = cur.textId, voiceId = cur.voiceId;
  if (!textId) textId = (await run.dc('POST', `/guilds/${GUILD}/channels`, { name: `🏢┃${slug(`${c.tag}-${c.name}`)}`, type: 0, parent_id: cfg.hq, topic: `Sede privada de ${c.name} [${c.tag}]`, permission_overwrites: ow })).id;
  if (!voiceId) voiceId = (await run.dc('POST', `/guilds/${GUILD}/channels`, { name: `🔊 ${c.tag || c.name}`.slice(0, 100), type: 2, parent_id: cfg.hq, permission_overwrites: ow })).id;
  const m = { roleId, textId, voiceId, name: c.name, tag: c.tag || '' };
  await run.update(`discordMap/${c.id}`, m);
  maps[c.id] = { ...m, ownerUid: c.ownerUid };
  return m;
}


// ---------------------------------------------------------------- comandos de barra (/dar-dinero)
const COMMANDS = [{
  name: 'dar-dinero', description: 'Da dinero a una empresa de Rutero (solo dueño y administradores)',
  description_localizations: { 'en-US': 'Give money to a Rutero company (owner and admins only)', 'en-GB': 'Give money to a Rutero company (owner and admins only)' },
  default_member_permissions: '8', dm_permission: false,
  options: [
    { type: 3, name: 'empresa', description: 'Nombre o etiqueta de la empresa', required: true, max_length: 60 },
    { type: 4, name: 'cantidad', description: 'Cantidad en € (o $)', required: true, min_value: 1, max_value: 100000000 },
    { type: 3, name: 'motivo', description: 'Motivo (opcional)', required: false, max_length: 120 },
  ],
}];
async function registerCommands(botToken) {
  const r = await fetch(`${API}/applications/${APP_ID}/guilds/${GUILD}/commands`, { method: 'PUT', headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(COMMANDS) });
  return r.ok;
}
const hexBytes = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
async function verifySig(req, body) {
  const sig = req.headers.get('x-signature-ed25519'), ts = req.headers.get('x-signature-timestamp');
  if (!sig || !ts) return false;
  try {
    let key;
    try { key = await crypto.subtle.importKey('raw', hexBytes(PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']); return await crypto.subtle.verify({ name: 'Ed25519' }, key, hexBytes(sig), new TextEncoder().encode(ts + body)); }
    catch { key = await crypto.subtle.importKey('raw', hexBytes(PUBLIC_KEY), { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }, false, ['verify']); return await crypto.subtle.verify('NODE-ED25519', key, hexBytes(sig), new TextEncoder().encode(ts + body)); }
  } catch { return false; }
}
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
async function giveMoney(env, i) {
  const opt = Object.fromEntries((i.data.options || []).map((o) => [o.name, o.value]));
  const reply = (content, embeds) => fetch(`${API}/webhooks/${APP_ID}/${i.token}/messages/@original`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, embeds: embeds || [], allowed_mentions: { parse: [] } }) });
  const run = new Run(env);
  try {
    if (!(await run.secrets())) return reply('⚠️ El bot todavía no está configurado en Cloudflare.');
    const perms = BigInt((i.member && i.member.permissions) || '0');
    if (!(perms & 8n)) return reply('⛔ Solo el dueño del servidor y los administradores pueden usar este comando.');
    const amount = Math.round(Number(opt.cantidad) || 0);
    if (amount < 1 || amount > 100000000) return reply('⚠️ La cantidad tiene que estar entre 1 y 100.000.000.');
    const all = await run.query({ from: [{ collectionId: 'companies' }], select: { fields: ['name', 'tag', 'color'].map((f) => ({ fieldPath: f })) }, limit: 1000 });
    const q = norm(opt.empresa);
    const c = all.find((x) => norm(x.tag) === q) || all.find((x) => norm(x.name) === q) || all.find((x) => norm(x.name).includes(q) && q.length >= 3);
    if (!c) return reply(`❓ No encuentro ninguna empresa llamada «${String(opt.empresa).slice(0, 60)}». Usa su nombre o su etiqueta.`);
    const who = (i.member.nick || i.member.user.global_name || i.member.user.username || 'Discord').slice(0, 40);
    const motivo = String(opt.motivo || '').slice(0, 120);
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    const now = new Date();
    await run.fs('POST', `${FS}:commit`, { writes: [
      { update: { name: `projects/${PROJECT}/databases/(default)/documents/companies/${c.id}`, fields: { lastActivity: toFs(now) } }, updateMask: { fieldPaths: ['lastActivity'] }, updateTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(amount) } }] },
      { update: { name: `projects/${PROJECT}/databases/(default)/documents/companies/${c.id}/bank/${id}`, fields: Object.fromEntries(Object.entries({ kind: 'gift', amount, by: `${who} (Discord)`, note: motivo ? `Regalo del servidor: ${motivo}` : 'Regalo del servidor de Discord', at: now }).map(([k, v]) => [k, toFs(v)])) }, currentDocument: { exists: false } },
    ] });
    return reply('', [{ color: hex(c.color), title: '💰 Dinero entregado', description: `**${nf(amount)} €** para **${c.name}** [${c.tag || ''}]${motivo ? `\n📝 ${motivo}` : ''}`, footer: { text: `Enviado por ${who}` }, timestamp: now.toISOString() }]);
  } catch (e) { return reply(`⚠️ No se pudo dar el dinero: ${String(e.message || e).slice(0, 200)}`); }
}
async function interactions(req, env, ctx) {
  const body = await req.text();
  if (!(await verifySig(req, body))) return new Response('firma no válida', { status: 401 });
  const i = JSON.parse(body);
  if (i.type === 1) return json({ type: 1 });               // PING de Discord
  if (i.type === 2 && i.data && i.data.name === 'dar-dinero') {
    ctx.waitUntil(giveMoney(env, i));
    return json({ type: 5 });                                // «pensando…» y luego se edita la respuesta
  }
  return json({ type: 4, data: { content: 'Comando desconocido', flags: 64 } });
}

// ---------------------------------------------------------------- configuración desde la app del administrador
async function setup(req, env) {
  const b = await req.json().catch(() => ({}));
  if (!b.refreshToken || !b.botToken || !b.apiKey) return json({ ok: false, error: 'Faltan datos' }, 400);
  // la sesión debe ser la del administrador del bot (el de config/discord)
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${b.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(b.refreshToken)}` });
  const j = await r.json();
  if (!r.ok) return json({ ok: false, error: 'Sesión de Rutero no válida' }, 403);
  const cfgRes = await fetch(`${FS}/config/discord`, { headers: { Authorization: `Bearer ${j.id_token}` } });
  const cfg = fromDoc(await cfgRes.json().catch(() => null));
  if (!cfg || cfg.adminUid !== j.user_id) return json({ ok: false, error: 'Solo el administrador del bot puede configurarlo' }, 403);
  const me = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bot ${b.botToken}` } });
  if (!me.ok) return json({ ok: false, error: 'El token del bot no es válido' }, 400);
  await env.KV.put('secrets', JSON.stringify({ botToken: b.botToken, refreshToken: j.refresh_token || b.refreshToken, apiKey: b.apiKey, uid: j.user_id }));
  await env.KV.put('idtoken', JSON.stringify({ token: j.id_token, exp: Date.now() + (Number(j.expires_in) - 120) * 1000 }));
  await env.KV.delete('state');
  const cmds = await registerCommands(b.botToken).catch(() => false);
  return json({ ok: true, commands: cmds });
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env)); },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'POST' && (url.pathname === '/interactions' || url.pathname === '/')) return interactions(req, env, ctx);
    if (req.method === 'POST' && url.pathname === '/setup') return setup(req, env);
    if (url.pathname === '/status') {
      const s = (await env.KV.get('state', 'json')) || {};
      return json({ ok: !s.error, configured: !!(await env.KV.get('secrets')), lastRun: s.lastRun || 0, error: s.error || '' });
    }
    return new Response('Rutero Bot · funcionando en Cloudflare 🚚', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
