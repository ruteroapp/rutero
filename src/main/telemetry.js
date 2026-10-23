// Lectura de la memoria compartida "Local\SCSTelemetry" que crea el plugin
// scs-telemetry.dll (RenCloud scs-sdk-plugin, revisión 12) dentro de ETS2/ATS.
// Los offsets se han calculado compilando la cabecera original del plugin.

const OFF = {
  sdkActive: 0, paused: 4, time: 8, mpTimeOffset: 32,
  pluginRev: 40, verMajor: 44, verMinor: 48, game: 52,
  timeAbs: 64, gears: 68, timeAbsDelivery: 88, plannedDistanceKm: 100,
  restStop: 500, gear: 504, gearDashboard: 508, jobDeliveredEarnedXp: 640,
  scale: 700, fuelCapacity: 704, engineRpmMax: 740, cargoMass: 748,
  speed: 948, engineRpm: 952, userThrottle: 960, userBrake: 964, cruiseControlSpeed: 988,
  fuel: 1000, fuelAvgConsumption: 1004, fuelRange: 1008, adblue: 1012,
  wearEngine: 1036, wearTransmission: 1040, wearCabin: 1044, wearChassis: 1048, wearWheels: 1052,
  odometer: 1056, routeDistance: 1060, routeTime: 1064, speedLimit: 1068,
  jobDeliveredCargoDamage: 1456, jobDeliveredDistanceKm: 1460, refuelAmount: 1464, cargoDamage: 1468,
  isCargoLoaded: 1564, specialJob: 1565, parkBrake: 1566, fuelWarning: 1570, engineEnabled: 1576,
  blinkerLeftOn: 1580, blinkerRightOn: 1581, lightsBeamLow: 1583, lightsBeamHigh: 1584, cruiseControl: 1589,
  jobDeliveredAutoparkUsed: 1613, jobDeliveredAutoloadUsed: 1614,
  coordX: 2200, coordY: 2208, coordZ: 2216, heading: 2224,
  truckBrand: 2364, truckName: 2492, cargo: 2620, cityDst: 2748, compDst: 2876,
  citySrc: 3004, compSrc: 3132, licensePlate: 3212, jobMarket: 3404,
  fineOffence: 3436, ferrySourceName: 3468, ferryTargetName: 3532,
  trainSourceName: 3724, trainTargetName: 3788,
  jobIncome: 4000, jobCancelledPenalty: 4200, jobDeliveredRevenue: 4208, fineAmount: 4216,
  tollgatePayAmount: 4224, ferryPayAmount: 4232, trainPayAmount: 4240,
  onJob: 4300, jobFinished: 4301, jobCancelled: 4302, jobDelivered: 4303, fined: 4304,
  tollgate: 4305, ferry: 4306, train: 4307, refuel: 4308, refuelPayed: 4309,
  trailer0: 6000, trailerAttached: 80, trailerCargoDamage: 152, trailerName: 1240,
};
const READ_SIZE = OFF.trailer0 + 1560; // telemetría + primer remolque
const EXPECTED_REV = 12;

function str(b, o, len = 64) {
  const end = b.indexOf(0, o);
  return b.toString('utf8', o, end === -1 || end > o + len ? o + len : end);
}
const bool = (b, o) => b[o] !== 0;

