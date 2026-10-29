// Convierte los fotogramas de telemetría en eventos: trabajo iniciado/entregado/cancelado,
// multas, peajes, ferris, trenes, repostajes, rutas de autobús y puntuación de conducción.

const BUS_WORDS = /bus|coach|autob|setra|irizar|intercity|tourismo|travego|citaro|lion|neoplan|solaris|urbino/i;

class Tracker {
  constructor(emit) {
    this.emit = emit;
    this.prevFlags = null;
    this.job = null;
    this.lastOdo = null;
    this.lastWall = Date.now();
    this.session = { km: 0, startedAt: Date.now(), maxSpeed: 0 };
    this.bus = null;
    this.alerts = { lowFuel: false, fatigue: false };
  }

  static jobKey(j) { return [j.cargo, j.citySrc, j.compSrc, j.cityDst, j.compDst, j.income].join('|'); }
  static isBusVehicle(t) { return BUS_WORDS.test(`${t.truck.brand} ${t.truck.name}`); }

  frame(t) {
    const now = Date.now();
    const dt = Math.min((now - this.lastWall) / 1000, 2);
    this.lastWall = now;
    if (!t || !t.sdkActive) return;

    // ---- distancia recorrida (el odómetro salta en ferris/trenes/teletransportes: lo ignoramos)
    let dKm = 0;
    if (this.lastOdo !== null) {
      const d = t.odometer - this.lastOdo;
      if (d > 0 && d < 2) dKm = d;
    }
    this.lastOdo = t.odometer;
    if (t.paused) return;
    this.session.km += dKm;
    this.session.maxSpeed = Math.max(this.session.maxSpeed, t.speedKmh);

    // ---- inicio de trabajo
    const hasJob = t.job.cargo && (t.job.income > 0 || t.job.cityDst);
    if (hasJob) {
      const key = Tracker.jobKey(t.job);
      if ((!this.job || this.job.key !== key) && key !== this.lastFinishedKey) {
        this.job = {
          key, startedAt: now, game: t.game, multiplayer: t.multiplayer,
          cargo: t.job.cargo, cargoMass: t.job.cargoMass,
          from: `${t.job.citySrc}`, fromCompany: t.job.compSrc,
          to: `${t.job.cityDst}`, toCompany: t.job.compDst,
          income: t.job.income, plannedKm: t.plannedDistanceKm, market: t.job.market,
          special: t.job.special, truck: `${t.truck.brand} ${t.truck.name}`.trim(),
          km: 0, maxSpeed: 0, drivingSec: 0, speedingSec: 0, fuelUsed: 0, lastFuel: t.fuel,
          fines: 0, tolls: 0, bus: Tracker.isBusVehicle(t),
          plate: t.truck.plate, startTimeAbs: t.timeAbs, cruiseSec: 0, idleSec: 0, maxOverLimit: 0,
          samples: [], lastSample: 0, expenses: [],
        };
        this.emit('job:started', this.publicJob());
      }
    } else {
      this.lastFinishedKey = null;
    }

    // ---- métricas durante el trabajo
    if (this.job) {
      const j = this.job;
      j.km += dKm;
      j.maxSpeed = Math.max(j.maxSpeed, t.speedKmh);
      if (t.speedKmh > 3) j.drivingSec += dt;
      if (t.limitKmh > 5 && t.speedKmh > t.limitKmh + 5) { j.speedingSec += dt; j.maxOverLimit = Math.max(j.maxOverLimit, t.speedKmh - t.limitKmh); }
      if (t.cruiseOn && t.speedKmh > 3) j.cruiseSec += dt;
      if (t.engineOn && t.speedKmh < 1) j.idleSec += dt;
      j.endTimeAbs = t.timeAbs;
      if (now - j.lastSample >= 15000 && t.speedKmh > 1) {
        j.lastSample = now;
        j.samples.push([Math.round((now - j.startedAt) / 1000), Math.round(t.speedKmh), Math.round(t.limitKmh)]);
        if (j.samples.length > 480) j.samples = j.samples.filter((_, i) => i % 2 === 0);
      }
      if (t.fuel < j.lastFuel) j.fuelUsed += j.lastFuel - t.fuel;
      j.lastFuel = t.fuel;
      j.damage = Math.max(t.job.cargoDamage, t.trailer.cargoDamage || 0);
    }

    // ---- ruta de autobús activa
    if (this.bus) this.busFrame(t, dt, dKm);

    // ---- banderas de eventos (el plugin las invierte en cada evento)
    const fl = t.flags;
    if (this.prevFlags) {
      const flipped = (k) => fl[k] !== this.prevFlags[k];
      const e = t.events;
      if (flipped('jobDelivered')) this.finishJob('delivered', t);
      if (flipped('jobCancelled')) this.finishJob('cancelled', t);
      const ex = (x) => {
        const full = { ...x, at: Date.now(), speed: Math.round(t.speedKmh), limit: Math.round(t.limitKmh), cargo: this.job ? this.job.cargo : '', route: this.job ? `${this.job.from} → ${this.job.to}` : '' };
        if (this.job) { this.job.expenses.push(full); if (x.kind === 'fine') this.job.fines += x.amount; else this.job.tolls += x.amount; }
        this.emit('expense', full);
      };
      if (flipped('fined')) ex({ kind: 'fine', amount: e.fineAmount, detail: e.fineOffence });
      if (flipped('tollgate')) ex({ kind: 'toll', amount: e.tollAmount });
      if (flipped('ferry')) ex({ kind: 'ferry', amount: e.ferryAmount, detail: `${e.ferryFrom} → ${e.ferryTo}` });
      if (flipped('train')) ex({ kind: 'train', amount: e.trainAmount, detail: `${e.trainFrom} → ${e.trainTo}` });
      if (flipped('refuelPayed')) this.emit('refuel', { liters: e.refuelLiters });
    }
    this.prevFlags = { ...fl };

    // ---- avisos
    const fuelPct = t.fuelCapacity ? t.fuel / t.fuelCapacity : 1;
    if (fuelPct < 0.12 && !this.alerts.lowFuel) { this.alerts.lowFuel = true; this.emit('alert', { kind: 'fuel', text: 'Combustible bajo: busca una gasolinera' }); }
    if (fuelPct > 0.2) this.alerts.lowFuel = false;
    if (t.restStop > 0 && t.restStop < 60 && !this.alerts.fatigue) { this.alerts.fatigue = true; this.emit('alert', { kind: 'sleep', text: `Necesitas descansar en ${t.restStop} min de juego` }); }
    if (t.restStop > 120) this.alerts.fatigue = false;
  }

