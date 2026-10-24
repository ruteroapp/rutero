// Bot de Discord de Rutero.
// Funciona dentro de la app del administrador del servidor (no necesita hosting):
//  - pone presencia «Jugando a Rutero» y da la bienvenida a los que entran
//  - organiza el servidor (canales, permisos, roles y mensajes fijos)
//  - sincroniza rangos: nivel de Rutero → rol de Discord, ✅ Verificado al enlazar la cuenta
//  - crea una sede privada (rol + canal de texto + canal de voz) para cada empresa registrada
//  - publica registros y promociones de empresas que se piden desde la app
//  - anuncia las nuevas versiones de Rutero en #actualizaciones
const fs = require('fs');
const path = require('path');
const { levelFromXp } = require('./progress');

const API = 'https://discord.com/api/v10';
const GUILD = '1563305086074093690';
const SITE = 'https://ruteroapp.github.io/rutero/';
const REPO = 'ruteroapp/rutero';
const P = { VIEW: 1n << 10n, SEND: 1n << 11n, EMBED: 1n << 14n, ATTACH: 1n << 15n, HISTORY: 1n << 16n, REACT: 1n << 6n, CONNECT: 1n << 20n, SPEAK: 1n << 21n, THREADS: 1n << 38n, PUB_THREADS: 1n << 35n };
const bits = (...l) => l.reduce((a, b) => a | b, 0n).toString();
const AMBER = 0xFF9F1C, BLUE = 0x4C8DFF;

// Rangos de Rutero (mismos niveles que en la app) → roles de Discord
const RANK_ROLES = [
  { lvl: 60, name: '🔥 Rey del asfalto', color: 0xFF4D4D },
  { lvl: 45, name: '🌟 Leyenda', color: 0xFFC83D },
  { lvl: 30, name: '🧭 Maestro de la ruta', color: 0xB57BFF },
  { lvl: 20, name: '🏆 Veterano', color: 0x19C3B1 },
  { lvl: 10, name: '🛣️ Profesional', color: 0x4C8DFF },
  { lvl: 5, name: '🚚 Conductor', color: 0x7FD36B },
  { lvl: 1, name: '🔰 Novato', color: 0x9AA4B8 },
];
const ROLE = { verified: '✅ Verificado', owner: '🏢 Dueño de empresa', mod: '🛡️ Moderador', support: '🧰 Soporte', founder: '👑 Fundador' };

