const K = window.rutero;
const LOC = () => (window.RI18N ? RI18N.locale() : 'es-ES');
const $ = (id) => document.getElementById(id);
let imperial = false, toastTimer, bus = null, units = 'auto', cfg = null;

function applyCfg(c) {
  cfg = c;
  document.documentElement.style.setProperty('--acc', c.accent || '#4C8DFF');
  document.body.className = [c.theme === 'light' ? 'light' : c.theme === 'glass' ? 'glass' : '', c.compact ? 'compact' : '', c.locked ? 'locked' : ''].join(' ');
  $('box').style.opacity = c.opacity ?? 0.88;
  $('box').style.transform = `scale(${c.scale || 1})`;
  document.querySelectorAll('[data-w]').forEach((el) => el.classList.toggle('hide', !c.widgets[el.dataset.w]));
  resize();
}
// ajusta el tamaño de la ventana al contenido (y la coloca en su esquina)
function resize() {
  requestAnimationFrame(() => {
    const r = $('box').getBoundingClientRect();
    K.call('overlay:size', Math.ceil(r.width + 14), Math.ceil(r.height + 14)).catch(() => {});
  });
}

K.call('state').then((s) => { units = s.settings.units; if (window.RI18N) { RI18N.set(s.lang || 'es'); RI18N.start(document); } });
K.call('overlay:cfg').then(applyCfg);
K.on('overlay:cfg', applyCfg);
K.on('opacity', (v) => { $('box').style.opacity = v; });

const fmtMin = (m) => { m = Math.round(m); return m > 0 ? (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`) : '—'; };
K.on('telemetry', (t) => {
  imperial = units === 'mph' || (units === 'auto' && t.game === 'ats');
  const c = (v) => Math.round(imperial ? v * 0.621371 : v);
  const cur = t.game === 'ats' ? '$' : '€';
  $('s').textContent = c(Math.abs(t.speedKmh));
  $('u').textContent = imperial ? 'MPH' : 'KM/H';
  $('g').textContent = t.gear > 0 ? t.gear : t.gear < 0 ? 'R' : 'N';
  $('cc').textContent = t.cruiseOn ? c(t.cruiseKmh) : '—';
  const l = $('l');
  if (t.limitKmh > 1) { l.textContent = c(t.limitKmh); l.style.opacity = 1; l.classList.toggle('over', t.speedKmh > t.limitKmh + 5); }
  else { l.textContent = '—'; l.style.opacity = .4; l.classList.remove('over'); }
  $('rpm').style.width = `${Math.min(100, (t.rpm / (t.rpmMax || 2500)) * 100)}%`;
  const j = t.job;
  if (!bus) { const nb = $('nav'); if (nb.classList.contains('on')) { nb.classList.remove('on'); resize(); } }
  if (bus) $('j').textContent = `${bus.doors ? '🚪 ' + RI18N.tr('Puertas abiertas') + ' · ' + (bus.alighting ? `-${bus.alighting}` : `+${bus.waiting}`) : '🚌 ' + bus.line} · ${bus.next ? `${RI18N.tr('próxima')}: ${bus.next}` : `${RI18N.tr('parada')} ${bus.stops}`} · ${bus.onBoard} ${RI18N.tr('a bordo')}`;
  else $('j').textContent = j ? `📦 ${j.cargo} → ${j.to}` : 'Sin carga';
  $('r').textContent = t.routeKm > 0 ? `${c(t.routeKm).toLocaleString(LOC())} ${imperial ? 'mi' : 'km'}` : '—';
  $('e').textContent = fmtMin(t.routeMin);
  $('sc').textContent = j ? `${j.score}/100` : '—';
  $('dm').textContent = j ? `${Math.round((j.damage || 0) * 100)}%` : '—';
  const tm = t.timeAbs || 0; $('ck').textContent = `${String(Math.floor(tm / 60) % 24).padStart(2, '0')}:${String(tm % 60).padStart(2, '0')}`;
  $('rs').textContent = t.restStop > 0 ? fmtMin(t.restStop) : '—';
  $('ea').textContent = `${Math.round(t.todayEarned || 0).toLocaleString(LOC())} ${cur}`;
  const pct = t.fuelCapacity ? t.fuel / t.fuelCapacity : 0;
  $('fl').textContent = `${Math.round(pct * 100)}% · ${c(t.fuelRange || 0)} ${imperial ? 'mi' : 'km'}`;
  $('f').style.width = `${pct * 100}%`;
  $('f').style.background = pct < 0.15 ? '#FF5A5F' : '#19C3B1';
});
K.on('bus', (b) => { bus = b; drawNav(); });
// flecha hacia la próxima parada (en línea recta) y metros que faltan
const tr = (x) => (window.RI18N ? RI18N.tr(x) : x);
function drawNav() {
  const box = $('nav'); const n = bus && bus.nav;
  const show = !!(n && !bus.doors && (!cfg || cfg.widgets.nav !== false));
  if (box.classList.contains('on') !== show) { box.classList.toggle('on', show); resize(); }
  if (!show) return;
  const fmtD = (m) => (imperial ? (m < 300 ? `${Math.round(m * 3.28084 / 10) * 10} ft` : `${(m / 1609.34).toFixed(1)} mi`) : (m < 1000 ? `${Math.max(0, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`));
  if (!n.known) {
    box.className = 'nav on'; $('arw').style.transform = 'rotate(0deg)';
    $('nvi').textContent = tr('Parada sin ubicar'); $('nvd').textContent = '📍';
    $('nvn').textContent = `${n.name} · ${tr('se guardará al abrir las puertas allí')}`; $('nvb').style.display = 'none'; return;
  }
  const a = Math.abs(n.rel), side = n.rel > 0 ? tr('derecha') : tr('izquierda');
  let txt;
  if (n.dist < 35) txt = tr('Has llegado: abre las puertas');
  else if (a <= 22) txt = tr('Sigue recto');
  else if (a <= 70) txt = `${tr('Ligeramente a la')} ${side}`;
  else if (a <= 140) txt = `${tr('Gira a la')} ${side}`;
  else txt = tr('La parada está detrás');
  box.className = `nav on${n.dist < 35 ? ' here' : n.dist < 300 ? ' near' : ''}`;
  $('arw').style.transform = `rotate(${n.dist < 35 ? 0 : n.rel}deg)`;
  $('nvi').textContent = txt;
  $('nvd').textContent = n.dist < 35 ? '🚏' : fmtD(n.dist);
  $('nvn').textContent = `${tr('Próxima parada')}: ${n.name}`;
  $('nvb').style.display = n.dist < 300 && n.dist >= 35 ? 'block' : 'none';
  $('nvbi').style.width = `${Math.round((1 - n.dist / 300) * 100)}%`;
}
K.on('toast', ({ title, body }) => {
  const el = $('t');
  el.textContent = `${title}${body ? ' · ' + body : ''}`;
  el.style.display = 'block'; resize();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; resize(); }, 5000);
});
new ResizeObserver(resize).observe(document.getElementById('box'));
