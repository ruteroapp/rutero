// Detecta una tecla del juego (por defecto U = puertas del autobús) sin bloquearla:
// solo mira si está pulsada (GetAsyncKeyState) y solo cuenta si la ventana activa es ETS2 o ATS.
let api = null;
function load() {
  if (api !== null) return api;
  api = false;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const u32 = koffi.load('user32.dll');
    api = {
      key: u32.func('short __stdcall GetAsyncKeyState(int vKey)'),
      fg: u32.func('void* __stdcall GetForegroundWindow()'),
      title: u32.func('int __stdcall GetWindowTextW(void* hWnd, _Out_ uint16_t* lpString, int nMaxCount)'),
    };
  } catch (e) { console.warn('teclas', e.message); api = false; }
  return api;
}
const VK = (k) => { k = String(k || 'U').toUpperCase(); if (/^[A-Z0-9]$/.test(k)) return k.charCodeAt(0); const map = { SPACE: 0x20, ENTER: 0x0D, F1: 0x70, F2: 0x71, F3: 0x72, F4: 0x73, F5: 0x74, F6: 0x75, F7: 0x76, F8: 0x77, F9: 0x78, F10: 0x79, F11: 0x7A, F12: 0x7B }; return map[k] || 0x55; };
// «SHIFT+F1», «CTRL+F2»…: la tecla y el modificador pulsados a la vez
const MOD = { SHIFT: 0x10, CTRL: 0x11, ALT: 0x12 };
function isDown(a, combo) {
  const parts = String(combo).toUpperCase().split('+');
  const key = parts.pop();
  return (a.key(VK(key)) & 0x8000) !== 0 && parts.every((m) => MOD[m] && (a.key(MOD[m]) & 0x8000) !== 0);
}
function gameFocused(a) {
  try {
    const h = a.fg(); if (!h) return false;
    const buf = new Uint16Array(256); const n = a.title(h, buf, 256);
    return /truck simulator/i.test(String.fromCharCode(...buf.slice(0, Math.max(0, n))));
  } catch { return false; }
}
// llama a onPress cada vez que se pulsa la tecla con el juego delante
function watchKey(getKey, isActive, onPress) {
  const a = load(); if (!a) return () => {};
  let down = false;
  const t = setInterval(() => {
    if (!isActive()) { down = false; return; }
    const pressed = (a.key(VK(getKey())) & 0x8000) !== 0;
    if (pressed && !down && gameFocused(a)) onPress();
    down = pressed;
  }, 60);
  return () => clearInterval(t);
}
// varias teclas a la vez: onPress(nombre) con el juego delante
function watchKeys(getKeys, isActive, onPress) {
  const a = load(); if (!a) return () => {};
  const down = {};
  const t = setInterval(() => {
    if (!isActive()) return;
    let focused = null;
    for (const k of getKeys()) {
      const pressed = isDown(a, k);
      if (pressed && !down[k]) { if (focused === null) focused = gameFocused(a); if (focused) onPress(k); }
      down[k] = pressed;
    }
  }, 60);
  return () => clearInterval(t);
}
module.exports = { watchKey, watchKeys };
