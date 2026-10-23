// Niveles, logros y retos diarios (funciones nuevas de Rutero).

const levelFromXp = (xp) => Math.floor(Math.sqrt(Math.max(xp, 0) / 120)) + 1;
const xpForLevel = (lvl) => (lvl - 1) * (lvl - 1) * 120;

const RANKS = [
  [1, 'Novato'], [5, 'Conductor'], [10, 'Profesional'], [20, 'Veterano'],
  [30, 'Maestro de la ruta'], [45, 'Leyenda'], [60, 'Rey del asfalto'],
];
const rankName = (lvl) => RANKS.filter(([l]) => lvl >= l).pop()[1];

const ACHIEVEMENTS = [
  { id: 'first', icon: '🚚', name: 'Primera entrega', desc: 'Entrega tu primera carga', test: (p) => p.jobs >= 1 },
  { id: 'jobs10', icon: '📦', name: 'Diez cargas', desc: 'Completa 10 entregas', test: (p) => p.jobs >= 10 },
  { id: 'jobs100', icon: '🏗️', name: 'Centenario', desc: 'Completa 100 entregas', test: (p) => p.jobs >= 100 },
  { id: 'km1k', icon: '🛣️', name: '1.000 km', desc: 'Recorre 1.000 km', test: (p) => p.km >= 1000 },
  { id: 'km10k', icon: '🌍', name: 'Trotamundos', desc: 'Recorre 10.000 km', test: (p) => p.km >= 10000 },
  { id: 'km100k', icon: '🪐', name: 'Órbita', desc: 'Recorre 100.000 km', test: (p) => p.km >= 100000 },
  { id: 'perfect', icon: '💎', name: 'Entrega perfecta', desc: 'Entrega sin daños y con 100 puntos', test: (p, j) => j && j.status === 'delivered' && j.score >= 100 && (j.damage || 0) < 0.005 },
  { id: 'perfect10', icon: '🏅', name: 'Manos de seda', desc: '10 entregas perfectas', test: (p) => p.perfect >= 10 },
  { id: 'heavy', icon: '🏋️', name: 'Carga pesada', desc: 'Entrega más de 35 t', test: (p, j) => j && j.status === 'delivered' && (j.cargoMass || 0) >= 35000 },
  { id: 'long', icon: '🧭', name: 'Larga distancia', desc: 'Una entrega de más de 1.500 km', test: (p, j) => j && j.status === 'delivered' && j.km >= 1500 },
  { id: 'mp', icon: '🌐', name: 'Convoy online', desc: 'Entrega una carga en TruckersMP', test: (p, j) => j && j.status === 'delivered' && j.multiplayer },
  { id: 'bus1', icon: '🚌', name: 'Primera línea', desc: 'Completa una ruta de autobús', test: (p) => p.busTrips >= 1 },
  { id: 'bus25', icon: '🚏', name: 'Chófer de confianza', desc: '25 rutas de autobús', test: (p) => p.busTrips >= 25 },
  { id: 'rich', icon: '💰', name: 'Millonario', desc: 'Llega a 1.000.000 en la cartera', test: (p) => p.wallet >= 1000000 },
  { id: 'lvl10', icon: '⭐', name: 'Nivel 10', desc: 'Alcanza el nivel 10', test: (p) => levelFromXp(p.xp) >= 10 },
  { id: 'clean', icon: '🧼', name: 'Expediente limpio', desc: '20 entregas seguidas sin multas', test: (p) => (p.cleanStreak || 0) >= 20 },
];

// Retos diarios: los mismos para todos los conductores (semilla = fecha)
function dailyChallenges(day) {
  let seed = [...day].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const pool = [
    { id: 'deliver', text: (n) => `Entrega ${n} cargas`, goal: () => 2 + Math.floor(rnd() * 3), reward: 2500 },
    { id: 'km', text: (n) => `Conduce ${n} km`, goal: () => 300 + Math.floor(rnd() * 6) * 100, reward: 3000 },
    { id: 'score', text: (n) => n === 1 ? 'Consigue una entrega con 95+ puntos' : `Consigue ${n} entregas con 95+ puntos`, goal: () => 1 + Math.floor(rnd() * 2), reward: 3500 },
    { id: 'bus', text: (n) => n === 1 ? 'Completa una ruta de autobús' : `Completa ${n} rutas de autobús`, goal: () => 1, reward: 2000 },
    { id: 'nofine', text: () => 'Termina una entrega sin multas ni daños', goal: () => 1, reward: 3000 },
  ];
  const picked = [];
  while (picked.length < 3) {
    const c = pool[Math.floor(rnd() * pool.length)];
    if (!picked.find((p) => p.id === c.id)) { const g = c.goal(); picked.push({ id: c.id, text: c.text(g), goal: g, reward: c.reward }); }
  }
  return picked;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Semana ISO (para rankings semanales)
function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

module.exports = { levelFromXp, xpForLevel, rankName, ACHIEVEMENTS, dailyChallenges, today, weekKey };