// Estructura del servidor. «m» = expresión para reconocer el canal aunque ya exista con otro emoji.
const CATS = {
  info: { name: '📌 ɪɴꜰᴏʀᴍᴀᴄɪᴏɴ', m: /informaci|ɪɴꜰᴏʀᴍᴀᴄɪ/i },
  news: { name: '📢 ɴᴏᴠᴇᴅᴀᴅᴇꜱ', m: /novedades|ɴᴏᴠᴇᴅᴀᴅᴇꜱ/i },
  community: { name: '💬 ᴄᴏᴍᴜɴɪᴅᴀᴅ', m: /comunidad|ᴄᴏᴍᴜɴɪᴅᴀᴅ/i },
  rutero: { name: '🚚 ʀᴜᴛᴇʀᴏ', m: /^🚚 ?(rutero|ʀᴜᴛᴇʀᴏ)$/i },
  companies: { name: '🏢 ᴇᴍᴘʀᴇꜱᴀꜱ', m: /^🏢 ?(empresas|ᴇᴍᴘʀᴇꜱᴀꜱ)$/i },
  hq: { name: '🏠 ꜱᴇᴅᴇꜱ ᴅᴇ ᴇᴍᴘʀᴇꜱᴀꜱ', m: /sedes|ꜱᴇᴅᴇꜱ/i },
  voice: { name: '🔊 ᴠᴏᴢ', m: /^🔊 ?(voz|ᴠᴏᴢ)$/i },
};
// lock = solo lectura para todos; verified = hace falta ✅ Verificado para escribir
const CHANNELS = [
  { key: 'welcome', cat: 'info', name: '👋┃ʙɪᴇɴᴠᴇɴɪᴅᴀ', m: /ʙɪᴇɴᴠᴇɴɪᴅᴀ|bienvenida/i, lock: true, topic: 'Bienvenido a la comunidad oficial de Rutero, la app para ETS2 y ATS.' },
  { key: 'verify', cat: 'info', name: '✅┃ᴠᴇʀɪꜰɪᴄᴀᴄɪᴏɴ', m: /ᴠᴇʀɪꜰɪᴄᴀᴄɪ|verificaci/i, lock: true, topic: 'Enlaza tu cuenta de Rutero para verificarte y recibir tu rango.' },
  { key: 'rules', cat: 'info', name: '📜┃ɴᴏʀᴍᴀꜱ', m: /ɴᴏʀᴍᴀꜱ|normas/i, lock: true, topic: 'Léelas antes de escribir. Saltártelas puede costarte un aviso o la expulsión.' },
  { key: 'web', cat: 'info', name: '🌐┃ᴡᴇʙ-ʏ-ᴅᴇꜱᴄᴀʀɢᴀ', m: /ᴡᴇʙ|web|descarga/i, lock: true, topic: `Descarga Rutero gratis: ${SITE}` },
  { key: 'roles', cat: 'info', name: '🎭┃ʀᴀɴɢᴏꜱ', m: /ʀᴏʟᴇꜱ|ʀᴀɴɢᴏꜱ|roles|rangos/i, lock: true, topic: 'Tu rango de Discord sube solo a medida que subes de nivel en Rutero.' },
  { key: 'announce', cat: 'news', name: '📣┃ᴀɴᴜɴᴄɪᴏꜱ', m: /ᴀɴᴜɴᴄɪᴏꜱ|anuncios/i, lock: true, topic: 'Anuncios importantes del equipo de Rutero.' },
  { key: 'updates', cat: 'news', name: '🆕┃ᴀᴄᴛᴜᴀʟɪᴢᴀᴄɪᴏɴᴇꜱ', m: /ᴀᴄᴛᴜᴀʟɪᴢᴀᴄɪᴏɴᴇꜱ|actualizaciones/i, lock: true, topic: 'El bot avisa aquí de cada versión nueva de Rutero.' },
  { key: 'general', cat: 'community', name: '💬┃ɢᴇɴᴇʀᴀʟ', m: /ɢᴇɴᴇʀᴀʟ|^general$/i, verified: true, slow: 3, topic: 'Charla general sobre camiones, rutas y TruckersMP. ¡Buen rollo!' },
  { key: 'shots', cat: 'community', name: '📸┃ᴄᴀᴘᴛᴜʀᴀꜱ', m: /ᴄᴀᴘᴛᴜʀᴀꜱ|capturas/i, verified: true, slow: 10, topic: 'Tus mejores capturas de ETS2 y ATS.' },
  { key: 'clips', cat: 'community', name: '🎬┃ᴄʟɪᴘꜱ', m: /ᴄʟɪᴘꜱ|clips/i, verified: true, slow: 10, topic: 'Vídeos, momentos épicos y fails en carretera.' },
  { key: 'offtopic', cat: 'community', name: '🎲┃ᴏꜰꜰ-ᴛᴏᴘɪᴄ', m: /ᴏꜰꜰ|off-topic/i, verified: true, slow: 3, topic: 'De todo lo que no sea camiones.' },
  { key: 'help', cat: 'rutero', name: '🆘┃ᴀʏᴜᴅᴀ', m: /ᴀʏᴜᴅᴀ|ayuda/i, topic: '¿Problemas instalando o usando Rutero? Pregunta aquí (no hace falta verificarse).' },
  { key: 'ideas', cat: 'rutero', name: '💡┃ꜱᴜɢᴇʀᴇɴᴄɪᴀꜱ', m: /ꜱᴜɢᴇʀᴇɴᴄɪᴀꜱ|sugerencias/i, verified: true, slow: 30, topic: 'Ideas para mejorar Rutero. Las mejores acaban en la app.' },
  { key: 'bugs', cat: 'rutero', name: '🐞┃ᴇʀʀᴏʀᴇꜱ', m: /ᴇʀʀᴏʀᴇꜱ|errores/i, topic: 'Cuenta qué falla, en qué versión y, si puedes, añade una captura.' },
  { key: 'register', cat: 'companies', name: '📝┃ʀᴇɢɪꜱᴛʀᴏ-ᴅᴇ-ᴇᴍᴘʀᴇꜱᴀꜱ', m: /ʀᴇɢɪꜱᴛʀᴏ|registro/i, lock: true, topic: 'Empresas registradas desde la app. Cada una recibe su sede privada.' },
  { key: 'promo', cat: 'companies', name: '📢┃ᴘʀᴏᴍᴏᴄɪᴏɴᴀ-ᴛᴜ-ᴇᴍᴘʀᴇꜱᴀ', m: /ᴘʀᴏᴍᴏᴄɪᴏɴᴀ|promociona/i, lock: true, topic: 'Promociones de empresas con foto y estrellas. Se publican desde Rutero (Mi empresa → Discord).' },
  { key: 'lookCompany', cat: 'companies', name: '🔎┃ʙᴜꜱᴄᴏ-ᴇᴍᴘʀᴇꜱᴀ', m: /ʙᴜꜱᴄᴏ-ᴇᴍᴘʀᴇꜱᴀ|busco-empresa/i, verified: true, slow: 600, topic: 'Preséntate: juego, horario, km y qué buscas. Un mensaje cada 10 minutos.' },
  { key: 'lookDrivers', cat: 'companies', name: '🧑‍✈️┃ʙᴜꜱᴄᴏ-ᴄᴏɴᴅᴜᴄᴛᴏʀᴇꜱ', m: /ʙᴜꜱᴄᴏ-ᴄᴏɴᴅᴜᴄᴛᴏʀᴇꜱ|busco-conductores/i, verified: true, slow: 600, topic: 'Empresas que buscan conductores. Un mensaje cada 10 minutos.' },
  { key: 'convoys', cat: 'companies', name: '🚛┃ᴄᴏɴᴠᴏʏᴇꜱ-ʏ-ᴇᴠᴇɴᴛᴏꜱ', m: /ᴄᴏɴᴠᴏʏᴇꜱ|convoyes/i, verified: true, topic: 'Organiza convoyes y eventos: servidor, hora, salida y destino.' },
];

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'empresa';
const hex = (c) => { const n = parseInt(String(c || '').replace('#', ''), 16); return Number.isFinite(n) ? n : BLUE; };
const stars = (sum, n) => { if (!n) return '☆☆☆☆☆ · sin valoraciones'; const a = sum / n, f = Math.round(a); return `${'★'.repeat(f)}${'☆'.repeat(5 - f)} · ${a.toFixed(1).replace('.', ',')} (${n} ${n === 1 ? 'valoración' : 'valoraciones'})`; };
const nf = (n) => Math.round(Number(n) || 0).toLocaleString('es-ES');
const dataUrlFile = (u, name) => { const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(String(u || '')); return m ? { name, type: m[1], buf: Buffer.from(m[2], 'base64') } : null; };
const linkBtn = (label, url, emoji) => (/^https?:\/\//i.test(url || '') ? { type: 2, style: 5, label, url: String(url).slice(0, 512), ...(emoji ? { emoji: { name: emoji } } : {}) } : null);
const row = (...btns) => { const c = btns.filter(Boolean); return c.length ? [{ type: 1, components: c.slice(0, 5) }] : []; };
const JOIN = { open: '🟢 Abierta: entra quien quiera', apply: '🟡 Con solicitud', closed: '🔴 Cerrada' };

class DiscordBot {
  constructor({ store, getCloud, root, log }) {
    this.store = store; this.getCloud = getCloud; this.root = root; this.log = log || (() => {});
    this.state = { running: false, online: false, lastSync: 0, error: '', user: null, synced: 0 };
    this.timer = null; this.ws = null; this.busy = false; this.memberCache = new Map(); this.applied = new Map();
  }
  get token() { return (this.store.get('settings') || {}).botToken || ''; }
  get mem() { return this.store.get('discordBot') || {}; }
  setMem(p) { this.store.set('discordBot', { ...this.mem, ...p }); }
  status() { return { ...this.state, hasToken: !!this.token }; }

  // ---------------------------------------------------------------- REST
  async api(method, route, body, files) {
    for (let tries = 0; tries < 5; tries++) {
      const headers = { Authorization: `Bot ${this.token}`, 'User-Agent': 'DiscordBot (https://ruteroapp.github.io/rutero, 1.0)' };
      let payload;
      if (files && files.length) {
        const fd = new FormData();
        fd.append('payload_json', JSON.stringify({ ...body, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
        files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.buf], { type: f.type }), f.name));
        payload = fd;
      } else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
      const r = await fetch(API + route, { method, headers, body: payload });
      if (r.status === 429) { const j = await r.json().catch(() => ({})); if (Number(j.retry_after) > 30) { const e = new Error('Discord limita los cambios: se reintentará más tarde'); e.status = 429; throw e; } await new Promise((ok) => setTimeout(ok, Math.min(30, Number(j.retry_after) || 2) * 1000 + 250)); continue; }
      if (r.status === 204) return null;
      const j = await r.json().catch(() => null);
      if (!r.ok) { const e = new Error((j && j.message) || `Discord ${r.status}`); e.status = r.status; e.code = j && j.code; throw e; }
      return j;
    }
    throw new Error('Discord: demasiadas peticiones, inténtalo luego');
  }

  // ---------------------------------------------------------------- arranque
  async checkToken(token) {
    const r = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bot ${token}` } });
    if (!r.ok) throw new Error('Ese token no es válido. Pulsa «Restablecer token» en el portal y copia el nuevo.');
    const u = await r.json();
    const g = await fetch(`${API}/guilds/${GUILD}`, { headers: { Authorization: `Bot ${token}` } });
    if (!g.ok) throw new Error('El bot todavía no está en el servidor de Rutero: autorízalo primero.');
    return u;
  }
  async start() {
    if (!this.token || this.state.running) return this.status();
    this.state.running = true; this.state.error = '';
    try {
      this.state.user = await this.api('GET', '/users/@me');
      await this.setAvatar().catch((e) => this.log('avatar', e.message));
    } catch (e) { this.state.error = e.message; this.state.running = false; return this.status(); }
    this.connectGateway();
    const tick = async () => { await this.sync().catch((e) => { this.state.error = e.message; this.log('sync', e.message); }); };
    setTimeout(tick, 4000);
    this.timer = setInterval(tick, 90 * 1000);
    return this.status();
  }
  stop() {
    this.state.running = false; this.state.online = false;
    clearInterval(this.timer); this.timer = null;
    clearInterval(this.hb); this.hb = null;
    if (this.ws) { try { this.ws.close(1000); } catch { /* */ } this.ws = null; }
  }
  async setAvatar() {
    if (this.mem.avatarSet) return;
    const f = path.join(this.root, 'build', 'icon-256.png');
    const b64 = fs.readFileSync(f).toString('base64');
    await this.api('PATCH', '/users/@me', { avatar: `data:image/png;base64,${b64}` });
    this.setMem({ avatarSet: true });
  }

  // ---------------------------------------------------------------- gateway (presencia y bienvenida)
  connectGateway() {
    if (!this.state.running || typeof WebSocket === 'undefined') return;
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
    this.ws = ws; let seq = null;
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.s) seq = m.s;
      if (m.op === 10) {
        clearInterval(this.hb);
        this.hb = setInterval(() => { try { ws.send(JSON.stringify({ op: 1, d: seq })); } catch { /* */ } }, m.d.heartbeat_interval);
        ws.send(JSON.stringify({ op: 2, d: { token: this.token, intents: 1 | 2, properties: { os: 'windows', browser: 'rutero', device: 'rutero' },
          presence: { status: 'online', afk: false, activities: [{ name: 'Rutero · ETS2 & ATS', type: 0 }] } } }));
      } else if (m.op === 0 && m.t === 'READY') { this.state.online = true; }
      else if (m.op === 7 || m.op === 9) { try { ws.close(4000); } catch { /* */ } }
    };
    ws.onclose = (ev) => {
      this.state.online = false; clearInterval(this.hb);
      if (ev && ev.code === 4014) { this.state.error = 'Activa «Server Members Intent» en el portal de Discord'; }
      if (this.state.running) setTimeout(() => this.connectGateway(), 8000);
    };
    ws.onerror = () => {};
  }
  async welcome(user) {
    if (!user || user.bot) return;
    const ch = this.mem.channels || {};
    if (!ch.general) return;
    await this.api('POST', `/channels/${ch.general}/messages`, {
      content: `👋 ¡Bienvenido/a <@${user.id}>!`,
      embeds: [{ color: AMBER, description: `Pásate por <#${ch.rules || ch.general}> y luego por <#${ch.verify || ch.general}> para verificarte y recibir tu rango.\n¿Aún no tienes Rutero? Descárgalo en <#${ch.web || ch.general}>. 🚚` }],
      allowed_mentions: { users: [user.id] },
    });
  }

  // ---------------------------------------------------------------- organizar el servidor
  async roleMap() {
    const roles = await this.api('GET', `/guilds/${GUILD}/roles`);
    this.roles = roles; return roles;
  }
  findRole(name) { return (this.roles || []).find((r) => r.name === name); }
  async ensureRole(name, opt = {}) {
    let r = this.findRole(name);
    if (!r) { r = await this.api('POST', `/guilds/${GUILD}/roles`, { name, color: opt.color || 0, hoist: !!opt.hoist, mentionable: !!opt.mentionable, permissions: '0' }); this.roles.push(r); }
    else if (opt.color !== undefined && r.color !== opt.color) { r = await this.api('PATCH', `/guilds/${GUILD}/roles/${r.id}`, { color: opt.color }); }
    return r;
  }
  async setup(progress = () => {}) {
    if (!this.token) throw new Error('Pon primero el token del bot');
    this.setupRunning = true;
    try {
      progress('Roles…');
      await this.roleMap();
      for (const r of RANK_ROLES) await this.ensureRole(r.name, { color: r.color, hoist: true });
      const verified = await this.ensureRole(ROLE.verified, { color: 0x2ECC71 });
      await this.ensureRole(ROLE.owner, { color: AMBER, hoist: true, mentionable: true });
      const mod = this.findRole(ROLE.mod) || await this.ensureRole(ROLE.mod, { color: 0xE74C3C, hoist: true, mentionable: true });
      const everyone = this.roles.find((r) => r.id === GUILD);

      progress('Canales…');
      let all = await this.api('GET', `/guilds/${GUILD}/channels`);
      const cats = {};
      let pos = 0;
      for (const [k, c] of Object.entries(CATS)) {
        let cat = all.find((x) => x.type === 4 && c.m.test(x.name));
        if (!cat) { cat = await this.api('POST', `/guilds/${GUILD}/channels`, { name: c.name, type: 4 }); all.push(cat); }
        cats[k] = cat; pos++;
      }
      const ids = {};
      for (const c of CHANNELS) {
        let ch = all.find((x) => (x.type === 0 || x.type === 5) && c.m.test(x.name));
        const deny = c.lock ? bits(P.SEND, P.PUB_THREADS, P.THREADS) : c.verified ? bits(P.SEND, P.PUB_THREADS, P.THREADS, P.ATTACH) : '0';
        const overwrites = [{ id: GUILD, type: 0, allow: bits(P.VIEW, P.HISTORY), deny }];
        if (c.verified) overwrites.push({ id: verified.id, type: 0, allow: bits(P.SEND, P.ATTACH, P.EMBED, P.THREADS, P.PUB_THREADS), deny: '0' });
        if (c.lock || c.verified) overwrites.push({ id: mod.id, type: 0, allow: bits(P.SEND, P.ATTACH, P.EMBED), deny: '0' });
        const body = { parent_id: cats[c.cat].id, topic: c.topic, permission_overwrites: overwrites, rate_limit_per_user: c.slow || 0 };
        if (!ch) { ch = await this.api('POST', `/guilds/${GUILD}/channels`, { name: c.name, type: 0, ...body }); all.push(ch); }
        else {
          const patch = { parent_id: body.parent_id, permission_overwrites: overwrites, rate_limit_per_user: body.rate_limit_per_user };
          if (ch.topic !== c.topic) patch.topic = c.topic;
          if (ch.name !== c.name) patch.name = c.name;
          ch = await this.api('PATCH', `/channels/${ch.id}`, patch).catch(async (e) => { // si el nombre está limitado, al menos lo demás
            if (e.status === 429 || e.code === 50035) { delete patch.name; delete patch.topic; return this.api('PATCH', `/channels/${ch.id}`, patch); }
            throw e;
          });
        }
        ids[c.key] = ch.id;
      }
      // voz: hace falta estar verificado para hablar
      for (const v of all.filter((x) => x.type === 2 && x.parent_id === cats.voice.id)) {
        await this.api('PATCH', `/channels/${v.id}`, { permission_overwrites: [{ id: GUILD, type: 0, allow: bits(P.VIEW), deny: bits(P.SPEAK) }, { id: verified.id, type: 0, allow: bits(P.CONNECT, P.SPEAK), deny: '0' }] }).catch(() => {});
      }
      // orden de las categorías
      const order = ['info', 'news', 'community', 'voice', 'rutero', 'companies', 'hq'];
      await this.api('PATCH', `/guilds/${GUILD}/channels`, order.filter((k) => cats[k]).map((k, i) => ({ id: cats[k].id, position: i }))).catch(() => {});
      // sedes de empresas: categoría oculta (cada sede da acceso a su rol)
      await this.api('PATCH', `/channels/${cats.hq.id}`, { permission_overwrites: [{ id: GUILD, type: 0, allow: '0', deny: bits(P.VIEW) }] }).catch(() => {});
      this.setMem({ channels: ids, cats: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.id])) });

      progress('Mensajes…');
      await this.postStatic(ids, verified);
      progress('Enlaces de publicación…');
      await this.ensureHooks(ids);
      // servidor: canal del sistema y nivel de verificación (correo verificado)
      await this.api('PATCH', `/guilds/${GUILD}`, { system_channel_id: ids.general, system_channel_flags: 0, verification_level: 2, default_message_notifications: 1, explicit_content_filter: 2 }).catch(() => {});
      progress('Sincronizando…');
      this.applied.clear();
      await this.sync();
      return { ok: true, channels: Object.keys(ids).length };
    } finally { this.setupRunning = false; }
  }
  // mensajes fijos: se editan si ya existen (no se duplican)
  async upsert(key, channelId, msg, files) {
    const msgs = this.mem.msgs || {};
    const prev = msgs[key];
    if (prev && prev.ch === channelId) {
      try { await this.api('PATCH', `/channels/${channelId}/messages/${prev.id}`, { ...msg, attachments: [] }, files); return; } catch (e) { if (e.status !== 404) throw e; }
    }
    const m = await this.api('POST', `/channels/${channelId}/messages`, msg, files);
    await this.api('PUT', `/channels/${channelId}/pins/${m.id}`).catch(() => {});
    this.setMem({ msgs: { ...(this.mem.msgs || {}), [key]: { ch: channelId, id: m.id } } });
  }
  logoFile() { return { name: 'rutero.png', type: 'image/png', buf: fs.readFileSync(path.join(this.root, 'build', 'icon-256.png')) }; }
  async postStatic(ch, verified) {
    const dl = 'https://github.com/ruteroapp/rutero/releases/latest';
    const links = (this.store.get('links') || {});
    const invite = links.discordInvite || 'https://discord.gg/sUF5GBagG4';
    await this.upsert('welcome', ch.welcome, {
      embeds: [{ color: AMBER, title: '🚚 Bienvenido a Rutero · ETS2 & ATS',
        description: 'La comunidad oficial de **Rutero**, la app gratuita para **Euro Truck Simulator 2** y **American Truck Simulator** conectada con **TruckersMP**.\n\nRegistra tus viajes automáticamente, crea tu empresa, gana dinero, sube de rango y compite en el ranking semanal.',
        thumbnail: { url: 'attachment://rutero.png' },
        fields: [
          { name: '1️⃣ Lee las normas', value: `<#${ch.rules}>`, inline: true },
          { name: '2️⃣ Verifícate', value: `<#${ch.verify}>`, inline: true },
          { name: '3️⃣ Descarga la app', value: `<#${ch.web}>`, inline: true },
          { name: '🏢 ¿Tienes empresa?', value: `Regístrala desde la app y tendrás tu propia sede privada. Las nuevas salen en <#${ch.register}>.` },
          { name: '💬 ¿Dudas?', value: `Pregunta en <#${ch.help}>. Los errores van a <#${ch.bugs}>.` },
        ], footer: { text: 'Rutero · hecho por y para camioneros virtuales' } }],
      components: row(linkBtn('Descargar Rutero', dl, '⬇️'), linkBtn('Página web', SITE, '🌐'), linkBtn('Invitar amigos', invite, '📨')),
    }, [this.logoFile()]);
    await this.upsert('verify', ch.verify, {
      embeds: [{ color: 0x2ECC71, title: '✅ Verificación',
        description: `Para escribir en la comunidad, entrar en los canales de voz y recibir tu rango necesitas el rol <@&${verified.id}>.\nSe consigue **enlazando tu cuenta de Rutero** con Discord:`,
        fields: [
          { name: '1. Descarga Rutero', value: `Gratis en <#${ch.web}> y crea tu cuenta (correo y contraseña).` },
          { name: '2. Abre Ajustes → Comunidad y ayuda', value: 'Pulsa **Conectar Discord** y acepta en la ventana de Discord.' },
          { name: '3. ¡Listo!', value: 'En unos minutos recibirás ✅ Verificado y tu rango según tu nivel. Si tienes empresa registrada, también su rol y su sede.' },
          { name: '¿Sin la app?', value: `Puedes leer todo y pedir ayuda en <#${ch.help}> sin verificarte.` },
        ] }],
      components: row(linkBtn('Descargar Rutero', dl, '⬇️')),
    });
    await this.upsert('rules', ch.rules, {
      embeds: [{ color: 0xE74C3C, title: '📜 Normas del servidor', description: [
        '**1.** Respeto ante todo: nada de insultos, acoso, racismo ni discriminación.',
        '**2.** Nada de spam, flood ni publicidad fuera de los canales de empresas.',
        '**3.** Contenido apto para todos: sin NSFW, gore ni temas polémicos.',
        '**4.** Usa cada canal para lo que es (mira la descripción de arriba).',
        '**5.** En TruckersMP y convoyes, respeta sus normas: nada de ramming ni trolleo.',
        '**6.** No compartas datos personales tuyos ni de otros.',
        '**7.** Las promociones de empresas se hacen desde la app (una cada 2 semanas).',
        '**8.** Los moderadores tienen la última palabra. Si ves algo raro, repórtalo desde la app con 🚩.',
      ].join('\n'), footer: { text: 'Saltarse las normas = aviso → silencio → expulsión' } }],
    });
    await this.upsert('web', ch.web, {
      embeds: [{ color: BLUE, title: '🌐 Rutero · web y descarga', url: SITE,
        description: 'Descarga **gratis** la última versión para Windows. Se actualiza sola cada vez que sacamos novedades.',
        thumbnail: { url: 'attachment://rutero.png' },
        fields: [
          { name: '⬇️ Descarga', value: `[Última versión](${dl})`, inline: true },
          { name: '🌐 Web', value: `[ruteroapp.github.io/rutero](${SITE})`, inline: true },
          { name: '📨 Invitación', value: invite, inline: true },
          { name: '✨ Qué tiene', value: 'Registro automático de viajes · empresas con banco, flota y sueldos · modo autobús · multas · ranking semanal · overlay en el juego · 7 idiomas' },
        ] }],
      components: row(linkBtn('Descargar', dl, '⬇️'), linkBtn('Página web', SITE, '🌐')),
    }, [this.logoFile()]);
    await this.upsert('roles', ch.roles, {
      embeds: [{ color: 0xB57BFF, title: '🎭 Rangos', description: 'Tu rango de Discord es el mismo que tienes en Rutero y **sube solo** cuando subes de nivel (enlaza tu cuenta en la app).',
        fields: [
          { name: 'Rangos de conductor', value: [...RANK_ROLES].reverse().map((r) => `${r.name} — nivel ${r.lvl}+`).join('\n') },
          { name: 'Especiales', value: `${ROLE.verified} — cuenta de Rutero enlazada\n${ROLE.owner} — fundador de una empresa registrada\n🏢 TAG · Empresa — miembros de cada empresa registrada (acceso a su sede)\n${ROLE.mod} / ${ROLE.support} — equipo del servidor` },
        ] }],
    });
    await this.upsert('register', ch.register, {
      embeds: [{ color: AMBER, title: '📝 Registra tu empresa', description: 'En Rutero: **Mi empresa → Discord → Registrar empresa**.\n\nAl registrarla, el bot crea:\n• un rol con el nombre y color de tu empresa para todos sus conductores\n• una **sede privada** (texto y voz) que solo ve tu empresa\n• el rol 🏢 Dueño de empresa para el fundador\n\nLas empresas nuevas se anuncian en este canal.' }],
    });
    await this.upsert('promo', ch.promo, {
      embeds: [{ color: AMBER, title: '📢 Promociona tu empresa', description: 'Desde Rutero: **Mi empresa → Discord → Promocionar**. Puedes elegir una foto y un texto; el bot publica aquí la ficha con tus ⭐ estrellas, conductores, requisitos y enlaces.\n\nUna promoción cada 2 semanas por empresa.' }],
    });
  }

  // ---------------------------------------------------------------- sincronización periódica
  async sync() {
    if (this.busy || !this.state.running || this.setupRunning) return;
    const cloud = this.getCloud();
    if (!cloud || !cloud.uid) return;
    this.busy = true;
    try {
      if (!this.roles) await this.roleMap();
      if (!(this.mem.channels || {}).general) { this.state.error = 'Pulsa «Organizar el servidor» una vez'; }
      // si el bot de Cloudflare está funcionando, él se encarga de sedes y rangos (24 h, sin depender de este PC)
      const cfg = await cloud.discordConfig().catch(() => null);
      this.state.worker = !!(cfg && cfg.workerBeat && Date.now() - Date.parse(cfg.workerBeat) < 12 * 60e3);
      if (!this.state.worker) {
        await this.processQueue(cloud);
        await this.syncCompanies(cloud);
        await this.syncMembers(cloud);
      }
      await this.announceRelease();
      this.state.lastSync = Date.now();
      if (this.state.error === 'Pulsa «Organizar el servidor» una vez' && (this.mem.channels || {}).general) this.state.error = '';
    } finally { this.busy = false; }
  }
  async processQueue(cloud) {
    const items = await cloud.discordQueue();
    for (const q of items) {
      try {
        const c = await cloud.getDoc(`companies/${q.cid}`);
        if (c) {
          if (q.type === 'register') await this.registerCompany(cloud, c, q);
          if (q.type === 'promo') await this.promoteCompany(c, q);
        }
      } catch (e) { this.log('cola', e.message); }
      await cloud.discordQueueDone(q.id).catch(() => {});
    }
  }
  async registerCompany(cloud, c, q) {
    const map = await this.ensureCompanyHq(cloud, c);
    const ch = this.mem.channels || {};
    if (!q.posted && ch.register) { const { msg, files } = buildRegister(c, q, map.roleId); await this.api('POST', `/channels/${ch.register}/messages`, msg, files); }
    if (map.textId) await this.api('POST', `/channels/${map.textId}/messages`, { content: `🏠 **Sede de ${c.name}** · <@&${map.roleId}>`, embeds: [{ color: hex(c.color), description: 'Este canal y su canal de voz solo los ve vuestra empresa (y los moderadores).\nLos conductores reciben el rol automáticamente al enlazar su cuenta de Rutero con Discord.' }], allowed_mentions: { roles: [map.roleId] } }).catch(() => {});
  }
  async promoteCompany(c, q) {
    const ch = this.mem.channels || {};
    if (q.posted || !ch.promo) return;
    const { msg, files } = buildPromo(c, q);
    await this.api('POST', `/channels/${ch.promo}/messages`, msg, files);
  }
  // enlaces de publicación (webhooks) para que las apps de todos publiquen sin el token del bot
  async ensureHooks(ids) {
    const want = { register: ids.register, promo: ids.promo, updates: ids.updates };
    const hooks = {};
    const avatar = `data:image/png;base64,${fs.readFileSync(path.join(this.root, 'build', 'icon-256.png')).toString('base64')}`;
    for (const [k, chId] of Object.entries(want)) {
      if (!chId) continue;
      const list = await this.api('GET', `/channels/${chId}/webhooks`);
      let w = list.find((x) => x.name === 'Rutero' && x.token);
      if (!w) w = await this.api('POST', `/channels/${chId}/webhooks`, { name: 'Rutero', avatar });
      hooks[k] = `https://discord.com/api/webhooks/${w.id}/${w.token}`;
    }
    const cloud = this.getCloud();
    if (cloud && cloud.uid) await cloud.setDiscordConfig({ hooks, guild: GUILD, updatedAt: new Date(), hq: (this.mem.cats || {}).hq || '',
      channels: { register: ids.register || '', promo: ids.promo || '', updates: ids.updates || '' }, modRole: (this.findRole(ROLE.mod) || {}).id || '' });
    return hooks;
  }
  // rol + sede (texto y voz) de cada empresa registrada
  async ensureCompanyHq(cloud, c, mapAll) {
    const maps = mapAll || await cloud.discordMap();
    const cur = maps[c.id] || {};
    const cats = this.mem.cats || {};
    if (!this.roles) await this.roleMap();
    const roleName = `🏢 ${c.tag || ''} · ${c.name}`.slice(0, 100);
    let role = cur.roleId && this.roles.find((r) => r.id === cur.roleId);
    if (!role) { role = await this.api('POST', `/guilds/${GUILD}/roles`, { name: roleName, color: hex(c.color), mentionable: true, permissions: '0' }); this.roles.push(role); }
    else if (role.name !== roleName || role.color !== hex(c.color)) { role = await this.api('PATCH', `/guilds/${GUILD}/roles/${role.id}`, { name: roleName, color: hex(c.color) }); }
    const mod = this.findRole(ROLE.mod);
    const ow = [{ id: GUILD, type: 0, allow: '0', deny: bits(P.VIEW) },
      { id: role.id, type: 0, allow: bits(P.VIEW, P.SEND, P.HISTORY, P.ATTACH, P.EMBED, P.REACT, P.CONNECT, P.SPEAK, P.THREADS, P.PUB_THREADS), deny: '0' },
      ...(mod ? [{ id: mod.id, type: 0, allow: bits(P.VIEW, P.HISTORY), deny: '0' }] : [])];
    let textId = cur.textId, voiceId = cur.voiceId;
    const exists = async (id) => { if (!id) return false; try { await this.api('GET', `/channels/${id}`); return true; } catch { return false; } };
    if (!(await exists(textId))) textId = (await this.api('POST', `/guilds/${GUILD}/channels`, { name: `🏢┃${slug(`${c.tag}-${c.name}`)}`, type: 0, parent_id: cats.hq, topic: `Sede privada de ${c.name} [${c.tag}]`.slice(0, 1000), permission_overwrites: ow })).id;
    if (!(await exists(voiceId))) voiceId = (await this.api('POST', `/guilds/${GUILD}/channels`, { name: `🔊 ${c.tag || c.name}`.slice(0, 100), type: 2, parent_id: cats.hq, permission_overwrites: ow })).id;
    const map = { roleId: role.id, textId, voiceId, name: c.name, tag: c.tag || '' };
    if (map.roleId !== cur.roleId || map.textId !== cur.textId || map.voiceId !== cur.voiceId || map.name !== cur.name) await cloud.setDiscordMap(c.id, map);
    return map;
  }
  async syncCompanies(cloud) {
    if (!(this.mem.cats || {}).hq) return;
    const [list, maps] = await Promise.all([cloud.discordCompanies(), cloud.discordMap()]);
    this.companyMaps = {};
    for (const c of list) {
      const m = maps[c.id];
      if (!m || m.name !== c.name || !m.roleId) { try { this.companyMaps[c.id] = await this.ensureCompanyHq(cloud, c, maps); } catch (e) { this.log('sede', e.message); } }
      else this.companyMaps[c.id] = m;
      this.companyMaps[c.id] && (this.companyMaps[c.id].ownerUid = c.ownerUid);
    }
  }
  async syncMembers(cloud) {
    const users = await cloud.discordUsers();
    const rankIds = RANK_ROLES.map((r) => (this.findRole(r.name) || {}).id).filter(Boolean);
    const verified = (this.findRole(ROLE.verified) || {}).id, owner = (this.findRole(ROLE.owner) || {}).id;
    const companyRoleIds = Object.values(this.companyMaps || {}).map((m) => m.roleId);
    const managed = new Set([...rankIds, verified, owner, ...companyRoleIds].filter(Boolean));
    let n = 0;
    for (const u of users) {
      const lvl = levelFromXp(u.xp || 0);
      const rank = RANK_ROLES.find((r) => lvl >= r.lvl);
      const want = new Set([verified, rank && (this.findRole(rank.name) || {}).id].filter(Boolean));
      const cm = u.companyId && (this.companyMaps || {})[u.companyId];
      if (cm) { want.add(cm.roleId); if (cm.ownerUid === u.id && owner) want.add(owner); }
      const key = [...want].sort().join(',');
      if (this.applied.get(u.discordId) === key) continue;
      let member;
      try { member = await this.api('GET', `/guilds/${GUILD}/members/${u.discordId}`); } catch (e) { if (e.status === 404) { this.applied.set(u.discordId, key); continue; } throw e; }
      const has = new Set(member.roles);
      for (const id of want) if (!has.has(id)) await this.api('PUT', `/guilds/${GUILD}/members/${u.discordId}/roles/${id}`).catch((e) => this.log('rol', e.message));
      for (const id of member.roles) if (managed.has(id) && !want.has(id)) await this.api('DELETE', `/guilds/${GUILD}/members/${u.discordId}/roles/${id}`).catch((e) => this.log('rol', e.message));
      this.applied.set(u.discordId, key); n++;
    }
    this.state.synced = users.length;
    return n;
  }
  async announceRelease() {
    if (Date.now() - (this.relCheck || 0) < 10 * 60 * 1000) return;
    this.relCheck = Date.now();
    const cloud = this.getCloud();
    if (cloud && cloud.uid) await announceRelease(cloud, this.root).catch((e) => this.log('versión', e.message));
  }
}

