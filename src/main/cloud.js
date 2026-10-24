// Parte online de Rutero: cuentas, empresas, banco, flota y rankings.
// Usa Firebase (plan gratuito) mediante su API REST: no hace falta ningún SDK.
const crypto = require('crypto');
const { weekKey } = require('./progress');

// ---------- conversión de valores Firestore ----------
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: fieldsOf(v) } };
}
const fieldsOf = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toFs(x)]));
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return docData(v.mapValue.fields || {});
  return null;
}
const docData = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, x]) => [k, fromFs(x)]));
const fromDoc = (d) => d && d.fields ? { id: d.name.split('/').pop(), ...docData(d.fields) } : null;
const newId = () => crypto.randomBytes(15).toString('base64url').slice(0, 20);
// préstamos y servicio de autobuses
const LOAN_OPTIONS = [100000, 250000, 500000, 1000000];
const LOAN_RATE = 10;          // % de interés
const LOAN_AUTOPAY = 30;       // % de cada comisión que se usa para devolverlo
const BUS_UNLOCK_PRICE = 700000;
const BUS_BOOST = 1.5;         // las rutas de bus de la empresa pagan ×1,5
// requisitos para entrar en una empresa
const cleanReqs = (r = {}) => ({
  minLevel: Math.max(0, Math.min(200, Math.round(Number(r.minLevel) || 0))),
  minKm: Math.max(0, Math.round(Number(r.minKm) || 0)),
  tmp: !!r.tmp, game: ['any', 'ets2', 'ats', 'both'].includes(r.game) ? r.game : 'any',
  language: String(r.language || '').slice(0, 40), age: Math.max(0, Math.min(99, Math.round(Number(r.age) || 0))),
  note: String(r.note || '').slice(0, 300),
});
const joinCode = () => Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
const BASE_SLOTS = 2; // plazas de flota sin garaje
const GARAGES = {
  small: { name: 'pequeño', slots: 3, price: 120000 },
  medium: { name: 'mediano', slots: 6, price: 250000 },
  big: { name: 'grande', slots: 10, price: 400000 },
};
const repairCost = (t) => Math.round((100 - (t.condition ?? 100)) / 100 * (t.price || 0) * 0.25);
const JOIN_BONUS = 300000; // la empresa recibe 300.000 por cada conductor que entra
const inc = (fieldPath, n, dbl = false) => ({ fieldPath, increment: dbl ? { doubleValue: n } : { integerValue: String(Math.round(n)) } });

class Cloud {
  constructor(config, store) {
    this.cfg = config || {};
    this.store = store;
    this.auth = store.get('auth');
  }
  get configured() { return !!(this.cfg.apiKey && this.cfg.projectId && !String(this.cfg.apiKey).includes('PEGA')); }
  get uid() { return this.auth && this.auth.uid; }
  get base() { return `https://firestore.googleapis.com/v1/projects/${this.cfg.projectId}/databases/(default)/documents`; }
  path(p) { return `projects/${this.cfg.projectId}/databases/(default)/documents/${p}`; }

