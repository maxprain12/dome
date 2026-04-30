/* eslint-disable no-console */
const hubTrayState = require('./hub-tray-state.cjs');
const transcriptionMainHub = require('./transcription-main-hub.cjs');

/**
 * @param {import('./window-manager.cjs')} windowManager
 * @param {Object} opts
 * @param {() => void} opts.openMainWindow
 * @param {() => void} opts.quitApp
 */
function sendTrayAction(windowManager, action) {
  transcriptionMainHub.sendTrayActionToMain(windowManager, action);
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 * @param {{ openMainWindow: () => void, quitApp: () => void }} opts
 * @returns {import('electron').MenuItemConstructorOptions[]}
 */
function buildTranscriptionTrayTemplate(windowManager, opts) {
  const hub = hubTrayState.get();
  const busy =
    hub.hubVisible && (hub.phase === 'recording' || hub.phase === 'paused');
  const processing = hub.hubVisible && hub.phase === 'processing';
  const mm = Math.floor((hub.seconds || 0) / 60);
  const ss = String((hub.seconds || 0) % 60).padStart(2, '0');
  const timeStr = `${mm}:${ss}`;

  const modeLabel =
    hub.mode === 'call' ? 'Reunión' : hub.mode === 'streaming' ? 'En vivo' : 'Dictado';

  const stopLabel =
    hub.mode === 'call'
      ? 'Detener y guardar nota'
      : hub.mode === 'streaming'
        ? 'Detener transcripción en vivo'
        : 'Parar y transcribir';

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const hubSection = [];

  if (processing) {
    hubSection.push({
      label: `Transcribiendo… ${timeStr}`,
      enabled: false,
    });
  } else if (busy) {
    hubSection.push({
      label: `${modeLabel} · ${timeStr}`,
      enabled: false,
    });
    hubSection.push({
      label: stopLabel,
      click: () => sendTrayAction(windowManager, 'stop'),
    });
    if (hub.canPause) {
      hubSection.push({
        label: hub.phase === 'paused' ? 'Reanudar grabación' : 'Pausar grabación',
        click: () => sendTrayAction(windowManager, 'pause-resume'),
      });
    }
    hubSection.push({
      label: 'Cancelar grabación',
      click: () => sendTrayAction(windowManager, 'cancel'),
    });
  } else {
    hubSection.push({
      label: 'Mostrar hub de transcripción',
      click: () => {
        try {
          transcriptionMainHub.focusMainExpandHubDock(windowManager);
        } catch (e) {
          console.warn('[TranscriptionTray] show hub:', e?.message);
        }
      },
    });
  }

  return [
    {
      label: 'Abrir Dome',
      click: opts.openMainWindow,
    },
    { type: 'separator' },
    ...hubSection,
    { type: 'separator' },
    {
      label: 'Grabar / dictado',
      click: () => {
        try {
          transcriptionMainHub.sendToggleRecordingToMain(windowManager);
        } catch (e) {
          console.warn('[TranscriptionTray] toggle recording:', e?.message);
          opts.openMainWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Automatizaciones activas',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Salir de Dome',
      click: opts.quitApp,
    },
  ];
}

/**
 * @param {import('electron').Tray | null} appTray
 * @param {import('./window-manager.cjs')} windowManager
 * @param {{ openMainWindow: () => void, quitApp: () => void }} opts
 */
function applyTrayMenuAndTooltip(appTray, windowManager, opts) {
  if (!appTray || appTray.isDestroyed()) return;
  const { Menu } = require('electron');
  const template = buildTranscriptionTrayTemplate(windowManager, opts);
  appTray.setContextMenu(Menu.buildFromTemplate(template));

  const hub = hubTrayState.get();
  const busy =
    hub.hubVisible && (hub.phase === 'recording' || hub.phase === 'paused');
  const processing = hub.hubVisible && hub.phase === 'processing';
  const mm = Math.floor((hub.seconds || 0) / 60);
  const ss = String((hub.seconds || 0) % 60).padStart(2, '0');
  const modeShort =
    hub.mode === 'call' ? 'Reunión' : hub.mode === 'streaming' ? 'En vivo' : 'Dictado';

  if (processing) {
    appTray.setToolTip(`Dome · Transcribiendo ${mm}:${ss}`);
  } else if (busy) {
    appTray.setToolTip(`Dome · ${modeShort} ${mm}:${ss}`);
  } else {
    appTray.setToolTip('Dome');
  }
}

module.exports = {
  buildTranscriptionTrayTemplate,
  sendTrayAction,
  applyTrayMenuAndTooltip,
};