// ---------------------------------------------------------------- mensajes (los usa el bot y las apps de todos)
function companyEmbed(c, q, title) {
  const links = [c.discord && `[Discord](${c.discord})`, c.website && `[Web](${c.website})`].filter(Boolean).join(' · ');
  const req = c.requirements || {};
  const reqs = [req.minLevel && `Nivel ${req.minLevel}+`, req.minKm && `${nf(req.minKm)} km`, req.tmp && 'Cuenta TruckersMP', req.game && req.game !== 'any' && (req.game === 'both' ? 'ETS2 y ATS' : req.game.toUpperCase()), req.language, req.age && `+${req.age} años`].filter(Boolean).join(' · ');
  return { color: hex(c.color), title: `${title}${c.name} [${c.tag || ''}]`.slice(0, 256),
    description: [q && q.text ? q.text : (c.description || ''), '', `**${stars(c.ratingSum, c.ratingCount)}**`].join('\n').trim().slice(0, 4000),
    fields: [
      { name: '👥 Conductores', value: nf(c.membersCount || 1), inline: true },
      { name: '🛣️ Km', value: nf(c.km), inline: true },
      { name: '📦 Entregas', value: nf(c.jobs), inline: true },
      { name: '🚪 Entrada', value: JOIN[c.joinMode || (c.recruiting ? 'apply' : 'closed')] || JOIN.apply, inline: true },
      { name: '💼 Comisión', value: `${c.commission || 0}%`, inline: true },
      { name: '👑 Fundador', value: (q && q.byDiscord && q.by === c.ownerUid ? `<@${q.byDiscord}>` : c.ownerName) || '—', inline: true },
      ...(reqs ? [{ name: '📋 Requisitos', value: reqs.slice(0, 1000) }] : []),
      ...(links ? [{ name: '🔗 Enlaces', value: links }] : []),
    ], footer: { text: 'Búscala en Rutero → Empresas' }, timestamp: new Date().toISOString() };
}
function buildRegister(c, q, roleId) {
  const files = []; const embed = companyEmbed(c, q, '🏢 Nueva empresa · ');
  const logo = dataUrlFile(c.logo, 'logo.jpg'); if (logo) { files.push(logo); embed.thumbnail = { url: 'attachment://logo.jpg' }; }
  return { files, msg: { content: `🎉 ¡Damos la bienvenida a **${c.name}**!${roleId ? ` <@&${roleId}>` : ''}`, embeds: [embed], allowed_mentions: { parse: [] },
    components: row(linkBtn('Discord de la empresa', c.discord, '💬'), linkBtn('Web', c.website, '🌐')) } };
}
function buildPromo(c, q) {
  const files = []; const embed = companyEmbed(c, q, '📢 ');
  const photo = dataUrlFile(q.photo, 'foto.jpg') || dataUrlFile(c.banner, 'foto.jpg');
  if (photo) { files.push(photo); embed.image = { url: 'attachment://foto.jpg' }; }
  const logo = dataUrlFile(c.logo, 'logo.jpg'); if (logo) { files.push(logo); embed.thumbnail = { url: 'attachment://logo.jpg' }; }
  return { files, msg: { content: q.byDiscord ? `Promoción de <@${q.byDiscord}>` : '', embeds: [embed], allowed_mentions: { parse: [] },
    components: row(linkBtn('Discord de la empresa', c.discord, '💬'), linkBtn('Web', c.website, '🌐'), linkBtn('Descargar Rutero', SITE, '🚚')) } };
}
// publica con un webhook (no necesita el token del bot)
async function postWebhook(url, msg, files = []) {
  if (!/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(String(url || ''))) throw new Error('El servidor de Discord aún no está preparado');
  const u = `${url}?wait=true&with_components=true`;
  for (let tries = 0; tries < 4; tries++) {
    let r;
    if (files.length) {
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify({ ...msg, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
      files.forEach((f, i) => fd.append(`files[${i}]`, new Blob([f.buf], { type: f.type }), f.name));
      r = await fetch(u, { method: 'POST', body: fd });
    } else r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await new Promise((ok) => setTimeout(ok, Math.min(10, Number(j.retry_after) || 2) * 1000 + 200)); continue; }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Discord: ${j.message || r.status}`); }
    return r.json().catch(() => null);
  }
  throw new Error('Discord está ocupado, inténtalo en un momento');
}
// cualquier app de Rutero puede anunciar la versión nueva; la primera que lo reclama en la base de datos la publica
async function announceRelease(cloud, root) {
  const cfg = await cloud.discordConfig().catch(() => null);
  const hook = cfg && cfg.hooks && cfg.hooks.updates;
  if (!hook) return false;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'Rutero' } });
  if (!r.ok) return false;
  const rel = await r.json();
  if (!rel.tag_name || rel.draft) return false;
  if (!(await cloud.claimRelease(rel.tag_name))) return false; // otra app ya lo ha anunciado
  const exe = (rel.assets || []).find((a) => /\.exe$/i.test(a.name));
  const notes = String(rel.body || '').replace(/\r/g, '').trim();
  const logo = { name: 'rutero.png', type: 'image/png', buf: fs.readFileSync(path.join(root, 'build', 'icon-256.png')) };
  await postWebhook(hook, {
    embeds: [{ color: AMBER, title: `🆕 Rutero ${rel.tag_name} ya disponible`, url: rel.html_url,
      description: `${notes ? `${notes.slice(0, 3500)}\n\n` : ''}La app se actualiza sola al abrirla. Si no, descárgala con el botón.`,
      thumbnail: { url: 'attachment://rutero.png' }, timestamp: rel.published_at || new Date().toISOString(), footer: { text: 'Rutero · actualizaciones' } }],
    components: row(linkBtn('Descargar', (exe && exe.browser_download_url) || rel.html_url, '⬇️'), linkBtn('Página web', SITE, '🌐')),
  }, [logo]);
  return true;
}

module.exports = { DiscordBot, GUILD, RANK_ROLES, buildRegister, buildPromo, postWebhook, announceRelease };
