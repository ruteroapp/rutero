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
  startBus({ line, from, to, fare = 2.5 }) {
    this.bus = { line: line || 'Línea 1', from, to, fare: Number(fare) || 2.5, startedAt: Date.now(), km: 0, stops: 0, passengers: 0, onBoard: 0, stoppedSec: 0, sinceLastStopKm: 0, drivingSec: 0, speedingSec: 0, maxSpeed: 0, events: [] };
    this.emit('bus:update', this.bus);
  }
  busFrame(t, dt, dKm) {
    const b = this.bus;
    b.km += dKm; b.sinceLastStopKm += dKm; b.maxSpeed = Math.max(b.maxSpeed, t.speedKmh);
    if (t.speedKmh > 3) { b.drivingSec += dt; b.stoppedSec = 0; }
    if (t.limitKmh > 5 && t.speedKmh > t.limitKmh + 5) b.speedingSec += dt;
    // Parada: detenido ≥ 12 s con al menos 300 m desde la anterior y sin freno de mano puesto en un parking
    if (t.speedKmh < 1.5) {
      b.stoppedSec += dt;
      if (b.stoppedSec >= 12 && b.sinceLastStopKm >= 0.3) {
        const off = b.stops === 0 ? 0 : Math.min(b.onBoard, Math.floor(Math.random() * (b.onBoard + 1)));
        const on = 2 + Math.floor(Math.random() * 18);
        b.onBoard = Math.min(60, b.onBoard - off + on);
        b.passengers += on; b.stops += 1; b.sinceLastStopKm = 0;
        b.events.push({ stop: b.stops, on, off, at: Date.now() });
        this.emit('bus:stop', { stop: b.stops, on, off, onBoard: b.onBoard });
      }
    }
    this.emit('bus:update', b);
  }
  endBus() {
    const b = this.bus; if (!b) return null;
    const score = Tracker.score({ drivingSec: b.drivingSec, speedingSec: b.speedingSec, damage: 0 });
    const tickets = Math.round(b.passengers * b.fare);
    const revenue = Math.round(tickets + b.km * 0.9 + (score >= 90 && b.km > 1 ? 50 : 0));
    const trip = { type: 'bus', line: b.line, from: b.from, to: b.to, startedAt: b.startedAt, finishedAt: Date.now(), km: b.km, stops: b.stops, passengers: b.passengers, tickets, revenue, score, maxSpeed: b.maxSpeed, status: 'delivered' };
    this.bus = null;
    this.emit('bus:finished', trip);
    return trip;
  }
}

module.exports = { Tracker };
