// Fotos reales de cada modelo desde Wikimedia Commons (solo imágenes con licencia libre,
// guardando autor y licencia para mostrar el crédito). Se pueden sustituir por fotos propias
// en config/fotos.json: { "scania-s": "https://…/mi-foto.jpg" }
const fs = require('fs');
const path = require('path');

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'Rutero/1.0 (ETS2/ATS companion app; contacto en la web de Rutero)';
const FREE = /^(cc|public domain|pd|cc0|attribution)/i;
const WHITE = /white|wei(ss|ß)|blanc|bianco|blanco|wit\b|bia/i;
const BAD = /interior|cab(in)? interior|dashboard|engine|motor|logo|badge|emblem|wheel|crash|accident|scale|model|toy|lego|diecast|modell|drawing|svg/i;

const strip = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function searchCommons(query) {
  const url = `${API}?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=25`
    + `&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Commons ${r.status}`);
  const j = await r.json();
  const pages = Object.values((j.query && j.query.pages) || {});
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const scored = [];
  for (const p of pages) {
    const ii = p.imageinfo && p.imageinfo[0]; if (!ii) continue;
    const md = ii.extmetadata || {};
    const lic = strip(md.LicenseShortName && md.LicenseShortName.value);
    if (!FREE.test(lic)) continue;
    if (ii.width < 800 || ii.width < ii.height * 1.15) continue; // horizontales y con calidad
    const title = p.title || '';
    if (BAD.test(title)) continue;
    const t = title.toLowerCase();
    let score = words.filter((w) => t.includes(w)).length * 10;
    if (WHITE.test(title)) score += 25;
    if (/side|seitenansicht|profile|lateral/i.test(title)) score += 4;
    score += Math.min(ii.width / 1000, 4);
    scored.push({
      score, title, source: 'Wikimedia Commons',
      url: ii.thumburl || ii.url,
      page: ii.descriptionurl,
      author: strip(md.Artist && md.Artist.value).slice(0, 80) || 'Autor desconocido',
      license: lic,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

// Openverse: buscador de imágenes con licencia libre (Flickr, Wikimedia y más)
async function searchOpenverse(query) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license_type=commercial&page_size=30&aspect_ratio=wide&mature=false`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  const j = await r.json();
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const out = [];
  for (const x of j.results || []) {
    const title = `${x.title || ''} ${(x.tags || []).map((t) => t.name).join(' ')}`;
    if (BAD.test(x.title || '')) continue;
    if (x.width && x.width < 640) continue;
    const t = title.toLowerCase();
    let score = words.filter((w) => t.includes(w)).length * 10;
    if (words.length && !t.includes(words[0])) continue; // la marca tiene que aparecer
    if (WHITE.test(title)) score += 25;
    score += Math.min((x.width || 0) / 1000, 4) - 2; // ligera preferencia por Wikimedia
    out.push({
      score, title: x.title || '',
      url: x.url, page: x.foreign_landing_url || x.url,
      author: String(x.creator || 'Autor desconocido').slice(0, 80),
      license: `${String(x.license || '').toUpperCase()} ${x.license_version || ''}`.trim(),
      source: x.source === 'wikimedia' ? 'Wikimedia Commons' : (x.provider || 'Openverse'),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out[0] || null;
}

class Photos {
  constructor(store, configDirs) {
    this.store = store;
    this.custom = {};
    for (const d of configDirs) {
      try { this.custom = { ...this.custom, ...JSON.parse(fs.readFileSync(path.join(d, 'fotos.json'), 'utf8')) }; } catch { /* opcional */ }
    }
    this.pending = new Map();
    this.dirs = configDirs.map((d) => path.join(d, 'fotos'));
  }
  // imagen propia en config/fotos/<id>.png|jpg|webp (por ejemplo, recortes con fondo transparente)
  local(id) {
    for (const d of this.dirs) {
      for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
        const f = path.join(d, `${id}.${ext}`);
        try {
          const b = fs.readFileSync(f);
          return { url: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b.toString('base64')}`, custom: true, cutout: ext === 'png' || ext === 'webp' };
        } catch { /* no existe */ }
      }
    }
    return null;
  }
  cache() { return this.store.get('photoCache') || {}; }
  async get(model, online = true) {
    const loc = this.local(model.id); if (loc) return loc;
    if (this.custom[model.id]) return { url: this.custom[model.id], custom: true };
    if (!model.photo || !online) return null;
    const c = this.cache()[model.id];
    if (c && Date.now() - c.at < (c.data ? 30 : 1) * 86400000) return c.data;
    if (this.pending.has(model.id)) return this.pending.get(model.id);
    const job = (async () => {
      let data = null;
      // se busca en las dos fuentes y se queda la mejor foto
      for (const q of [].concat(model.photo)) {
        const [a, b] = await Promise.all([searchCommons(q).catch(() => null), searchOpenverse(q).catch(() => null)]);
        data = [a, b].filter(Boolean).sort((x, y) => y.score - x.score)[0] || null;
        if (data) break;
      }
      const cache = this.cache(); cache[model.id] = { at: Date.now(), data };
      this.store.set('photoCache', cache);
      return data;
    })();
    this.pending.set(model.id, job);
    try { return await job; } finally { this.pending.delete(model.id); }
  }
  async many(models, online = true) {
    const out = {};
    await Promise.all(models.map(async (m) => { out[m.id] = await this.get(m, online).catch(() => null); }));
    return out;
  }
}

module.exports = { Photos, searchCommons, searchOpenverse };