  static score(j) {
    const drive = Math.max(j.drivingSec, 1);
    const speeding = Math.min(j.speedingSec / drive, 1);
    const dmg = Math.min(j.damage || 0, 1);
    let s = 100 - speeding * 55 - dmg * 120 - Math.min((j.fines || 0) / 200, 10);
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  finishJob(status, t) {
    const j = this.job; const e = t.events;
    if (!j && status !== 'delivered') return;
    const base = j || { startedAt: Date.now(), cargo: t.job.cargo, from: t.job.citySrc, to: t.job.cityDst, km: 0, drivingSec: 0, speedingSec: 0, maxSpeed: 0, fuelUsed: 0, fines: 0, tolls: 0, game: t.game, truck: '' };
    const out = {
      ...this.publicJob(base), status, finishedAt: Date.now(),
      revenue: status === 'delivered' ? e.deliveredRevenue : -Math.abs(e.cancelPenalty),
      km: status === 'delivered' && e.deliveredKm > 0 ? e.deliveredKm : base.km,
      drivenKm: base.km,
      damage: status === 'delivered' ? e.deliveredDamage : (base.damage || 0),
      xp: status === 'delivered' ? e.deliveredXp : 0,
      autopark: e.autopark, autoload: e.autoload,
      durationMin: Math.round((Date.now() - base.startedAt) / 60000),
      avgSpeed: base.drivingSec > 0 ? Math.round((base.km / base.drivingSec) * 3600) : 0,
      gameMinutes: base.startTimeAbs !== undefined && base.endTimeAbs !== undefined ? base.endTimeAbs - base.startTimeAbs : 0,
      fineCount: (base.expenses || []).filter((x) => x.kind === 'fine').length,
    };
    out.score = Tracker.score({ ...base, damage: out.damage });
    this.emit(status === 'delivered' ? 'job:delivered' : 'job:cancelled', out);
    this.lastFinishedKey = j ? j.key : Tracker.jobKey(t.job);
    this.job = null;
  }

  publicJob(j = this.job) {
    if (!j) return null;
    const { lastFuel, key, lastSample, ...rest } = j;
    return { ...rest, score: Tracker.score(j) };
  }

  // ------------------------------------------------------------------ Autobús
  // Con puertas (tecla U en el juego): al abrir bajan y suben pasajeros poco a poco; al cerrar cuenta la parada.
  // Sin usar puertas: modo automático (detenido 12 s = parada), como antes.
  // Además: satisfacción de los pasajeros (frenazos, curvas, velocidad), horario por parada, gente según la hora y el sitio,
  // propinas y gastos de combustible y desgaste.
  startBus({ line, from, to, fare = 5, perKm = 8, capacity = 55, routeId = '', stopNames = [], bonus = 0, color = '', mine = false, stopPos = [], reputation = 80 }) {
    const names = (stopNames || []).map(String).filter(Boolean);
    this.bus = { line: line || 'Línea 1', from: from || names[0] || '', to: to || names[names.length - 1] || '', fare: Math.max(0, Number(fare) || 0), perKm: Math.max(0, Math.min(30, Number(perKm ?? 8) || 0)),
      capacity: Math.max(8, Math.min(120, Math.round(Number(capacity) || 55))), startedAt: Date.now(), mine: !!mine,
      routeId, stopNames: names, bonus: Math.max(0, Number(bonus) || 0), color, next: names[0] || '', km: 0, stops: 0, passengers: 0, onBoard: 0, stoppedSec: 0, sinceLastStopKm: 0, drivingSec: 0, speedingSec: 0, maxSpeed: 0, events: [],
      doors: false, doorsUsed: false, waiting: 0, alighting: 0, stopOn: 0, stopOff: 0, flowSec: 0, ticketMoney: 0, stopName: '',
      stopPos: Array.isArray(stopPos) ? stopPos.filter((p) => p && p.name) : [], nav: null,
      // satisfacción 0–100 y lo que la ha bajado
      sat: 100, satEv: { brake: 0, turn: 0, speed: 0, doors: 0 }, reputation: Math.max(0, Math.min(100, Number(reputation) || 80)),
      tips: 0, punctual: 0, late: 0, timed: 0, lostLate: 0, punctualPay: 0, eta: null, lastDelay: null,
      fuelUsed: 0, gameMin: 0, limit: 0, demand: null, announced: -1 };
    this.busAcc = 0; this.busLat = 0; this.busPrev = null; this.busEv = {}; this.busCd = {}; this.busWarnAt = 0; this.busFuel = null;
    this.emit('bus:update', this.bus);
  }
  busFrame(t, dt, dKm) {
    const b = this.bus;
    this.busSpeed = t.speedKmh;
    b.km += dKm; b.sinceLastStopKm += dKm; b.maxSpeed = Math.max(b.maxSpeed, t.speedKmh);
    b.gameMin = t.timeAbs || 0; b.limit = t.limitKmh || 0; b.game = t.game || b.game || '';
    if (t.truck && t.truck.brand) b.truck = `${t.truck.brand} ${t.truck.name}`.trim();
    if (t.speedKmh > 3) { b.drivingSec += dt; b.stoppedSec = 0; }
    if (t.limitKmh > 5 && t.speedKmh > t.limitKmh + 5) b.speedingSec += dt;
    // combustible gastado (si sube es que has repostado: no cuenta)
    if (this.busFuel !== null && t.fuel < this.busFuel && this.busFuel - t.fuel < 5) b.fuelUsed += this.busFuel - t.fuel;
    this.busFuel = t.fuel;
    if (t.pos) { this.busPos = { x: t.pos.x, z: t.pos.z, heading: t.pos.heading, g: t.game || '' }; b.nav = this.navTo(b); }
    this.comfort(b, t, dt);
    // anuncio al acercarse a la parada
    if (b.nav && b.nav.known && !b.doors && b.nav.dist < 220 && b.announced !== b.stops && (b.stops > 0 || b.km > 0.3)) {
      b.announced = b.stops;
      this.emit('bus:announce', { kind: 'arriving', name: b.nav.name, last: b.stops >= b.stopNames.length - 1 });
    }
    if (b.doors) {
      if (t.speedKmh > 6) { this.comfortHit(b, 'doors', 8, true); this.toggleDoors(true); this.emit('bus:warn', 'Has arrancado con las puertas abiertas: se han cerrado solas'); }
      else {
        // primero bajan, luego suben (uno cada ~0,8 s)
        b.flowSec += dt;
        while (b.flowSec >= 0.8) {
          b.flowSec -= 0.8;
          if (b.alighting > 0 && b.onBoard > 0) { b.alighting--; b.onBoard--; b.stopOff++; }
          else if (b.waiting > 0 && b.onBoard < b.capacity) { b.waiting--; b.onBoard++; b.passengers++; b.stopOn++; b.ticketMoney += b.fare; }
          else break;
        }
      }
    } else if (!b.doorsUsed && t.speedKmh < 1.5) {
      // modo automático
      b.stoppedSec += dt;
      if (b.stoppedSec >= 12 && b.sinceLastStopKm >= 0.3 && !this.awayFromStop(b)) {
        const d = this.demand(b, b.stopNames[b.stops] || '');
        const off = b.stops === 0 ? 0 : Math.min(b.onBoard, Math.floor(Math.random() * (b.onBoard + 1)));
        const on = Math.min(b.capacity - (b.onBoard - off), Math.round((2 + Math.floor(Math.random() * 18)) * d.mult));
        b.onBoard = b.onBoard - off + on;
        this.recordStop(b, b.stops);
        b.tips += this.tipFor(b, off);
        b.passengers += on; b.ticketMoney += on * b.fare; b.stops += 1; b.sinceLastStopKm = 0;
        const name = b.stopNames[b.stops - 1] || '';
        b.next = b.stopNames[b.stops] || '';
        b.events.push({ stop: b.stops, name, on, off, at: Date.now() });
        this.emit('bus:stop', { stop: b.stops, name, on, off, onBoard: b.onBoard });
        this.afterStop(b);
      }
    }
    this.emit('bus:update', b);
  }
  // Comodidad: frenazos, curvas rápidas y exceso de velocidad bajan la satisfacción (solo con pasajeros a bordo).
  comfort(b, t, dt) {
    const v = Math.abs(t.speedKmh); const prev = this.busPrev;
    this.busPrev = { v, hd: t.pos ? t.pos.heading : null };
    if (!prev || dt <= 0.01) return;
    const k = Math.min(1, dt / 0.4); // suavizado (~0,4 s)
    const acc = (v - prev.v) / dt; // km/h por segundo
    let w = 0;
    if (t.pos && prev.hd !== null) { let d = t.pos.heading - prev.hd; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; w = Math.abs(d * 2 * Math.PI) / dt; }
    if (Math.abs(acc) > 60 || w > 3) { this.busAcc = 0; this.busLat = 0; return; } // saltos (ferri, teletransporte)
    this.busAcc += (acc - this.busAcc) * k;
    this.busLat += ((v / 3.6) * w - this.busLat) * k; // aceleración lateral en m/s²
    if (b.onBoard <= 0 || b.doors) return;
    // cada frenazo o curva cuenta una vez, según lo fuerte que haya sido (el pico)
    const peak = (kind, val, limit, on, pts) => {
      const ev = this.busEv || (this.busEv = {});
      if (on && val > limit) ev[kind] = Math.max(ev[kind] || 0, val);
      else if (ev[kind]) { this.comfortHit(b, kind, pts(ev[kind] - limit)); ev[kind] = 0; }
    };
    peak('brake', -this.busAcc, Tracker.HARD_BRAKE, v > 2 || (this.busEv && this.busEv.brake), (x) => Math.min(10, 3 + x * 0.5));
    peak('turn', this.busLat, Tracker.HARD_TURN, v > 12, (x) => Math.min(8, 2 + x * 2));
    if (t.limitKmh > 5 && v > t.limitKmh + 8) { b.sat = Math.max(0, b.sat - 0.25 * dt); b.satEv.speed += dt; }
    else if (Math.abs(this.busAcc) < 5 && this.busLat < 1.5) b.sat = Math.min(100, b.sat + 0.015 * dt); // se recupera conduciendo suave
  }
  comfortHit(b, kind, pts, silent = false) {
    const now = Date.now();
    if (this.busCd[kind] && now - this.busCd[kind] < 1500) return;
    this.busCd[kind] = now;
    b.sat = Math.max(0, b.sat - pts); b.satEv[kind] = (b.satEv[kind] || 0) + 1;
    if (!silent && now - this.busWarnAt > 9000) {
      this.busWarnAt = now;
      this.emit('bus:warn', kind === 'brake' ? 'Frenazo: los pasajeros se quejan' : 'Curva demasiado rápida: los pasajeros se quejan');
    }
  }
  // cuánta gente espera: hora del juego, tamaño del sitio, satisfacción y fama de la línea
  demand(b, name) {
    const h = Math.floor((b.gameMin || 0) / 60) % 24;
    const hour = (h >= 7 && h < 9) || (h >= 17 && h < 19) ? 1.6 : h >= 23 || h < 5 ? 0.35 : h < 7 || h >= 21 ? 0.7 : 1;
    const place = Tracker.BIG_CITY.test(name || '') ? 1.5 : b.limit > 65 ? 0.6 : 1;
    const mood = 0.6 + b.sat / 250 + (b.reputation - 80) / 400;
    const mult = Math.max(0.15, hour * place * mood);
    return { mult, rush: hour > 1, night: hour < 0.5, big: place > 1, road: place < 1 };
  }
  // propina de los que bajan si van contentos
  tipFor(b, off) { const rate = b.sat >= 85 ? 0.3 : b.sat >= 70 ? 0.1 : 0; return Math.round(off * b.fare * rate * 100) / 100; }
  // horario: tiempo previsto hasta la siguiente parada (si se conocen las dos posiciones)
  afterStop(b) {
    b.eta = null;
    const i = b.stops; const name = b.stopNames[i];
    if (!name) { if (b.stopNames.length) this.emit('bus:announce', { kind: 'end' }); return; }
    this.emit('bus:announce', { kind: 'next', name, last: i >= b.stopNames.length - 1 });
    const g = this.busPos && this.busPos.g;
    const find = (n) => b.stopPos.find((s) => s.name === n && (!s.g || !g || s.g === g));
    const a = find(b.stopNames[i - 1]), c = find(name);
    if (!a || !c) return;
    const d = Math.hypot(c.x - a.x, c.z - a.z) * 1.3; // las carreteras no van en línea recta
    const v = d < 2500 ? 8.3 : d < 10000 ? 13.9 : 19.4; // 30 / 50 / 70 km/h de media
    b.eta = { stop: i, due: Date.now() + Math.round((d / v + 20) * 1000) };
  }
  // Guía hacia la próxima parada: distancia y ángulo respecto a hacia dónde mira el vehículo.
  // SCS: x hacia el este, z hacia el sur; heading 0..1 en sentido antihorario con 0 = norte.
  navTo(b) {
    const p = this.busPos; const name = b.stopNames[b.stops];
    if (!p || !name) return null;
    const target = b.stopPos.find((s) => s.name === name && (!s.g || !p.g || s.g === p.g));
    if (!target) return { name, known: false };
    const dx = target.x - p.x, dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const th = p.heading * 2 * Math.PI, thd = Math.atan2(-dx, -dz);
    let rel = ((thd - th) * 180 / Math.PI) % 360; if (rel > 180) rel -= 360; if (rel < -180) rel += 360;
    return { name, known: true, dist: Math.round(dist), rel: Math.round(-rel) }; // rel > 0 = a la derecha
  }
  // true si la posición de la próxima parada es conocida y el autobús está lejos de ella
  awayFromStop(b) {
    const nav = b.nav || this.navTo(b);
    return !!(nav && nav.known && nav.dist > Tracker.STOP_RADIUS);
  }
  recordStop(b, index) {
    const p = this.busPos; const name = b.stopNames[index];
    if (!p || !name || b.stopPos.some((s) => s.name === name && (!s.g || s.g === p.g))) return;
    const pos = { name, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, g: p.g };
    b.stopPos.push(pos);
    this.emit('bus:stopPos', { routeId: b.routeId, mine: b.mine, pos });
  }
  // «la parada está aquí»: mueve la próxima parada al sitio donde estás (para corregir una mal grabada)
  relocateStop() {
    const b = this.bus; const p = this.busPos;
    if (!b || !p) return null;
    const name = b.stopNames[b.stops];
    if (!name) return null;
    const pos = { name, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, g: p.g };
    b.stopPos = [...b.stopPos.filter((s) => !(s.name === name && (!s.g || s.g === p.g))), pos];
    b.nav = this.navTo(b);
    this.emit('bus:stopPos', { routeId: b.routeId, mine: b.mine, pos });
    // si tenía las puertas abiertas «fuera de la parada», se vuelven a abrir ya en la parada
    if (b.doors && b.offStop) { b.doors = false; b.offStop = false; this.toggleDoors(true); }
    this.emit('bus:update', b);
    return name;
  }
  // abre o cierra las puertas (tecla U o botón de la app)
  toggleDoors(force = false) {
    const b = this.bus; if (!b) return null;
    if (!b.doors) {
      if (!force && (this.busSpeed || 0) > 3) { this.emit('bus:warn', 'Para el autobús antes de abrir las puertas'); return b; }
      const n = b.stopNames.length;
      const first = b.stops === 0, last = n > 0 && b.stops >= n - 1;
      b.doors = true; b.doorsUsed = true; b.flowSec = 0; b.stopOn = 0; b.stopOff = 0;
      b.stopName = b.stopNames[b.stops] || '';
      // fuera de la parada (si ya se sabe dónde está) se abren las puertas, pero nadie sube ni baja
      b.offStop = this.awayFromStop(b);
      if (b.offStop) {
        b.alighting = 0; b.waiting = 0;
        this.emit('bus:warn', `Estás a ${b.nav.dist} m de la parada: aquí no sube ni baja nadie`);
        this.emit('bus:doors', { open: true, name: b.stopName, waiting: 0, alighting: 0, offStop: true, dist: b.nav.dist });
        this.emit('bus:update', b);
        return b;
      }
      const rnd = (a, z) => a + Math.floor(Math.random() * (z - a + 1));
      const d = this.demand(b, b.stopName); b.demand = d;
      b.alighting = first ? 0 : last ? b.onBoard : Math.min(b.onBoard, rnd(0, Math.ceil(b.onBoard * 0.6)));
      b.waiting = last ? 0 : Math.round((first ? rnd(6, 28) : (Math.random() < 0.15 ? 0 : rnd(1, 18))) * d.mult);
      // puntualidad
      b.lastDelay = null;
      if (b.eta && b.eta.stop === b.stops) {
        const delay = Math.round((Date.now() - b.eta.due) / 1000);
        b.lastDelay = delay; b.timed++;
        if (delay <= Tracker.ON_TIME) { b.punctual++; const pay = Math.max(10, Math.round(b.fare * 3)); b.punctualPay += pay; b.lastPay = pay; }
        else if (delay > Tracker.VERY_LATE) {
          b.late++; const lost = Math.round(b.waiting * 0.4); b.waiting -= lost; b.lostLate += lost; b.sat = Math.max(0, b.sat - 3);
        }
      }
      this.emit('bus:doors', { open: true, name: b.stopName, waiting: b.waiting, alighting: b.alighting, delay: b.lastDelay, rush: d.rush, night: d.night });
    } else {
      b.doors = false;
      if (b.offStop) { b.offStop = false; this.emit('bus:doors', { open: false, name: b.stopName, offStop: true }); this.emit('bus:update', b); return b; }
      this.recordStop(b, b.stops);
      const tip = this.tipFor(b, b.stopOff); b.tips += tip;
      b.stops += 1; b.sinceLastStopKm = 0;
      b.events.push({ stop: b.stops, name: b.stopName, on: b.stopOn, off: b.stopOff, at: Date.now(), delay: b.lastDelay, tip });
      b.next = b.stopNames[b.stops] || '';
      const left = b.waiting; b.waiting = 0; b.alighting = 0;
      this.emit('bus:stop', { stop: b.stops, name: b.stopName, on: b.stopOn, off: b.stopOff, onBoard: b.onBoard, left, doors: true, tip });
      this.afterStop(b);
    }
    this.emit('bus:update', b);
    return b;
  }
  endBus() {
    const b = this.bus; if (!b) return null;
    const score = Tracker.score({ drivingSec: b.drivingSec, speedingSec: b.speedingSec, damage: 0 });
    const tickets = Math.round(b.ticketMoney);
    const kmPay = Math.round(b.km * b.perKm);
    const routeDone = !!(b.stopNames.length && b.stops >= b.stopNames.length);
    const routeBonus = routeDone && b.routeId ? Math.round(b.bonus) : 0;
    const tips = Math.round(b.tips);
    const punctualPay = Math.round(b.punctualPay);
    // gastos: combustible gastado y desgaste por km
    const fuelCost = Math.round(b.fuelUsed * (b.game === 'ats' ? Tracker.FUEL_PRICE.ats : Tracker.FUEL_PRICE.ets2));
    const wearCost = Math.round(b.km * Tracker.WEAR_PER_KM);
    const costs = fuelCost + wearCost;
    const satisfaction = Math.round(b.passengers ? b.sat : 100);
    const stars = Math.max(1, Math.min(5, Math.round(satisfaction / 20)));
    const revenue = Math.max(0, Math.round(tickets + kmPay + (score >= 90 && b.km > 1 ? 50 : 0) + routeBonus + tips + punctualPay - costs));
    const trip = { type: 'bus', line: b.line, from: b.from, to: b.to, startedAt: b.startedAt, finishedAt: Date.now(), km: b.km, stops: b.stops, passengers: b.passengers, tickets, kmPay, perKm: b.perKm, revenue, score, maxSpeed: b.maxSpeed, status: 'delivered',
      routeId: b.mine ? '' : (b.routeId || ''), myRouteId: b.mine ? b.routeId : '', routeDone, routeBonus, stopNames: b.stopNames, events: b.events, truck: b.truck || '', game: b.game || '', doorsUsed: b.doorsUsed,
      satisfaction, stars, satEv: b.satEv, tips, punctual: b.punctual, late: b.late, timed: b.timed, lostLate: b.lostLate, punctualPay,
      fuelUsed: Math.round(b.fuelUsed * 10) / 10, fuelCost, wearCost, costs, durationMin: Math.round((Date.now() - b.startedAt) / 60000), speedingSec: Math.round(b.speedingSec) };
    this.bus = null;
    this.emit('bus:finished', trip);
    return trip;
  }
}

Tracker.STOP_RADIUS = 60; // metros alrededor de la parada en los que se puede subir y bajar
Tracker.HARD_BRAKE = 11;  // km/h por segundo (≈3 m/s²): más que esto es un frenazo
Tracker.HARD_TURN = 3.2;  // m/s² de aceleración lateral: más es una curva brusca
Tracker.ON_TIME = 120;    // segundos de retraso que aún cuentan como puntual
Tracker.VERY_LATE = 300;  // a partir de aquí parte de la gente se cansa de esperar
Tracker.FUEL_PRICE = { ets2: 1.6, ats: 1.1 }; // por litro
Tracker.WEAR_PER_KM = 0.12;
// paradas en ciudades grandes (por el nombre que le pones): más pasajeros
Tracker.BIG_CITY = /madrid|barcelona|valencia|sevilla|bilbao|lisboa|lisbon|porto|par[ií]s|lyon|marseill|london|londres|manchester|birmingham|berl[ií]n|hamburg|m[uü]nchen|munich|frankfurt|k[oö]ln|cologne|stuttgart|wien|vienna|viena|praha|prague|praga|warszawa|warsaw|varsovia|krak[oó]w|budapest|roma|rome|milan|mil[aá]n|napoli|naples|torino|amsterdam|rotterdam|bruxelles|brussels|bruselas|z[uü]rich|gen[eè]v|k[øo]benhavn|copenhag|stockholm|estocolmo|oslo|helsinki|dublin|istanbul|bucure|sofia|athen|atenas|kyiv|kiev|riga|vilnius|tallinn|los angeles|san francisco|san diego|las vegas|phoenix|seattle|portland|denver|dallas|houston|austin|san antonio|chicago|new york|nueva york|salt lake|sacramento|albuquerque|oklahoma|kansas city|estaci[oó]n|station|centro|center|centre|downtown|aeropuerto|airport/i;
module.exports = { Tracker };
