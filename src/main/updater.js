// Actualizaciones automáticas desde GitHub Releases (electron-updater).
// Solo funciona con la app instalada (no al probarla con 1-PROBAR-RUTERO.bat).
const { app } = require('electron');

function setupUpdater(send, { onReady } = {}) {
  const state = { status: 'idle', version: app.getVersion(), available: null, progress: 0, error: '' };
  const emit = (patch) => { Object.assign(state, patch); send('update', { ...state }); };

  if (!app.isPackaged) {
    return {
      state: () => ({ ...state, status: 'dev' }),
      check: async () => { emit({ status: 'dev' }); return state; },
      download: async () => state,
      install: () => {},
    };
  }

  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) {
    emit({ status: 'error', error: 'Falta el módulo de actualizaciones' });
  }
  if (autoUpdater) {
    autoUpdater.autoDownload = true; // se descarga sola en segundo plano (solo los trozos que cambian)
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: '' }));
    autoUpdater.on('update-available', (i) => emit({ status: 'available', available: { version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '') : '', date: i.releaseDate } }));
    autoUpdater.on('update-not-available', () => emit({ status: 'latest' }));
    autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', progress: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (i) => { emit({ status: 'ready', progress: 100 }); if (onReady) onReady(i && i.version); });
    autoUpdater.on('error', (e) => emit({ status: 'error', error: friendly(e) }));
  }

  return {
    state: () => ({ ...state }),
    check: async () => { if (!autoUpdater) return state; try { await autoUpdater.checkForUpdates(); } catch (e) { emit({ status: 'error', error: friendly(e) }); } return state; },
    download: async () => { if (!autoUpdater) return state; emit({ status: 'downloading', progress: 0 }); try { await autoUpdater.downloadUpdate(); } catch (e) { emit({ status: 'error', error: friendly(e) }); } return state; },
    // silent: se instala sin ventanas y Rutero se vuelve a abrir solo
    install: (silent = false) => { if (autoUpdater) { app.isQuitting = true; autoUpdater.quitAndInstall(!!silent, true); } },
  };
}

function friendly(e) {
  const m = String((e && e.message) || e || '');
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::/i.test(m)) return 'Sin conexión a internet';
  if (/404|latest\.yml/i.test(m)) return 'Todavía no hay ninguna versión publicada';
  return m.split('\n')[0].slice(0, 140);
}

module.exports = { setupUpdater };
