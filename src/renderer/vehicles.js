// Ilustraciones laterales propias de cada vehículo del concesionario.
// vehicleSvg(id, color) devuelve un SVG; el color principal se adapta a la empresa.
(function () {
  const shade = (hex, f) => {
    const n = parseInt(hex.replace('#', ''), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + (f > 0 ? (255 - v) * f : v * f))));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };
  const wheel = (x, y = 150, r = 17) => `<g><circle cx="${x}" cy="${y}" r="${r}" fill="#14161C"/><circle cx="${x}" cy="${y}" r="${r * .55}" fill="#9AA3B5"/><circle cx="${x}" cy="${y}" r="${r * .22}" fill="#4A505E"/></g>`;
  const ground = '<ellipse cx="200" cy="168" rx="190" ry="7" fill="rgba(0,0,0,.35)"/>';
  let uid = 0;
  const wrap = (body, bg) => { const g = `sky${++uid}`; return `<svg viewBox="0 0 400 180" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}" stop-opacity=".35"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></linearGradient></defs>
    <rect width="400" height="180" rx="14" fill="url(#${g})"/>${ground}${body}</svg>`; };

  // cabina de tractora (frontal mirando a la derecha). x = parte trasera de la cabina
  function cab(x, w, h, col, opts = {}) {
    const top = 150 - h;
    const dark = shade(col, -.35), light = shade(col, .25);
    return `<g>
      <rect x="${x}" y="${top}" width="${w}" height="${h - 16}" rx="7" fill="${col}"/>
      <rect x="${x}" y="${top}" width="${w}" height="10" rx="5" fill="${light}"/>
      <path d="M${x + w * .52} ${top + 12} h${w * .42} a6 6 0 0 1 6 6 v${h * .3} h-${w * .48} z" fill="#B9D6F2" opacity=".9"/>
      <rect x="${x + w * .14}" y="${top + 14}" width="${w * .3}" height="${h * .26}" rx="3" fill="#B9D6F2" opacity=".75"/>
      <rect x="${x + w - 7}" y="${150 - 40}" width="9" height="18" rx="2" fill="#FFE9A8"/>
      <rect x="${x + 4}" y="${150 - 30}" width="${w - 8}" height="6" fill="${dark}"/>
      ${opts.roof ? `<path d="M${x + 4} ${top} q${w * .45} -${opts.roof} ${w - 8} 0 z" fill="${light}"/>` : ''}
      <rect x="${x + w * .08}" y="${top + h * .55}" width="10" height="16" rx="2" fill="${dark}"/>
    </g>`;
  }
  const chassis = (x1, x2) => `<rect x="${x1}" y="138" width="${x2 - x1}" height="8" rx="2" fill="#2A2F3A"/>`;

  function tractor(col, axlesRear, cabW, cabH, roof) {
    const cx = 236;
    return `${chassis(150, cx + cabW)}${cab(cx, cabW, cabH, col, { roof })}
      <rect x="160" y="128" width="60" height="9" rx="2" fill="#3B4252"/>
      ${wheel(cx + cabW - 26)}${axlesRear.map((x) => wheel(x)).join('')}`;
  }
  function trailer(kind, col) {
    const x = 16, w = 214;
    const box = (fill, h = 82) => `<rect x="${x}" y="${132 - h}" width="${w}" height="${h}" rx="5" fill="${fill}"/>`;
    let body = '';
    if (kind === 'curtain') body = box(shade(col, .55)) + [...Array(9)].map((_, i) => `<line x1="${x + 12 + i * 23}" y1="56" x2="${x + 12 + i * 23}" y2="126" stroke="${shade(col, .2)}" stroke-width="2"/>`).join('');
    if (kind === 'reefer') body = box('#F2F5FA') + `<rect x="${x + w - 26}" y="54" width="22" height="34" rx="3" fill="#C7CED9"/><rect x="${x + 10}" y="60" width="150" height="14" rx="3" fill="${col}"/>`;
    if (kind === 'flatbed') body = `<rect x="${x}" y="122" width="${w}" height="10" rx="2" fill="${col}"/><rect x="${x + 30}" y="84" width="70" height="38" fill="#8B6A43"/><rect x="${x + 112}" y="96" width="80" height="26" fill="#7A5C39"/>`;
    if (kind === 'tanker') body = `<rect x="${x}" y="64" width="${w}" height="62" rx="31" fill="#D9DEE6"/><rect x="${x}" y="88" width="${w}" height="10" fill="${col}"/><rect x="${x + 90}" y="56" width="30" height="10" rx="3" fill="#AEB6C2"/>`;
    if (kind === 'lowboy') return `<path d="M${x} 128 h150 l20 -20 h40 v24 h-210 z" fill="${col}"/><rect x="${x + 22}" y="78" width="110" height="50" rx="6" fill="#E5B22D"/><rect x="${x + 30}" y="60" width="50" height="22" fill="#C9961A"/>${wheel(36)}${wheel(72)}${wheel(108)}`;
    if (kind === 'carrier') return `<rect x="${x}" y="122" width="${w}" height="8" fill="${col}"/><rect x="${x}" y="84" width="${w}" height="6" fill="${col}"/>
      ${[0, 1, 2].map((i) => `<rect x="${x + 10 + i * 68}" y="100" width="58" height="20" rx="8" fill="${['#E74C3C', '#ECF0F1', '#3498DB'][i]}"/><rect x="${x + 10 + i * 68}" y="62" width="58" height="20" rx="8" fill="${['#F1C40F', '#2C3E50', '#95A5A6'][i]}"/>`).join('')}
      ${wheel(48)}${wheel(84)}${wheel(120)}`;
    return `${body}${chassis(x + 10, x + w - 10)}${wheel(48)}${wheel(84)}${wheel(120)}`;
  }

  function bus(col, len, opts = {}) {
    const x = 200 - len / 2, top = opts.double ? 22 : 54, h = 150 - top - 6;
    const light = shade(col, .3), dark = shade(col, -.35);
    const winRow = (y, hh) => { let w = ''; for (let wx = x + 14; wx < x + len - 50; wx += 30) w += `<rect x="${wx}" y="${y}" width="25" height="${hh}" rx="3" fill="#B9D6F2" opacity=".9"/>`; return w; };
    const wheels = opts.artic ? [x + 40, x + len * .5 - 10, x + len - 50] : [x + 42, x + len - 52];
    return `<rect x="${x}" y="${top}" width="${len}" height="${h}" rx="12" fill="${col}"/>
      <rect x="${x}" y="${top}" width="${len}" height="8" rx="6" fill="${light}"/>
      ${winRow(top + 14, opts.coach ? 30 : 34)}
      ${opts.double ? winRow(top + 60, 30) : ''}
      <path d="M${x + len - 44} ${top + 12} h34 a8 8 0 0 1 8 8 v${opts.double ? 90 : 46} h-42 z" fill="#B9D6F2"/>
      ${opts.coach ? '' : `<rect x="${x + len - 42}" y="${top + h - 70}" width="22" height="62" rx="2" fill="${dark}" opacity=".7"/><rect x="${x + len * .45}" y="${top + h - 70}" width="22" height="62" rx="2" fill="${dark}" opacity=".7"/>`}
      ${opts.artic ? `<rect x="${x + len * .62}" y="${top}" width="12" height="${h}" fill="#2A2F3A"/>` : ''}
      ${opts.coach ? `<rect x="${x + 20}" y="${150 - 36}" width="${len - 90}" height="20" rx="3" fill="${dark}" opacity=".55"/>` : ''}
      <rect x="${x}" y="${150 - 22}" width="${len}" height="8" fill="${dark}"/>
      <rect x="${x + len - 8}" y="${150 - 34}" width="8" height="12" rx="2" fill="#FFE9A8"/>
      <rect x="${x + 16}" y="${top + 4}" width="60" height="0" />
      ${wheels.map((wx) => wheel(wx, 150, 16)).join('')}`;
  }

  // garaje (pequeño) o sede (grande): nave con persianas, una abierta con un camión dentro, oficina y cartel con el color de la empresa
  function building(col, big) {
    const id = `bd${++uid}`;
    const w = big ? 340 : 270, x = 200 - w / 2, top = big ? 20 : 46, base = 158;
    const doors = big ? 3 : 2, dw = big ? 70 : 76, dh = big ? 64 : 70, gap = 12;
    const doorX = (i) => x + 16 + i * (dw + gap);
    const offX = doorX(doors) + 4, offW = x + w - 14 - offX;
    const door = (i) => {
      const dx = doorX(i), dy = base - dh, open = i === doors - 1;
      const shut = open ? dh * .42 : dh;
      return `<rect x="${dx - 4}" y="${dy - 4}" width="${dw + 8}" height="${dh + 4}" rx="2" fill="#7D8597"/>
        ${open ? `<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="#151922"/>
          <g transform="translate(${dx + dw / 2} ${base})"><rect x="-24" y="-40" width="48" height="36" rx="4" fill="${col}"/><rect x="-20" y="-36" width="40" height="13" rx="2" fill="#9CC4EA" opacity=".85"/>
          <rect x="-15" y="-19" width="30" height="9" rx="1.5" fill="#2A2F3A"/><rect x="-22" y="-12" width="8" height="4" rx="1" fill="#FFE9A8"/><rect x="14" y="-12" width="8" height="4" rx="1" fill="#FFE9A8"/>
          <rect x="-25" y="-5" width="50" height="5" rx="1.5" fill="#3B4252"/></g>` : ''}
        <rect x="${dx}" y="${dy}" width="${dw}" height="${shut}" fill="url(#${id}d)"/>
        ${[...Array(Math.floor(shut / 6))].map((_, j) => `<line x1="${dx}" y1="${dy + 6 + j * 6}" x2="${dx + dw}" y2="${dy + 6 + j * 6}" stroke="rgba(0,0,0,.22)" stroke-width="1"/>`).join('')}
        <rect x="${dx}" y="${dy + shut - 3}" width="${dw}" height="3" fill="#3B4252"/>
        <rect x="${dx + dw / 2 - 7}" y="${dy - 12}" width="14" height="4" rx="2" fill="#2A2F3A"/><path d="M${dx + dw / 2 - 6} ${dy - 8} L${dx + dw / 2 + 6} ${dy - 8} L${dx + dw / 2 + 22} ${dy + 26} L${dx + dw / 2 - 22} ${dy + 26}Z" fill="#FFE9A8" opacity=".13"/>
        <line x1="${dx - 2}" y1="${base + 3}" x2="${dx - 12}" y2="${base + 18}" stroke="rgba(255,255,255,.5)" stroke-width="2"/>`;
    };
    return `<defs><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6EAF1"/><stop offset="1" stop-color="#C3CAD6"/></linearGradient>
        <linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AA3B5"/><stop offset="1" stop-color="#6E778A"/></linearGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BFE0FA"/><stop offset="1" stop-color="#6E9CC8"/></linearGradient></defs>
      <rect x="0" y="${base}" width="400" height="22" fill="#2C313C"/><rect x="0" y="${base}" width="400" height="2" fill="#4A5160"/>
      ${big ? `<line x1="${x + w - 6}" y1="${top - 8}" x2="${x + w - 6}" y2="3" stroke="#AEB6C4" stroke-width="2"/><path d="M${x + w - 6} 4 l24 6 l-24 6z" fill="${col}"/>` : ''}
      <rect x="${x - 6}" y="${top - 8}" width="${w + 12}" height="10" rx="2" fill="#5D6576"/>
      <rect x="${x}" y="${top}" width="${w}" height="${base - top}" fill="url(#${id}w)"/>
      <rect x="${x}" y="${top + 2}" width="${w}" height="6" fill="${col}"/>
      ${big ? `<rect x="${x + 14}" y="${top + 34}" width="${w - 28}" height="24" rx="2" fill="url(#${id}g)"/>${[...Array(9)].map((_, i) => `<rect x="${x + 14 + (i + 1) * (w - 28) / 10 - 1}" y="${top + 34}" width="2" height="24" fill="#8A93A6"/>`).join('')}` : ''}
      <rect x="${200 - (big ? 60 : 46)}" y="${top + 14}" width="${big ? 120 : 92}" height="${big ? 20 : 18}" rx="3" fill="${col}"/>
      <text x="200" y="${top + (big ? 28 : 27)}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="${big ? 13 : 11}" letter-spacing="2" fill="#fff">${big ? 'SEDE' : 'GARAJE'}</text>
      ${[...Array(doors)].map((_, i) => door(i)).join('')}
      <rect x="${offX}" y="${base - 66}" width="${offW}" height="34" rx="2" fill="url(#${id}g)"/><rect x="${offX + offW / 2 - 1}" y="${base - 66}" width="2" height="34" fill="#8A93A6"/>
      <rect x="${offX + offW / 2 - 11}" y="${base - 28}" width="22" height="28" rx="1.5" fill="#3B4252"/><rect x="${offX + offW / 2 - 8}" y="${base - 25}" width="16" height="12" fill="url(#${id}g)" opacity=".8"/>
      <circle cx="${offX + offW / 2 + 6}" cy="${base - 12}" r="1.3" fill="#D5DBE5"/>`;
  }

  const ART = {
    urban: (c) => `${chassis(70, 330)}<rect x="60" y="56" width="190" height="80" rx="5" fill="${shade(c, .6)}"/><rect x="60" y="70" width="190" height="14" fill="${c}"/>${cab(252, 76, 92, c)}${wheel(108)}${wheel(306)}`,
    t4x2: (c) => `<g transform="translate(-70 0)">${tractor(c, [196], 84, 98, 0)}</g>`,
    t4x2long: (c) => `<g transform="translate(-70 0)">${tractor(c, [196], 90, 116, 16)}</g>`,
    t6x2: (c) => `<g transform="translate(-70 0)">${tractor(c, [172, 206], 94, 124, 22)}</g>`,
    t6x4: (c) => `<g transform="translate(-70 0)">${tractor(c, [168, 204], 96, 112, 10)}</g>`,
    t8x4: (c) => `<g transform="translate(-30 0)">`+`${chassis(110, 340)}${cab(246, 92, 116, c, { roof: 12 })}<rect x="118" y="124" width="110" height="12" fill="#3B4252"/>${wheel(130)}${wheel(166)}${wheel(202)}${wheel(310)}</g>`,
    curtain: (c) => trailer('curtain', c), reefer: (c) => trailer('reefer', c), flatbed: (c) => trailer('flatbed', c),
    tanker: (c) => trailer('tanker', c), lowboy: (c) => trailer('lowboy', c), carrier: (c) => trailer('carrier', c),
    minibus: (c) => bus(c, 190), citybus: (c) => bus(c, 300), artic: (c) => bus(c, 370, { artic: true }),
    double: (c) => bus(c, 300, { double: true }), coach: (c) => bus(c, 320, { coach: true }),
    garage: (c) => building(c, false), hq: (c) => building(c, true),
  };
  // los remolques se muestran enganchados a una tractora genérica gris
  const withTractor = (id, c) => `${ART[id](c)}${cab(256, 80, 100, '#5D6576')}${wheel(306)}${wheel(272)}`;
  window.vehicleSvg = (id, color = '#4C8DFF') => {
    if (!ART[id]) id = 't4x2';
    const isTrailer = ['curtain', 'reefer', 'flatbed', 'tanker', 'lowboy', 'carrier'].includes(id);
    return wrap(isTrailer ? withTractor(id, color) : ART[id](color), color);
  };
})();