  // ---------- autenticación ----------
  async authCall(endpoint, body) {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${this.cfg.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, returnSecureToken: true }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(Cloud.authError(j.error && j.error.message));
    this.setAuth(j.localId, j.idToken, j.refreshToken, j.expiresIn, body.email);
    return this.auth;
  }
  static authError(m = '') {
    const map = {
      EMAIL_EXISTS: 'Ese correo ya tiene cuenta', INVALID_LOGIN_CREDENTIALS: 'Correo o contraseña incorrectos',
      EMAIL_NOT_FOUND: 'No existe una cuenta con ese correo', INVALID_PASSWORD: 'Contraseña incorrecta',
      'WEAK_PASSWORD : Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
      INVALID_EMAIL: 'Correo no válido', MISSING_PASSWORD: 'Escribe una contraseña', MISSING_EMAIL: 'Escribe tu correo', TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos, espera un poco',
      OPERATION_NOT_ALLOWED: 'Activa el acceso por correo en Firebase (Authentication → Email/Password)',
    };
    return map[m] || m || 'Error de conexión';
  }
  setAuth(uid, idToken, refreshToken, expiresIn, email) {
    this.auth = { uid, idToken, refreshToken, email: email || (this.auth && this.auth.email), expiresAt: Date.now() + (Number(expiresIn) - 60) * 1000 };
    this.store.set('auth', this.auth);
  }
  async token() {
    if (!this.auth) throw new Error('Inicia sesión primero');
    if (Date.now() < this.auth.expiresAt) return this.auth.idToken;
    const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${this.cfg.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(this.auth.refreshToken)}`,
    });
    const j = await r.json();
    if (!r.ok) { this.signOut(); throw new Error('Sesión caducada, vuelve a entrar'); }
    this.setAuth(j.user_id, j.id_token, j.refresh_token, j.expires_in);
    return this.auth.idToken;
  }
  async register(email, password, name) {
    await this.authCall('signUp', { email, password });
    await this.commit([{ update: { name: this.path(`users/${this.uid}`), fields: fieldsOf({ name, photo: '', money: 0, xp: 0, km: 0, jobs: 0, busTrips: 0, fineCount: 0, fineTotal: 0, companyId: '', companyName: '', companyTag: '', pendingCompanyId: '', tmpId: '', createdAt: new Date() }) } }]);
    return this.me();
  }
  async login(email, password) { await this.authCall('signInWithPassword', { email, password }); return this.me(); }
  async resetPassword(email) {
    if (!email || !email.includes('@')) throw new Error('Escribe tu correo');
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${this.cfg.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(Cloud.authError(j.error && j.error.message));
    return true;
  }
  signOut() { this.auth = null; this.store.set('auth', null); }

  // ---------- llamadas genéricas ----------
  async req(method, url, body) {
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || `Error ${r.status}`);
    return j;
  }
  async getDoc(p) { return fromDoc(await this.req('GET', `${this.base}/${p}`)); }
  async commit(writes) { return this.req('POST', `${this.base}:commit`, { writes }); }
  async query(parent, structuredQuery) {
    const url = parent ? `${this.base}/${parent}:runQuery` : `${this.base}:runQuery`;
    const res = await this.req('POST', url, { structuredQuery });
    return (res || []).filter((x) => x.document).map((x) => fromDoc(x.document));
  }
  upd(p, data, transforms = []) {
    const w = { update: { name: this.path(p), fields: fieldsOf(data) }, updateMask: { fieldPaths: Object.keys(data).map((k) => `\`${k}\``) } };
    if (transforms.length) w.updateTransforms = transforms;
    return w;
  }
  create(p, data) { return { update: { name: this.path(p), fields: fieldsOf(data) }, currentDocument: { exists: false } }; }

  // ---------- perfil ----------
  async me() { const d = await this.getDoc(`users/${this.uid}`); return d ? { ...d, uid: this.uid, email: this.auth.email } : null; }
  async updateMe(data) { await this.commit([this.upd(`users/${this.uid}`, data)]); return this.me(); }

  // ---------- registrar un viaje (carga o autobús) ----------
  // split = { net, companyCut, salary, xp } ; me = documento del usuario (para nombre y empresa)
  async submitTrip(trip, split, me) {
    const id = trip.id || newId();
    const wk = weekKey(new Date(trip.finishedAt || Date.now()));
    const km = Number(trip.km) || 0;
    const delivered = trip.status === 'delivered';
    const isBus = trip.type === 'bus';
    const salary = Math.round(split.salary || 0);
    const doc = {
      type: trip.type || 'cargo', status: trip.status, game: trip.game || '', multiplayer: !!trip.multiplayer,
      cargo: trip.cargo || trip.line || '', from: trip.from || '', to: trip.to || '',
      fromCompany: trip.fromCompany || '', toCompany: trip.toCompany || '',
      km, revenue: Math.round(trip.revenue || 0), net: Math.round(split.net), companyCut: Math.round(split.companyCut), salary,
      damage: Number(trip.damage || 0), score: trip.score || 0, xp: trip.xp || 0, truck: trip.truck || '',
      stops: trip.stops || 0, passengers: trip.passengers || 0, routeId: trip.routeId || '', routeDone: !!trip.routeDone,
      foreignVehicle: !!trip.foreignVehicle, foreignFee: Math.round(trip.foreignFee || 0), busBoost: Math.round(trip.busBoost || 0),
      avgSpeed: trip.avgSpeed || 0, maxSpeed: Math.round(trip.maxSpeed || 0), durationMin: trip.durationMin || 0,
      fuelUsed: Math.round(trip.fuelUsed || 0), fineCount: trip.fineCount || 0, fines: Math.round(trip.fines || 0), tolls: Math.round(trip.tolls || 0),
      speedingSec: Math.round(trip.speedingSec || 0), cruiseSec: Math.round(trip.cruiseSec || 0),
      samples: (trip.samples || []).map((x) => x.join(',')).join(';').slice(0, 20000),
      driverUid: this.uid, driverName: me.name || '', driverPhoto: '', finishedAt: new Date(trip.finishedAt || Date.now()),
    };
    const writes = [this.create(`users/${this.uid}/jobs/${id}`, doc)];
    const userT = [inc('money', split.net + salary), inc('km', km, true), inc('xp', split.xp || 0)];
    if (delivered) userT.push(inc(isBus ? 'busTrips' : 'jobs', 1));
    writes.push(this.upd(`users/${this.uid}`, { lastActivity: new Date() }, userT));
    writes.push(this.upd(`weekly/${wk}/drivers/${this.uid}`, { name: me.name || '', companyTag: me.companyTag || '', photo: me.photo || '' },
      [inc('km', km, true), inc('money', Math.max(split.net + salary, 0)), inc('jobs', delivered ? 1 : 0)]));
    if (me.companyId) {
      const c = me.companyId;
      writes.push(this.create(`companies/${c}/jobs/${id}`, doc));
      const repay = Math.max(0, Math.round(split.loanRepay || 0));
      const compT = [inc('km', km, true), inc('jobs', delivered ? 1 : 0), inc('balance', split.companyCut - salary - repay)];
      if (repay) compT.push(inc('loan.owed', -repay));
      writes.push(this.upd(`companies/${c}`, { lastActivity: new Date() }, compT));
      if (repay) writes.push(this.create(`companies/${c}/bank/${newId()}`, { kind: 'loanpay', amount: -repay, by: me.name || '', note: `Devolución automática del préstamo (${LOAN_AUTOPAY}% de la comisión)`, at: new Date() }));
      writes.push(this.upd(`companies/${c}/members/${this.uid}`, { name: me.name || '', lastActivity: new Date() },
        [inc('km', km, true), inc('jobs', delivered ? 1 : 0), inc('earned', split.companyCut), inc('driverEarned', split.net + salary), inc('salaryEarned', salary)]));
      writes.push(this.upd(`weekly/${wk}/companies/${c}`, { name: me.companyName || '', tag: me.companyTag || '' },
        [inc('km', km, true), inc('money', Math.max(split.companyCut, 0)), inc('jobs', delivered ? 1 : 0)]));
      if (split.companyCut) {
        writes.push(this.create(`companies/${c}/bank/${newId()}`, { kind: 'commission', amount: Math.round(split.companyCut), by: me.name || '', note: `${doc.cargo} · ${doc.from} → ${doc.to}`, at: new Date() }));
      }
      if (salary) {
        writes.push(this.create(`companies/${c}/bank/${newId()}`, { kind: 'salary', amount: -salary, by: me.name || '', note: `Sueldo de ${me.name} · ${Math.round(km)} km`, at: new Date() }));
      }
    }
    await this.commit(writes);
    return id;
  }

  // ---------- multas ----------
  async submitFine(f, me) {
    const id = newId();
    const doc = { kind: f.kind, amount: Math.round(f.amount || 0), offence: f.detail || '', speed: f.speed || 0, limit: f.limit || 0, cargo: f.cargo || '', route: f.route || '', driverUid: this.uid, driverName: me.name || '', at: new Date(f.at || Date.now()) };
    const writes = [this.create(`users/${this.uid}/fines/${id}`, doc), this.upd(`users/${this.uid}`, {}, [inc('fineCount', 1), inc('fineTotal', doc.amount)])];
    if (me.companyId) {
      writes.push(this.create(`companies/${me.companyId}/fines/${id}`, doc));
      writes.push(this.upd(`companies/${me.companyId}/members/${this.uid}`, {}, [inc('finesCount', 1), inc('finesAmount', doc.amount)]));
    }
    await this.commit(writes);
  }
  async myFines() {
    return this.query(`users/${this.uid}`, { from: [{ collectionId: 'fines' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 200 });
  }

  // gastos (multas, peajes…) en la cartera online
  async addMoney(amount) {
    await this.commit([this.upd(`users/${this.uid}`, { lastActivity: new Date() }, [inc('money', amount)])]);
  }

  // ---------- foto de perfil ----------
  async setPhoto(photo, me) {
    const writes = [this.upd(`users/${this.uid}`, { photo })];
    if (me.companyId) writes.push(this.upd(`companies/${me.companyId}/members/${this.uid}`, { photo }));
    writes.push(this.upd(`weekly/${weekKey()}/drivers/${this.uid}`, { photo, name: me.name || '' }));
    await this.commit(writes);
  }
  async setName(name, me) {
    const writes = [this.upd(`users/${this.uid}`, { name })];
    if (me.companyId) writes.push(this.upd(`companies/${me.companyId}/members/${this.uid}`, { name }));
    await this.commit(writes);
  }

  // ---------- enviar dinero a otro conductor ----------
  async sendMoney(toUid, toName, amount, note, me) {
    amount = Math.round(Number(amount));
    if (!(amount > 0)) throw new Error('Cantidad no válida');
    if (toUid === this.uid) throw new Error('No puedes enviarte dinero a ti mismo');
    const u = await this.me();
    if ((u.money || 0) < amount) throw new Error('No tienes tanto dinero en la cartera');
    await this.commit([
      this.upd(`users/${this.uid}`, { lastActivity: new Date() }, [inc('money', -amount)]),
      this.create(`users/${toUid}/inbox/${newId()}`, { amount, fromUid: this.uid, fromName: me.name || '', note: note || '', at: new Date() }),
      this.create(`users/${this.uid}/transfers/${newId()}`, { amount: -amount, other: toName || '', note: note || '', at: new Date() }),
    ]);
  }
  async claimInbox() {
    const items = await this.query(`users/${this.uid}`, { from: [{ collectionId: 'inbox' }], limit: 50 });
    if (!items.length) return [];
    const total = items.reduce((a, x) => a + (x.amount || 0), 0);
    await this.commit([
      ...items.map((x) => ({ delete: this.path(`users/${this.uid}/inbox/${x.id}`) })),
      ...items.map((x) => this.create(`users/${this.uid}/transfers/${x.id}`, { amount: x.amount, other: x.fromName || '', note: x.note || '', at: new Date() })),
      this.upd(`users/${this.uid}`, {}, [inc('money', total)]),
    ]);
    return items;
  }
  async myTransfers() {
    return this.query(`users/${this.uid}`, { from: [{ collectionId: 'transfers' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 50 });
  }

  // ---------- rankings ----------
  async ranking(scope, field, period) {
    const order = { orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }], limit: 100 };
    if (period === 'week') {
      return this.query(`weekly/${weekKey()}`, { from: [{ collectionId: scope === 'companies' ? 'companies' : 'drivers' }], ...order });
    }
    return this.query(null, { from: [{ collectionId: scope === 'companies' ? 'companies' : 'users' }], ...order });
  }

  // ---------- empresas ----------
  memberDoc(me, role) {
    return { name: me.name || '', photo: me.photo || '', role, km: 0, jobs: 0, earned: 0, driverEarned: 0, salaryEarned: 0, pendingBonus: 0, salaryPerKm: 0, salaryPerJob: 0, finesCount: 0, finesAmount: 0, joinedAt: new Date() };
  }
  async createCompany({ name, tag, color, description, commission, language, recruiting, logo, joinMode, rules, requirements }, me) {
    if (me.companyId) throw new Error('Ya perteneces a una empresa');
    const id = newId();
    const data = {
      name, tag: (tag || '').toUpperCase().slice(0, 5), color: color || '#4C8DFF', description: description || '', logo: logo || '',
      commission: Math.min(Math.max(Number(commission) || 15, 0), 50), language: language || 'es', recruiting: recruiting !== false,
      joinMode: ['open', 'apply', 'closed'].includes(joinMode) ? joinMode : 'apply', rules: rules || '', requirements: cleanReqs(requirements), ratingSum: 0, ratingCount: 0,
      ownerUid: this.uid, ownerName: me.name || '', joinCode: joinCode(), balance: JOIN_BONUS, km: 0, jobs: 0, membersCount: 1,
      createdAt: new Date(), lastActivity: new Date(),
    };
    await this.commit([
      this.create(`companies/${id}`, data),
      this.create(`companies/${id}/members/${this.uid}`, this.memberDoc(me, 'owner')),
      this.upd(`users/${this.uid}`, { companyId: id, companyName: name, companyTag: data.tag, pendingCompanyId: '' },
        [{ fieldPath: 'joinedCompanies', appendMissingElements: { values: [{ stringValue: id }] } }]),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'joinbonus', amount: JOIN_BONUS, by: me.name || '', note: `Empresa fundada · capital inicial por ${me.name}`, at: new Date() }),
    ]);
    return id;
  }
  async findByCode(code) {
    const r = await this.query(null, { from: [{ collectionId: 'companies' }], where: { fieldFilter: { field: { fieldPath: 'joinCode' }, op: 'EQUAL', value: { stringValue: code.trim().toUpperCase() } } }, limit: 1 });
    return r[0] || null;
  }
  async joinById(c, me) {
    // el bono solo cuenta la primera vez que un conductor entra en esa empresa (evita salir y volver a entrar)
    const first = !(me.joinedCompanies || []).includes(c.id);
    const bonus = first ? JOIN_BONUS : 0;
    await this.commit([
      this.create(`companies/${c.id}/members/${this.uid}`, this.memberDoc(me, 'driver')),
      this.upd(`companies/${c.id}`, { lastActivity: new Date() }, [inc('membersCount', 1), inc('balance', bonus)]),
      this.upd(`users/${this.uid}`, { companyId: c.id, companyName: c.name, companyTag: c.tag, pendingCompanyId: '' },
        [{ fieldPath: 'joinedCompanies', appendMissingElements: { values: [{ stringValue: c.id }] } }]),
      this.create(`companies/${c.id}/bank/${newId()}`, { kind: bonus ? 'joinbonus' : 'info', amount: bonus, by: me.name || '', note: bonus ? `${me.name} se ha unido · bono de incorporación` : `${me.name} ha vuelto a la empresa`, at: new Date() }),
    ]);
    return c;
  }
  async joinCompany(code, me) {
    if (me.companyId) throw new Error('Primero sal de tu empresa actual');
    const c = await this.findByCode(code);
    if (!c) throw new Error('Código no válido');
    return this.joinById(c, me);
  }
  // solicitudes para entrar sin código
  async requestJoin(cid, message, me) {
    if (me.companyId) throw new Error('Primero sal de tu empresa actual');
    await this.commit([
      { update: { name: this.path(`companies/${cid}/requests/${this.uid}`), fields: fieldsOf({ name: me.name || '', photo: me.photo || '', km: me.km || 0, jobs: me.jobs || 0, message: message || '', status: 'pending', at: new Date() }) } },
      this.upd(`users/${this.uid}`, { pendingCompanyId: cid }),
    ]);
  }
  async answerRequest(cid, uid, accept) {
    await this.commit([this.upd(`companies/${cid}/requests/${uid}`, { status: accept ? 'accepted' : 'rejected' })]);
  }
  async checkMyRequest(me) {
    if (!me.pendingCompanyId || me.companyId) return null;
    const cid = me.pendingCompanyId;
    const r = await this.getDoc(`companies/${cid}/requests/${this.uid}`);
    if (!r) { await this.updateMe({ pendingCompanyId: '' }); return null; }
    if (r.status === 'accepted') {
      const c = await this.getDoc(`companies/${cid}`);
      if (c) await this.joinById(c, me);
      await this.commit([{ delete: this.path(`companies/${cid}/requests/${this.uid}`) }]);
      return { status: 'accepted', company: c };
    }
    if (r.status === 'rejected') {
      await this.commit([{ delete: this.path(`companies/${cid}/requests/${this.uid}`) }, this.upd(`users/${this.uid}`, { pendingCompanyId: '' })]);
      return { status: 'rejected' };
    }
    return { status: 'pending' };
  }
  async cancelRequest(me) {
    if (!me.pendingCompanyId) return;
    await this.commit([{ delete: this.path(`companies/${me.pendingCompanyId}/requests/${this.uid}`) }, this.upd(`users/${this.uid}`, { pendingCompanyId: '' })]);
  }
  async leaveCompany(me) {
    const c = me.companyId; if (!c) return;
    const comp = await this.getDoc(`companies/${c}`);
    if (comp && comp.ownerUid === this.uid && comp.membersCount > 1) throw new Error('Pasa la propiedad a otro miembro antes de salir');
    const writes = [{ delete: this.path(`companies/${c}/members/${this.uid}`) }, this.upd(`users/${this.uid}`, { companyId: '', companyName: '', companyTag: '' })];
    if (comp && comp.ownerUid === this.uid) writes.push({ delete: this.path(`companies/${c}`) });
    else writes.push(this.upd(`companies/${c}`, { lastActivity: new Date() }, [inc('membersCount', -1)]));
    await this.commit(writes);
  }
  async company(id) {
    const sub = (col, field, limit = 60) => this.query(`companies/${id}`, { from: [{ collectionId: col }], orderBy: [{ field: { fieldPath: field }, direction: 'DESCENDING' }], limit }).catch(() => []);
    const [info, members, jobs, bank, fleet, accounts, fines, requests, garages, events, news, busRoutes] = await Promise.all([
      this.getDoc(`companies/${id}`),
      sub('members', 'km', 200), sub('jobs', 'finishedAt', 200), sub('bank', 'at', 100), sub('fleet', 'boughtAt', 200),
      sub('accounts', 'createdAt', 50), sub('fines', 'at', 100), sub('requests', 'at', 50),
      sub('garages', 'boughtAt', 50), sub('events', 'date', 60), sub('news', 'at', 40), sub('busroutes', 'createdAt', 100),
    ]);
    return { info, members, jobs, bank, fleet, accounts, fines, garages, events, news, busRoutes, requests: requests.filter((r) => r.status === 'pending') };
  }
  async browseCompanies() {
    // sin el banner (pesa mucho): se carga al abrir la ficha de la empresa
    const fields = ['name', 'tag', 'color', 'logo', 'description', 'membersCount', 'km', 'jobs', 'recruiting', 'joinMode', 'requirements', 'ratingSum', 'ratingCount', 'discord', 'website', 'language', 'createdAt', 'ownerName'];
    return this.query(null, { from: [{ collectionId: 'companies' }], select: { fields: fields.map((f) => ({ fieldPath: f })) }, orderBy: [{ field: { fieldPath: 'km' }, direction: 'DESCENDING' }], limit: 100 });
  }
  // ficha pública de una empresa: datos completos + últimas valoraciones
  async companyProfile(id) {
    const [info, ratings] = await Promise.all([
      this.getDoc(`companies/${id}`),
      this.query(`companies/${id}`, { from: [{ collectionId: 'ratings' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 30 }).catch(() => []),
    ]);
    if (!info) throw new Error('Esa empresa ya no existe');
    const { joinCode: _hidden, ...pub } = info;
    return { info: pub, ratings, myRating: ratings.find((r) => r.id === this.uid) || await this.getDoc(`companies/${id}/ratings/${this.uid}`).catch(() => null) };
  }
  async rateCompany(cid, stars, comment, me) {
    stars = Math.round(Number(stars));
    if (!(stars >= 1 && stars <= 5)) throw new Error('Elige de 1 a 5 estrellas');
    const comp = await this.getDoc(`companies/${cid}`);
    if (!comp) throw new Error('Esa empresa ya no existe');
    if (comp.ownerUid === this.uid) throw new Error('No puedes valorar tu propia empresa');
    if (!(me.joinedCompanies || []).includes(cid) && me.companyId !== cid) throw new Error('Solo pueden valorar los conductores que han estado en la empresa');
    const old = await this.getDoc(`companies/${cid}/ratings/${this.uid}`).catch(() => null);
    await this.commit([
      { update: { name: this.path(`companies/${cid}/ratings/${this.uid}`), fields: fieldsOf({ stars, comment: String(comment || '').slice(0, 400), name: me.name || '', photo: me.photo || '', at: new Date() }) } },
      this.upd(`companies/${cid}`, {}, [inc('ratingSum', stars - (old ? old.stars || 0 : 0)), inc('ratingCount', old ? 0 : 1)]),
    ]);
  }
  // empresas públicas: entrar sin esperar a que te acepten
  async joinOpen(cid, me) {
    if (me.companyId) throw new Error('Primero sal de tu empresa actual');
    const c = await this.getDoc(`companies/${cid}`);
    if (!c) throw new Error('Esa empresa ya no existe');
    if ((c.joinMode || (c.recruiting ? 'apply' : 'closed')) !== 'open') throw new Error('Esta empresa no es pública: envía una solicitud');
    return this.joinById(c, me);
  }
  async updateCompany(id, data) {
    const allowed = ['name', 'tag', 'color', 'description', 'commission', 'recruiting', 'language', 'logo', 'roles', 'tags', 'ranks', 'banner', 'busBanner', 'discord', 'website', 'rules', 'joinMode', 'requirements'];
    const clean = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    if (clean.joinMode !== undefined) { if (!['open', 'apply', 'closed'].includes(clean.joinMode)) clean.joinMode = 'apply'; clean.recruiting = clean.joinMode !== 'closed'; }
    if (clean.requirements !== undefined) clean.requirements = cleanReqs(clean.requirements);
    if (clean.rules !== undefined) clean.rules = String(clean.rules).slice(0, 3000);
    for (const k of ['discord', 'website']) if (clean[k]) { clean[k] = String(clean[k]).trim().slice(0, 200); if (!/^https?:\/\//i.test(clean[k])) clean[k] = 'https://' + clean[k]; }
    if (clean.commission !== undefined) clean.commission = Math.min(Math.max(Number(clean.commission) || 0, 0), 50);
    if (clean.tag) clean.tag = clean.tag.toUpperCase().slice(0, 5);
    await this.commit([this.upd(`companies/${id}`, clean)]);
  }
  async newJoinCode(id) { const code = joinCode(); await this.commit([this.upd(`companies/${id}`, { joinCode: code })]); return code; }
  async setRole(id, uid, role) { await this.commit([this.upd(`companies/${id}/members/${uid}`, { role })]); }
  async setSalary(id, uid, perKm, perJob) {
    await this.commit([this.upd(`companies/${id}/members/${uid}`, { salaryPerKm: Math.max(0, Number(perKm) || 0), salaryPerJob: Math.max(0, Math.round(Number(perJob) || 0)) })]);
  }
  async myMember(me) { return me.companyId ? this.getDoc(`companies/${me.companyId}/members/${this.uid}`) : null; }
  async kick(id, uid, name, me) {
    await this.commit([
      { delete: this.path(`companies/${id}/members/${uid}`) },
      this.upd(`companies/${id}`, { lastActivity: new Date() }, [inc('membersCount', -1)]),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'info', amount: 0, by: me.name || '', note: `${name} ha sido expulsado`, at: new Date() }),
    ]);
  }
  async transferOwnership(id, uid, name) {
    await this.commit([
      this.upd(`companies/${id}`, { ownerUid: uid, ownerName: name }),
      this.upd(`companies/${id}/members/${uid}`, { role: 'owner' }),
      this.upd(`companies/${id}/members/${this.uid}`, { role: 'admin' }),
    ]);
  }
  // mueve dinero de la empresa: from/to = 'main' (banco) o id de una cuenta
  balanceOp(id, account, amount) {
    return account === 'main'
      ? this.upd(`companies/${id}`, { lastActivity: new Date() }, [inc('balance', amount)])
      : this.upd(`companies/${id}/accounts/${account}`, {}, [inc('balance', amount)]);
  }
  async available(id, account) {
    const d = account === 'main' ? await this.getDoc(`companies/${id}`) : await this.getDoc(`companies/${id}/accounts/${account}`);
    return d ? d.balance || 0 : 0;
  }
  // pagar a un conductor (bonus / saldo): queda pendiente y lo cobra al abrir la app
  async payBonus(id, uid, name, amount, note, me, from = 'main') {
    amount = Math.round(Number(amount));
    if (!(amount > 0)) throw new Error('Cantidad no válida');
    if ((await this.available(id, from)) < amount) throw new Error('No hay saldo suficiente en esa cuenta');
    await this.commit([
      this.balanceOp(id, from, -amount),
      this.upd(`companies/${id}/members/${uid}`, { lastBonusNote: note || '' }, [inc('pendingBonus', amount), inc('driverEarned', amount)]),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'bonus', amount: -amount, by: me.name || '', account: from, note: `Pago a ${name}${note ? ' · ' + note : ''}`, at: new Date() }),
    ]);
  }
  async claimBonus(me) {
    if (!me.companyId) return 0;
    const m = await this.getDoc(`companies/${me.companyId}/members/${this.uid}`);
    if (!m) { await this.updateMe({ companyId: '', companyName: '', companyTag: '' }); return -1; } // te expulsaron
    const amount = m.pendingBonus || 0;
    if (amount > 0) {
      await this.commit([
        this.upd(`companies/${me.companyId}/members/${this.uid}`, { pendingBonus: 0 }),
        this.upd(`users/${this.uid}`, { lastActivity: new Date() }, [inc('money', amount)]),
        this.create(`users/${this.uid}/transfers/${newId()}`, { amount, other: me.companyName || 'Empresa', note: m.lastBonusNote || 'Pago de la empresa', at: new Date() }),
      ]);
    }
    return amount;
  }
  async deposit(id, amount, me, to = 'main') {
    amount = Math.round(Number(amount));
    if (!(amount > 0)) throw new Error('Cantidad no válida');
    const u = await this.me();
    if ((u.money || 0) < amount) throw new Error('No tienes tanto dinero en la cartera');
    await this.commit([
      this.upd(`users/${this.uid}`, {}, [inc('money', -amount)]),
      this.balanceOp(id, to, amount),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'deposit', amount, by: me.name || '', account: to, note: `Ingreso de ${me.name}`, at: new Date() }),
    ]);
  }
  // cuentas de la empresa (salarios, flota, ahorro…)
  async createAccount(id, name, color, me) {
    if (!name || name.length < 2) throw new Error('Pon un nombre a la cuenta');
    await this.commit([
      this.create(`companies/${id}/accounts/${newId()}`, { name, color: color || '#4C8DFF', balance: 0, createdBy: me.name || '', createdAt: new Date() }),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'info', amount: 0, by: me.name || '', note: `Nueva cuenta: ${name}`, at: new Date() }),
    ]);
  }
  async moveMoney(id, from, to, amount, names, me) {
    amount = Math.round(Number(amount));
    if (!(amount > 0)) throw new Error('Cantidad no válida');
    if (from === to) throw new Error('Elige dos cuentas distintas');
    if ((await this.available(id, from)) < amount) throw new Error('No hay saldo suficiente en la cuenta de origen');
    await this.commit([
      this.balanceOp(id, from, -amount), this.balanceOp(id, to, amount),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'move', amount: 0, moved: amount, by: me.name || '', note: `${names.from} → ${names.to}: ${amount.toLocaleString('es-ES')}`, at: new Date() }),
    ]);
  }
  async deleteAccount(id, acc, me) {
    const writes = [{ delete: this.path(`companies/${id}/accounts/${acc.id}`) }];
    if (acc.balance) writes.push(this.balanceOp(id, 'main', acc.balance));
    writes.push(this.create(`companies/${id}/bank/${newId()}`, { kind: 'info', amount: 0, by: me.name || '', note: `Cuenta cerrada: ${acc.name}${acc.balance ? ' (saldo devuelto al banco)' : ''}`, at: new Date() }));
    await this.commit(writes);
  }
  async buyTruck(id, model, me, color, from = 'main') {
    if (model.kind === 'Camión' || model.kind === 'Autobús') {
      const [fleet, garages] = await Promise.all([
        this.query(`companies/${id}`, { from: [{ collectionId: 'fleet' }], limit: 500 }),
        this.query(`companies/${id}`, { from: [{ collectionId: 'garages' }], limit: 100 }),
      ]);
      const used = fleet.filter((f) => f.kind === 'Camión' || f.kind === 'Autobús').length;
      const slots = BASE_SLOTS + garages.reduce((a, g) => a + (g.slots || 0), 0);
      if (used >= slots) throw new Error(`No hay plazas libres (${used}/${slots}). Compra un garaje primero.`);
    }
    if ((await this.available(id, from)) < model.price) throw new Error('No hay saldo suficiente en esa cuenta');
    await this.commit([
      this.balanceOp(id, from, -model.price),
      this.create(`companies/${id}/fleet/${newId()}`, { model: `${model.brand ? model.brand + ' ' : ''}${model.name}`, modelId: model.id, brand: model.brand || '', kind: model.kind, price: model.price, color: color || '', assignedTo: '', garageId: '', condition: 100, km: 0, boughtBy: me.name || '', boughtAt: new Date() }),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'purchase', amount: -model.price, by: me.name || '', account: from, note: `Compra: ${model.name}`, at: new Date() }),
    ]);
  }
  // ---------- garajes ----------
  async buyGarage(id, { city, size }, me, from = 'main') {
    const g = GARAGES[size]; if (!g) throw new Error('Tamaño no válido');
    if (!city || city.length < 2) throw new Error('Escribe la ciudad del garaje');
    if ((await this.available(id, from)) < g.price) throw new Error('No hay saldo suficiente en esa cuenta');
    await this.commit([
      this.balanceOp(id, from, -g.price),
      this.create(`companies/${id}/garages/${newId()}`, { city, size, slots: g.slots, price: g.price, boughtBy: me.name || '', boughtAt: new Date() }),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'purchase', amount: -g.price, by: me.name || '', account: from, note: `Garaje ${g.name} en ${city}`, at: new Date() }),
    ]);
  }
  async sellGarage(id, g, me) {
    const value = Math.round((g.price || 0) * 0.6);
    await this.commit([
      { delete: this.path(`companies/${id}/garages/${g.id}`) },
      this.upd(`companies/${id}`, { lastActivity: new Date() }, [inc('balance', value)]),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'sale', amount: value, by: me.name || '', note: `Venta del garaje de ${g.city}`, at: new Date() }),
    ]);
  }
  async parkTruck(id, truckId, garageId) { await this.commit([this.upd(`companies/${id}/fleet/${truckId}`, { garageId: garageId || '' })]); }
  // ---------- mantenimiento ----------
  async repairTruck(id, truck, me, from = 'main') {
    const cost = repairCost(truck);
    if (cost <= 0) throw new Error('Este vehículo no necesita reparación');
    if ((await this.available(id, from)) < cost) throw new Error('No hay saldo suficiente en esa cuenta');
    await this.commit([
      this.balanceOp(id, from, -cost),
      this.upd(`companies/${id}/fleet/${truck.id}`, { condition: 100, lastService: new Date(), lastServiceCost: cost }),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'repair', amount: -cost, by: me.name || '', account: from, note: `Taller: ${truck.model} (${Math.round(truck.condition ?? 100)}% → 100%)`, at: new Date() }),
    ]);
  }
  // desgaste del vehículo asignado al conductor tras cada viaje
  async wearMyTruck(id, driverName, km) {
    const list = await this.query(`companies/${id}`, { from: [{ collectionId: 'fleet' }], where: { fieldFilter: { field: { fieldPath: 'assignedTo' }, op: 'EQUAL', value: { stringValue: driverName } } }, limit: 5 });
    const t = list.find((x) => x.kind === 'Camión' || x.kind === 'Autobús');
    if (!t) return null;
    const condition = Math.max(0, Math.round(((t.condition ?? 100) - km / 40) * 10) / 10);
    await this.commit([this.upd(`companies/${id}/fleet/${t.id}`, { condition, lastDriver: driverName }, [inc('km', km, true)])]);
    return { ...t, condition };
  }
  // ---------- miembros: rol personalizado y etiquetas ----------
  async setMemberMeta(id, uid, { title, tags }) {
    const data = {};
    if (title !== undefined) data.title = title;
    if (tags !== undefined) data.tags = tags;
    await this.commit([this.upd(`companies/${id}/members/${uid}`, data)]);
  }
  // ---------- eventos ----------
  async createEvent(id, ev, me) {
    if (!ev.title) throw new Error('Pon un título al evento');
    if (!ev.date || isNaN(new Date(ev.date))) throw new Error('Elige fecha y hora');
    await this.commit([this.create(`companies/${id}/events/${newId()}`, {
      title: ev.title, description: ev.description || '', date: new Date(ev.date), game: ev.game || 'ets2', server: ev.server || '',
      from: ev.from || '', to: ev.to || '', meeting: ev.meeting || '', tmpUrl: ev.tmpUrl || '', attendees: [me.name || ''], createdBy: me.name || '', at: new Date(),
    })]);
  }
  async deleteEvent(id, evId) { await this.commit([{ delete: this.path(`companies/${id}/events/${evId}`) }]); }
  async attendEvent(id, evId, name, going) {
    const t = going ? { fieldPath: 'attendees', appendMissingElements: { values: [{ stringValue: name }] } }
      : { fieldPath: 'attendees', removeAllFromArray: { values: [{ stringValue: name }] } };
    await this.commit([this.upd(`companies/${id}/events/${evId}`, {}, [t])]);
  }
  // ---------- noticias ----------
  async postNews(id, { title, body, image, pinned }, me) {
    if (!title) throw new Error('Pon un título a la noticia');
    await this.commit([this.create(`companies/${id}/news/${newId()}`, { title, body: body || '', image: image || '', pinned: !!pinned, author: me.name || '', authorPhoto: me.photo || '', at: new Date() })]);
  }
  // ---------- préstamos ----------
  async takeLoan(cid, amount, me) {
    amount = Math.round(Number(amount));
    if (!LOAN_OPTIONS.includes(amount)) throw new Error('Cantidad no válida');
    const c = await this.getDoc(`companies/${cid}`);
    if (c && c.loan && c.loan.owed > 0) throw new Error('Primero devuelve el préstamo que ya tienes');
    const owed = Math.round(amount * (1 + LOAN_RATE / 100));
    await this.commit([
      this.upd(`companies/${cid}`, { loan: { amount, owed, total: owed, rate: LOAN_RATE, takenBy: me.name || '', takenAt: new Date() }, lastActivity: new Date() }, [inc('balance', amount)]),
      this.create(`companies/${cid}/bank/${newId()}`, { kind: 'loan', amount, by: me.name || '', note: `Préstamo del banco · a devolver ${owed.toLocaleString('es-ES')} (${LOAN_RATE}% de interés)`, at: new Date() }),
    ]);
  }
  async repayLoan(cid, amount, me) {
    const c = await this.getDoc(`companies/${cid}`);
    const owed = (c && c.loan && c.loan.owed) || 0;
    if (owed <= 0) throw new Error('La empresa no tiene préstamos');
    const pay = Math.min(Math.round(Number(amount) || 0), owed);
    if (pay <= 0) throw new Error('Cantidad no válida');
    if ((c.balance || 0) < pay) throw new Error('No hay saldo suficiente en esa cuenta');
    await this.commit([
      this.upd(`companies/${cid}`, { lastActivity: new Date() }, [inc('balance', -pay), inc('loan.owed', -pay)]),
      this.create(`companies/${cid}/bank/${newId()}`, { kind: 'loanpay', amount: -pay, by: me.name || '', note: pay === owed ? 'Préstamo devuelto del todo ✅' : 'Devolución del préstamo', at: new Date() }),
    ]);
  }
  // ---------- servicio de autobuses ----------
  // gift = autobús de regalo que viene con el servicio (no ocupa plaza de garaje al recibirlo)
  async unlockBus(cid, me, gift) {
    const c = await this.getDoc(`companies/${cid}`);
    if (c && c.busUnlocked) return;
    if ((c.balance || 0) < BUS_UNLOCK_PRICE) throw new Error('No hay saldo suficiente en esa cuenta');
    const writes = [
      this.upd(`companies/${cid}`, { busUnlocked: true, busUnlockedAt: new Date(), lastActivity: new Date(), busGiftClaimed: !!gift }, [inc('balance', -BUS_UNLOCK_PRICE)]),
      this.create(`companies/${cid}/bank/${newId()}`, { kind: 'purchase', amount: -BUS_UNLOCK_PRICE, by: me.name || '', note: 'Servicio de autobuses de la empresa', at: new Date() }),
    ];
    if (gift) {
      writes.push(this.create(`companies/${cid}/fleet/${newId()}`, { model: `${gift.brand ? gift.brand + ' ' : ''}${gift.name}`, modelId: gift.id, brand: gift.brand || '', kind: 'Autobús', price: gift.price, color: gift.color || '', assignedTo: '', garageId: '', condition: 100, km: 0, boughtBy: 'Regalo del servicio de autobuses', gift: true, boughtAt: new Date() }));
      writes.push(this.create(`companies/${cid}/bank/${newId()}`, { kind: 'info', amount: 0, by: me.name || '', note: `Regalo: ${gift.brand ? gift.brand + ' ' : ''}${gift.name}`, at: new Date() }));
    }
    await this.commit(writes);
  }
  // para las empresas que activaron el servicio antes de que existiera el regalo
  async claimBusGift(cid, me, gift) {
    const c = await this.getDoc(`companies/${cid}`);
    if (!c || !c.busUnlocked) throw new Error('Primero activa el servicio de autobuses');
    if (c.busGiftClaimed) throw new Error('Esta empresa ya recibió su autobús de regalo');
    await this.commit([
      this.upd(`companies/${cid}`, { busGiftClaimed: true }),
      this.create(`companies/${cid}/fleet/${newId()}`, { model: `${gift.brand ? gift.brand + ' ' : ''}${gift.name}`, modelId: gift.id, brand: gift.brand || '', kind: 'Autobús', price: gift.price, color: gift.color || '', assignedTo: '', garageId: '', condition: 100, km: 0, boughtBy: 'Regalo del servicio de autobuses', gift: true, boughtAt: new Date() }),
      this.create(`companies/${cid}/bank/${newId()}`, { kind: 'info', amount: 0, by: me.name || '', note: `Regalo: ${gift.brand ? gift.brand + ' ' : ''}${gift.name}`, at: new Date() }),
    ]);
  }
  async fleetOf(cid) { return this.query(`companies/${cid}`, { from: [{ collectionId: 'fleet' }], limit: 500 }); }
  // ---------- reportes ----------
  async submitReport(r, me) {
    const id = newId();
    const doc = { type: r.type || 'otro', reason: r.reason || '', target: String(r.target || '').slice(0, 80), targetId: String(r.targetId || '').slice(0, 60),
      description: String(r.description || '').slice(0, 2000), evidence: String(r.evidence || '').slice(0, 400), reporterUid: this.uid || '', reporterName: (me && me.name) || '',
      version: r.version || '', status: 'open', at: new Date() };
    await this.commit([this.create(`reports/${id}`, doc)]);
    return { id, ...doc };
  }
  // ---------- rutas de autobús de la empresa ----------
  async saveBusRoute(cid, r, me) {
    const stops = (Array.isArray(r.stops) ? r.stops : String(r.stops || '').split('\n')).map((s) => String(s).trim()).filter(Boolean).slice(0, 40);
    if (!String(r.name || '').trim()) throw new Error('Pon un nombre a la ruta');
    if (stops.length < 2) throw new Error('La ruta necesita al menos 2 paradas (salida y destino)');
    const data = {
      code: String(r.code || '').trim().slice(0, 8), name: String(r.name).trim().slice(0, 60), color: r.color || '#FF9F1C',
      game: ['ets2', 'ats', 'any'].includes(r.game) ? r.game : 'any', stops,
      fare: Math.max(0, Math.min(500, Number(r.fare) || 0)), perKm: Math.max(0, Math.min(30, Number(r.perKm ?? 8) || 0)), capacity: Math.max(8, Math.min(120, Math.round(Number(r.capacity) || 55))), bonus: Math.max(0, Math.min(100000, Math.round(Number(r.bonus) || 0))),
      description: String(r.description || '').slice(0, 600), active: r.active !== false,
    };
    if (r.id) await this.commit([this.upd(`companies/${cid}/busroutes/${r.id}`, data)]);
    else await this.commit([this.create(`companies/${cid}/busroutes/${newId()}`, { ...data, createdBy: me.name || '', createdAt: new Date() })]);
  }
  // guarda dónde está una parada de una ruta de la empresa (lo hace el primer conductor que pasa por ella)
  async saveStopPos(cid, rid, pos) {
    const r = await this.getDoc(`companies/${cid}/busroutes/${rid}`);
    if (!r) return;
    const list = (r.stopPos || []).filter((x) => !(x.name === pos.name && x.g === pos.g));
    await this.commit([this.upd(`companies/${cid}/busroutes/${rid}`, { stopPos: [...list, pos].slice(-80) })]);
  }
  async deleteBusRoute(cid, rid) { await this.commit([{ delete: this.path(`companies/${cid}/busroutes/${rid}`) }]); }
  async deleteNews(id, nId) { await this.commit([{ delete: this.path(`companies/${id}/news/${nId}`) }]); }

  async assignTruck(id, truckId, driverName) { await this.commit([this.upd(`companies/${id}/fleet/${truckId}`, { assignedTo: driverName || '' })]); }
  async sellTruck(id, truck, me) {
    const value = Math.round(truck.price * 0.6);
    await this.commit([
      { delete: this.path(`companies/${id}/fleet/${truck.id}`) },
      this.upd(`companies/${id}`, { lastActivity: new Date() }, [inc('balance', value)]),
      this.create(`companies/${id}/bank/${newId()}`, { kind: 'sale', amount: value, by: me.name || '', note: `Venta: ${truck.model}`, at: new Date() }),
    ]);
  }
  // ---------- Discord ----------
  async linkDiscord(user) {
    await this.commit([this.upd(`users/${this.uid}`, { discordId: String(user.id), discordName: user.global_name || user.username || '', discordAt: new Date() })]);
    return this.me();
  }
  async unlinkDiscord() { await this.commit([this.upd(`users/${this.uid}`, { discordId: '', discordName: '' })]); return this.me(); }
  async discordConfig() { return this.getDoc('config/discord'); }
  async claimDiscordAdmin() {
    const c = await this.getDoc('config/discord');
    if (c && c.adminUid && c.adminUid !== this.uid) throw new Error('El bot ya tiene otro administrador');
    if (!c) await this.commit([this.create('config/discord', { adminUid: this.uid, at: new Date() })]);
    return this.getDoc('config/discord');
  }
  async setDiscordConfig(data) { await this.commit([this.upd('config/discord', data)]); }
  // la empresa pide al bot que la registre o la promocione (el bot lo publica en el servidor)
  async discordRequest(cid, type, extra = {}, me = {}) {
    const c = await this.getDoc(`companies/${cid}`);
    if (!c) throw new Error('Esa empresa ya no existe');
    const now = Date.now();
    if (type === 'promo') {
      const last = c.lastPromoAt ? Date.parse(c.lastPromoAt) : 0;
      const WAIT = 14 * 24 * 3600e3; // una promoción cada 2 semanas
      if (now - last < WAIT) { const d = Math.ceil((WAIT - (now - last)) / 864e5); throw new Error(`Solo se puede promocionar una vez cada 2 semanas (faltan ${d} ${d === 1 ? 'día' : 'días'})`); }
    }
    const doc = { type, cid, by: this.uid, byName: me.name || '', byDiscord: me.discordId || '', at: new Date(),
      text: String(extra.text || '').slice(0, 600), photo: type === 'promo' && !extra.posted ? String(extra.photo || '').slice(0, 700000) : '', posted: !!extra.posted };
    const writes = [this.create(`discordQueue/${newId()}`, doc)];
    if (type === 'register') writes.push(this.upd(`companies/${cid}`, { discordRegistered: true, discordRegisteredAt: new Date() }));
    if (type === 'promo') writes.push(this.upd(`companies/${cid}`, { lastPromoAt: new Date() }));
    await this.commit(writes);
  }
  // la primera app que «reclama» una versión es la que la anuncia en Discord
  async claimRelease(tag) {
    try { await this.commit([this.create(`discordReleases/${String(tag).replace(/[^\w.-]/g, '_')}`, { by: this.uid, at: new Date() })]); return true; } catch { return false; }
  }
  // --- solo para el administrador del bot ---
  async discordQueue() { return this.query('', { from: [{ collectionId: 'discordQueue' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'ASCENDING' }], limit: 10 }); }
  async discordQueueDone(id) { await this.commit([{ delete: this.path(`discordQueue/${id}`) }]); }
  async discordUsers() {
    return this.query('', { from: [{ collectionId: 'users' }], where: { fieldFilter: { field: { fieldPath: 'discordId' }, op: 'GREATER_THAN', value: { stringValue: '' } } },
      select: { fields: ['discordId', 'name', 'xp', 'companyId', 'companyTag'].map((f) => ({ fieldPath: f })) }, limit: 1000 });
  }
  async discordCompanies() {
    return this.query('', { from: [{ collectionId: 'companies' }], where: { fieldFilter: { field: { fieldPath: 'discordRegistered' }, op: 'EQUAL', value: { booleanValue: true } } },
      select: { fields: ['name', 'tag', 'color', 'ownerUid', 'ownerName', 'description', 'membersCount'].map((f) => ({ fieldPath: f })) }, limit: 500 });
  }
  async discordMap() { const l = await this.query('', { from: [{ collectionId: 'discordMap' }], limit: 1000 }); return Object.fromEntries(l.map((x) => [x.id, x])); }
  async setDiscordMap(cid, data) { await this.commit([this.upd(`discordMap/${cid}`, data)]); }
  async myTrips() {
    return this.query(`users/${this.uid}`, { from: [{ collectionId: 'jobs' }], orderBy: [{ field: { fieldPath: 'finishedAt' }, direction: 'DESCENDING' }], limit: 100 });
  }
  async driver(uid) {
    const [info, jobs, fines] = await Promise.all([
      this.getDoc(`users/${uid}`),
      this.query(`users/${uid}`, { from: [{ collectionId: 'jobs' }], orderBy: [{ field: { fieldPath: 'finishedAt' }, direction: 'DESCENDING' }], limit: 30 }),
      this.query(`users/${uid}`, { from: [{ collectionId: 'fines' }], orderBy: [{ field: { fieldPath: 'at' }, direction: 'DESCENDING' }], limit: 30 }).catch(() => []),
    ]);
    return { info, jobs, fines };
  }
}

module.exports = { LOAN_OPTIONS, LOAN_RATE, LOAN_AUTOPAY, BUS_UNLOCK_PRICE, BUS_BOOST, cleanReqs, Cloud, toFs, fromFs, fieldsOf, newId, JOIN_BONUS, GARAGES, BASE_SLOTS, repairCost };
