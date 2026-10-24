// Almacenamiento local en JSON (carpeta de datos de la app).
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    units: 'auto',            // auto | kmh | mph
    overlay: false,
    overlayOpacity: 0.85,
    realisticEconomy: true,   // multas/peajes restan de la cartera
    startWithWindows: false,
    tmpId: '',
    sounds: true,
    language: 'auto',          // auto = según el idioma de Windows
    realPhotos: false,        // fotos reales de internet en el concesionario (si no, dibujos)
    busDoorKey: 'U',          // tecla del juego para abrir y cerrar las puertas del autobús
    busHotkeys: true,         // F1 grabar ruta · F2–F11 paradas
  },
  busRoutes: [],              // rutas de autobús propias (con todas sus paradas)
  profile: { name: '', wallet: 0, xp: 0, km: 0, jobs: 0, busTrips: 0, perfect: 0, fines: 0, cancelled: 0 },
  jobs: [],
  expenses: [],
  achievements: {},
  daily: { day: '', progress: {} },
  pendingCloud: [],
  photoCache: {},
  auth: null,
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'rutero-data.json');
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const k of Object.keys(DEFAULTS)) {
        if (raw[k] === undefined) continue;
        this.data[k] = (typeof DEFAULTS[k] === 'object' && !Array.isArray(DEFAULTS[k]) && DEFAULTS[k] !== null)
          ? { ...DEFAULTS[k], ...raw[k] } : raw[k];
      }
    } catch { /* primera vez */ }
    this.timer = null;
  }
  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  patch(k, v) { this.data[k] = { ...this.data[k], ...v }; this.save(); }
  push(k, v, max = 2000) { this.data[k].unshift(v); if (this.data[k].length > max) this.data[k].length = max; this.save(); }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (e) { console.error('No se pudo guardar', e); }
  }
}

module.exports = { Store };