function parse(b) {
  const f = (k) => b.readFloatLE(OFF[k]);
  const t0 = OFF.trailer0;
  return {
    sdkActive: bool(b, OFF.sdkActive),
    paused: bool(b, OFF.paused),
    tick: Number(b.readBigUInt64LE(OFF.time)),
    multiplayer: b.readBigInt64LE(OFF.mpTimeOffset) !== 0n,
    pluginRev: b.readUInt32LE(OFF.pluginRev),
    game: ['', 'ets2', 'ats'][b.readUInt32LE(OFF.game)] || '',
    gameVersion: `${b.readUInt32LE(OFF.verMajor)}.${b.readUInt32LE(OFF.verMinor)}`,
    timeAbs: b.readUInt32LE(OFF.timeAbs),
    deliveryTimeAbs: b.readUInt32LE(OFF.timeAbsDelivery),
    plannedDistanceKm: b.readUInt32LE(OFF.plannedDistanceKm),
    restStop: b.readInt32LE(OFF.restStop),
    gear: b.readInt32LE(OFF.gearDashboard),
    gears: b.readUInt32LE(OFF.gears),
    speedKmh: f('speed') * 3.6,
    rpm: f('engineRpm'), rpmMax: f('engineRpmMax'),
    throttle: f('userThrottle'), brake: f('userBrake'),
    cruiseKmh: f('cruiseControlSpeed') * 3.6, cruiseOn: bool(b, OFF.cruiseControl),
    fuel: f('fuel'), fuelCapacity: f('fuelCapacity'), fuelAvg: f('fuelAvgConsumption'), fuelRange: f('fuelRange'),
    adblue: f('adblue'), fuelWarning: bool(b, OFF.fuelWarning),
    wear: { engine: f('wearEngine'), transmission: f('wearTransmission'), cabin: f('wearCabin'), chassis: f('wearChassis'), wheels: f('wearWheels') },
    odometer: f('odometer'),
    routeKm: f('routeDistance') / 1000, routeMin: f('routeTime') / 60,
    limitKmh: f('speedLimit') * 3.6,
    parkBrake: bool(b, OFF.parkBrake), engineOn: bool(b, OFF.engineEnabled),
    blinkL: bool(b, OFF.blinkerLeftOn), blinkR: bool(b, OFF.blinkerRightOn),
    lowBeam: bool(b, OFF.lightsBeamLow), highBeam: bool(b, OFF.lightsBeamHigh),
    pos: { x: b.readDoubleLE(OFF.coordX), y: b.readDoubleLE(OFF.coordY), z: b.readDoubleLE(OFF.coordZ), heading: b.readDoubleLE(OFF.heading) },
    truck: { brand: str(b, OFF.truckBrand), name: str(b, OFF.truckName), plate: str(b, OFF.licensePlate) },
    job: {
      cargo: str(b, OFF.cargo), cargoMass: f('cargoMass'),
      citySrc: str(b, OFF.citySrc), compSrc: str(b, OFF.compSrc),
      cityDst: str(b, OFF.cityDst), compDst: str(b, OFF.compDst),
      income: Number(b.readBigUInt64LE(OFF.jobIncome)),
      market: str(b, OFF.jobMarket, 32), special: bool(b, OFF.specialJob),
      loaded: bool(b, OFF.isCargoLoaded), cargoDamage: f('cargoDamage'),
    },
    trailer: {
      attached: bool(b, t0 + OFF.trailerAttached),
      cargoDamage: b.readFloatLE(t0 + OFF.trailerCargoDamage),
      name: str(b, t0 + OFF.trailerName),
    },
    // Banderas de eventos: el plugin las invierte (true<->false) cada vez que ocurre el evento.
    flags: {
      onJob: bool(b, OFF.onJob), jobFinished: bool(b, OFF.jobFinished),
      jobCancelled: bool(b, OFF.jobCancelled), jobDelivered: bool(b, OFF.jobDelivered),
      fined: bool(b, OFF.fined), tollgate: bool(b, OFF.tollgate), ferry: bool(b, OFF.ferry),
      train: bool(b, OFF.train), refuel: bool(b, OFF.refuel), refuelPayed: bool(b, OFF.refuelPayed),
    },
    events: {
      deliveredRevenue: Number(b.readBigInt64LE(OFF.jobDeliveredRevenue)),
      deliveredKm: f('jobDeliveredDistanceKm'), deliveredDamage: f('jobDeliveredCargoDamage'),
      deliveredXp: b.readInt32LE(OFF.jobDeliveredEarnedXp),
      autopark: bool(b, OFF.jobDeliveredAutoparkUsed), autoload: bool(b, OFF.jobDeliveredAutoloadUsed),
      cancelPenalty: Number(b.readBigInt64LE(OFF.jobCancelledPenalty)),
      fineOffence: str(b, OFF.fineOffence, 32), fineAmount: Number(b.readBigInt64LE(OFF.fineAmount)),
      tollAmount: Number(b.readBigInt64LE(OFF.tollgatePayAmount)),
      ferryAmount: Number(b.readBigInt64LE(OFF.ferryPayAmount)),
      ferryFrom: str(b, OFF.ferrySourceName), ferryTo: str(b, OFF.ferryTargetName),
      trainAmount: Number(b.readBigInt64LE(OFF.trainPayAmount)),
      trainFrom: str(b, OFF.trainSourceName), trainTo: str(b, OFF.trainTargetName),
      refuelLiters: f('refuelAmount'),
    },
  };
}

// --- Acceso a la memoria compartida en Windows (koffi, sin compilar nada) ---
class SharedMemoryReader {
  constructor() {
    this.handle = null; this.view = null; this.k = null;
    if (process.platform !== 'win32') return;
    try {
      const koffi = require('koffi');
      const k32 = koffi.load('kernel32.dll');
      this.k = {
        koffi,
        open: k32.func('void* __stdcall OpenFileMappingW(uint32_t access, int inherit, str16 name)'),
        map: k32.func('void* __stdcall MapViewOfFile(void* h, uint32_t access, uint32_t hi, uint32_t lo, size_t bytes)'),
        unmap: k32.func('int __stdcall UnmapViewOfFile(void* p)'),
        close: k32.func('int __stdcall CloseHandle(void* h)'),
        bytes: koffi.array('uint8_t', READ_SIZE, 'Typed'),
      };
    } catch (e) { console.error('koffi no disponible', e); }
  }
  connect() {
    if (!this.k) return false;
    if (this.view) return true;
    const FILE_MAP_READ = 4;
    const h = this.k.open(FILE_MAP_READ, 0, 'Local\\SCSTelemetry');
    if (!h) return false;
    const v = this.k.map(h, FILE_MAP_READ, 0, 0, 0);
    if (!v) { this.k.close(h); return false; }
    this.handle = h; this.view = v; return true;
  }
  read() {
    if (!this.connect()) return null;
    const arr = this.k.koffi.decode(this.view, this.k.bytes);
    return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  disconnect() {
    if (this.view) this.k.unmap(this.view);
    if (this.handle) this.k.close(this.handle);
    this.view = null; this.handle = null;
  }
}

module.exports = { parse, SharedMemoryReader, OFF, READ_SIZE, EXPECTED_REV };
