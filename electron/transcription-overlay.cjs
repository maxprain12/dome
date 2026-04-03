/* eslint-disable no-console */
/**
 * Transcripción / dictado: ventana flotante independiente (inferior centrada, alwaysOnTop).
 * Patrón alineado con many-voice-overlay.cjs.
 */
const { screen } = require('electron');

const TRANSCRIPTION_OVERLAY_ID = 'transcription-overlay';

/** Hub de transcripción: más alto que Many por selector de fuente y controles. */
const OVERLAY_WIDTH = 440;
const OVERLAY_HEIGHT = 400;
const BOTTOM_MARGIN = 24;

function layoutOverlayBounds() {
  const display = screen.getPrimaryDisplay();
  const { width, height, x, y } = display.workArea;
  const posX = Math.round(x + (width - OVERLAY_WIDTH) / 2);
  const posY = Math.round(y + height - OVERLAY_HEIGHT - BOTTOM_MARGIN);
  return { x: posX, y: posY, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT };
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 */
function ensureCreated(windowManager) {
  let win = windowManager.get(TRANSCRIPTION_OVERLAY_ID);
  if (win && !win.isDestroyed()) {
    reposition(win);
    return win;
  }

  const bounds = layoutOverlayBounds();

  win = windowManager.create(
    TRANSCRIPTION_OVERLAY_ID,
    {
      deferShow: true,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      minWidth: bounds.width,
      maxWidth: bounds.width,
      minHeight: 280,
      maxHeight: 640,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      title: 'Dome — Transcripción',
      show: false,
      transparent: true,
      titleBarStyle: 'default',
      ...(process.platform === 'darwin' ? { trafficLightPosition: { x: -100, y: -100 } } : {}),
    },
    '/transcription-overlay'
  );

  reposition(win);

  win.webContents.once('did-finish-load', () => {
    try {
      win.webContents.send('transcription:overlay-loaded');
    } catch (e) {
      console.warn('[TranscriptionOverlay] overlay-loaded send failed:', e?.message);
    }
  });

  return win;
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function reposition(win) {
  if (!win || win.isDestroyed()) return;
  win.setBounds(layoutOverlayBounds());
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 */
function showAndFocus(windowManager) {
  const win = ensureCreated(windowManager);
  if (!win || win.isDestroyed()) return;
  reposition(win);
  win.show();
  win.focus();
  try {
    if (process.platform === 'darwin') {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  } catch (e) {
    console.warn('[TranscriptionOverlay] setVisibleOnAllWorkspaces:', e?.message);
  }
}

/**
 * @param {import('./window-manager.cjs')} windowManager
 */
function hide(windowManager) {
  const win = windowManager.get(TRANSCRIPTION_OVERLAY_ID);
  if (win && !win.isDestroyed()) {
    win.hide();
  }
}

module.exports = {
  TRANSCRIPTION_OVERLAY_ID,
  layoutOverlayBounds,
  ensureCreated,
  reposition,
  showAndFocus,
  hide,
};
