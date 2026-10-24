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
  startBus({ line, from, to, fare = 5, perKm = 8, capacity = 55, routeId = '', stopNames = [], bonus = 0, color = '', mine = false, stopPos = [] }) {
    const names = (stopNames || []).map(String).filter(Boolean);
    this.bus = { line: line || 'Línea 1', from: from || names[0] || '', to: to || names[names.length - 1] || '', fare: Math.max(0, Number(fare) || 0), perKm: Math.max(0, Math.min(30, Number(perKm ?? 8) || 0)),
      capacity: Math.max(8, Math.min(120, Math.round(Number(capacity) || 55))), startedAt: Date.now(), mine: !!mine,
      routeId, stopNames: names, bonus: Math.max(0, Number(bonus) || 0), color, next: names[0] || '', km: 0, stops: 0, passengers: 0, onBoard: 0, stoppedSec: 0, sinceLastStopKm: 0, drivingSec: 0, speedingSec: 0, maxSpeed: 0, events: [],
      doors: false, doorsUsed: false, waiting: 0, alighting: 0, stopOn: 0, stopOff: 0, flowSec: 0, ticketMoney: 0, stopName: '',
      stopPos: Array.isArray(stopPos) ? stopPos.filter((p) => p && p.name) : [], nav: null };
    this.emit('bus:update', this.bus);
  }
  busFrame(t, dt, dKm) {
    const b = this.bus;
    this.busSpeed = t.speedKmh;
    b.km += dKm; b.sinceLastStopKm += dKm; b.maxSpeed = Math.max(b.maxSpeed, t.speedKmh);
    if (t.truck && t.truck.brand) b.truck = `${t.truck.brand} ${t.truck.name}`.trim();
    if (t.speedKmh > 3) { b.drivingSec += dt; b.stoppedSec = 0; }
    if (t.limitKmh > 5 && t.speedKmh > t.limitKmh + 5) b.speedingSec += dt;
    if (t.pos) { this.busPos = { x: t.pos.x, z: t.pos.z, heading: t.pos.heading, g: t.game || '' }; b.nav = this.navTo(b); }
    if (b.doors) {
      if (t.speedKmh > 6) { this.toggleDoors(true); this.emit('bus:warn', 'Has arrancado con las puertas abiertas: se han cerrado solas'); }
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
      if (b.stoppedSec >= 12 && b.sinceLastStopKm >= 0.3) {
        const off = b.stops === 0 ? 0 : Math.min(b.onBoard, Math.floor(Math.random() * (b.onBoard + 1)));
        const on = Math.min(b.capacity - (b.onBoard - off), 2 + Math.floor(Math.random() * 18));
        b.onBoard = b.onBoard - off + on;
        this.recordStop(b, b.stops);
        b.passengers += on; b.ticketMoney += on * b.fare; b.stops += 1; b.sinceLastStopKm = 0;
        const name = b.stopNames[b.stops - 1] || '';
        b.next = b.stopNames[b.stops] || '';
        b.events.push({ stop: b.stops, name, on, off, at: Date.now() });
        this.emit('bus:stop', { stop: b.stops, name, on, off, onBoard: b.onBoard });
      }
    }
    this.emit('bus:update', b);
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
  recordStop(b, index) {
    const p = this.busPos; const name = b.stopNames[index];
    if (!p || !name || b.stopPos.some((s) => s.name === name && (!s.g || s.g === p.g))) return;
    const pos = { name, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, g: p.g };
    b.stopPos.push(pos);
    this.emit('bus:stopPos', { routeId: b.routeId, mine: b.mine, pos });
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
      const rnd = (a, z) => a + Math.floor(Math.random() * (z - a + 1));
      b.alighting = first ? 0 : last ? b.onBoard : Math.min(b.onBoard, rnd(0, Math.ceil(b.onBoard * 0.6)));
      b.waiting = last ? 0 : first ? rnd(6, 28) : (Math.random() < 0.15 ? 0 : rnd(1, 18));
      this.emit('bus:doors', { open: true, name: b.stopName, waiting: b.waiting, alighting: b.alighting });
    } else {
      b.doors = false;
      this.recordStop(b, b.stops);
      b.stops += 1; b.sinceLastStopKm = 0;
      b.events.push({ stop: b.stops, name: b.stopName, on: b.stopOn, off: b.stopOff, at: Date.now() });
      b.next = b.stopNames[b.stops] || '';
      const left = b.waiting; b.waiting = 0; b.alighting = 0;
      this.emit('bus:stop', { stop: b.stops, name: b.stopName, on: b.stopOn, off: b.stopOff, onBoard: b.onBoard, left, doors: true });
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
    const revenue = Math.round(tickets + kmPay + (score >= 90 && b.km > 1 ? 50 : 0) + routeBonus);
    const trip = { type: 'bus', line: b.line, from: b.from, to: b.to, startedAt: b.startedAt, finishedAt: Date.now(), km: b.km, stops: b.stops, passengers: b.passengers, tickets, kmPay, perKm: b.perKm, revenue, score, maxSpeed: b.maxSpeed, status: 'delivered',
      routeId: b.mine ? '' : (b.routeId || ''), routeDone, routeBonus, stopNames: b.stopNames, events: b.events, truck: b.truck || '', game: b.game || '', doorsUsed: b.doorsUsed };
    this.bus = null;
    this.emit('bus:finished', trip);
    return trip;
  }
}

module.exports = { Tracker };
