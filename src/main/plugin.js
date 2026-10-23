// Busca ETS2/ATS en Steam e instala el plugin de telemetría en bin/win_x64/plugins
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const GAMES = { ets2: 'Euro Truck Simulator 2', ats: 'American Truck Simulator' };
const PLUGIN_ZIP = 'https://github.com/RenCloud/scs-sdk-plugin/releases/download/V.1.12.1/release_v_1_12_1.zip';

const run = (file, args) => new Promise((res) => execFile(file, args, { windowsHide: true }, (e, out) => res(e ? '' : out)));

async function steamLibraries() {
  const libs = new Set();
  const out = await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath']);
  const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
  const roots = [m && m[1].trim(), 'C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'].filter(Boolean);
  for (const root of roots) {
    const r = path.normalize(root);
    if (fs.existsSync(path.join(r, 'steamapps'))) libs.add(r);
    try {
      const vdf = fs.readFileSync(path.join(r, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const mm of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.normalize(mm[1].replace(/\\\\/g, '\\')));
    } catch { /* sin vdf */ }
  }
  return [...libs];
}

async function findGames(extra = {}) {
  const found = {};
  const libs = await steamLibraries();
  for (const [id, folder] of Object.entries(GAMES)) {
    const candidates = [extra[id], ...libs.map((l) => path.join(l, 'steamapps', 'common', folder))].filter(Boolean);
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'bin', 'win_x64'))) { found[id] = c; break; }
    }
  }
  return found;
}

function pluginStatus(gameDir) {
  const dir = path.join(gameDir, 'bin', 'win_x64', 'plugins');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.dll')); } catch { /* no existe */ }
  return { dir, files, installed: files.some((f) => /scs-telemetry|scs_telemetry|rutero/i.test(f)) };
}

const isX64Dll = (file) => {
  try {
    const b = fs.readFileSync(file);
    const pe = b.readUInt32LE(0x3c);
    return b.toString('ascii', pe, pe + 4) === 'PE\0\0' && b.readUInt16LE(pe + 4) === 0x8664;
  } catch { return false; }
};
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}

// Obtiene la DLL: primero la incluida con Rutero, si no, la descarga de la versión oficial.
async function getPluginDll(resourcesDir, log = () => {}) {
  const bundled = path.join(resourcesDir, 'plugin', 'scs-telemetry.dll');
  if (fs.existsSync(bundled) && isX64Dll(bundled)) return bundled;
  const work = path.join(os.tmpdir(), 'rutero-plugin');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  log('Descargando plugin de telemetría…');
  const r = await fetch(PLUGIN_ZIP);
  if (!r.ok) throw new Error(`No se pudo descargar el plugin (${r.status})`);
  const zip = path.join(work, 'plugin.zip');
  fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
  log('Descomprimiendo…');
  await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(work, 'x')}' -Force`]);
  const dlls = [...walk(path.join(work, 'x'))].filter((f) => f.toLowerCase().endsWith('.dll') && isX64Dll(f));
  const best = dlls.find((f) => /telemetry/i.test(path.basename(f))) || dlls[0];
  if (!best) throw new Error('El paquete descargado no contiene una DLL de 64 bits');
  return best;
}

async function installPlugin(gameDir, resourcesDir, log) {
  const st = pluginStatus(gameDir);
  const dll = await getPluginDll(resourcesDir, log);
  fs.mkdirSync(st.dir, { recursive: true });
  const target = path.join(st.dir, 'scs-telemetry.dll');
  try { fs.copyFileSync(dll, target); } catch (e) {
    if (e.code === 'EBUSY' || e.code === 'EPERM') throw new Error('Cierra el juego antes de instalar el plugin');
    throw e;
  }
  log('Plugin instalado');
  return pluginStatus(gameDir);
}

module.exports = { findGames, pluginStatus, installPlugin, GAMES };
