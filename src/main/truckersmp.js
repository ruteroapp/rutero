// Conexión con la API pública de TruckersMP (https://api.truckersmp.com/v2)
const { exec } = require('child_process');

const API = 'https://api.truckersmp.com/v2';
const cache = new Map();

async function get(path, ttl = 60_000) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(API + path, { headers: { 'User-Agent': 'Rutero/1.0 (ETS2/ATS companion app)' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(typeof j.response === 'string' ? j.response : (j.descriptor || `TruckersMP respondió ${r.status}`));
  cache.set(path, { t: Date.now(), v: j.response });
  return j.response;
}

const tmp = {
  servers: () => get('/servers', 30_000),
  gameTime: () => get('/game_time', 30_000).then((r) => (r && r.game_time !== undefined ? r.game_time : r)),
  version: () => get('/version', 3_600_000),
  player: (id) => get(`/player/${encodeURIComponent(id)}`, 120_000),
  bans: (id) => get(`/bans/${encodeURIComponent(id)}`, 120_000),
  events: () => get('/events', 300_000),
  event: (id) => get(`/events/${encodeURIComponent(id)}`, 300_000),
  vtcs: () => get('/vtc', 600_000),
  vtc: (id) => get(`/vtc/${encodeURIComponent(id)}`, 300_000),
  vtcMembers: (id) => get(`/vtc/${encodeURIComponent(id)}/members`, 300_000),
  vtcNews: (id) => get(`/vtc/${encodeURIComponent(id)}/news`, 300_000),
  vtcEvents: (id) => get(`/vtc/${encodeURIComponent(id)}/events`, 300_000),
  rules: () => get('/rules', 3_600_000),
  // ¿Está abierto el lanzador / cliente de TruckersMP?
  running: () => new Promise((res) => {
    if (process.platform !== 'win32') return res(false);
    exec('tasklist /FO CSV /NH', { windowsHide: true }, (err, out) => {
      if (err) return res(false);
      res(/truckersmp|ets2mp|atsmp/i.test(out));
    });
  }),
};

module.exports = { tmp };
