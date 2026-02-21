/* eslint-disable no-console */
/**
 * ppt-slide-extractor.cjs
 *
 * Electron-native PPTX → PNG slide extractor.
 *
 * Instead of relying on system tools (LibreOffice, poppler), this module
 * opens a hidden BrowserWindow that loads the Dome app at the special
 * /ppt-capture route. That page uses the bundled pptx-preview library to
 * render each slide, then the main process captures a PNG screenshot via
 * webContents.capturePage(). No external dependencies required.
 */

const { BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');

// Internal resolution used by PptViewer and PptCapturePage
const SLIDE_W = 960;
const SLIDE_H = 540;

// How long to wait for the /ppt-capture page to expose window.__pptCapture
const PAGE_READY_TIMEOUT_MS = 15000;

// How long to poll each check interval
const POLL_INTERVAL_MS = 100;

// How long to wait after renderSingleSlide() before capturing (ms).
// Two rAF cycles handle deferred CSS transitions; 250 ms is a safe buffer
// for complex slides with echarts or many shapes.
const RENDER_SETTLE_MS = 250;

// Maximum slides to extract (guard against corrupt files)
const MAX_SLIDES = 200;

/**
 * Returns true when running in development mode (Vite dev server).
 */
function isDev() {
  const distIndex = path.join(__dirname, '../dist/index.html');
  return (
    process.env.NODE_ENV === 'development' ||
    !app.isPackaged ||
    !fs.existsSync(distIndex)
  );
}

/**
 * Build the URL the hidden window should load.
 * Dev  → http://localhost:5173/ppt-capture  (Vite dev server)
 * Prod → app://dome/ppt-capture             (bundled dist via custom protocol)
 */
function buildCaptureUrl() {
  return isDev()
    ? 'http://localhost:5173/ppt-capture'
    : 'app://dome/ppt-capture';
}

/**
 * Wait (polling) until window.__pptCaptureReady === true inside the given
 * BrowserWindow, or throw if the timeout is exceeded.
 */
async function waitForPageReady(win, timeoutMs = PAGE_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (win.isDestroyed()) throw new Error('Capture window was destroyed');
    const ready = await win.webContents.executeJavaScript(
      'typeof window.__pptCapture !== "undefined" && window.__pptCapture !== null && window.__pptCaptureReady === true',
    );
    if (ready) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`PPT capture page not ready after ${timeoutMs} ms`);
}

/**
 * Wait for two animation frames (requestAnimationFrame) inside the hidden
 * window so that pptx-preview's DOM mutations are fully painted before we
 * call capturePage().
 */
async function waitForRender(win) {
  await win.webContents.executeJavaScript(
    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
  );
  // Extra buffer for slow/complex slides
  await new Promise((r) => setTimeout(r, RENDER_SETTLE_MS));
}

/**
 * Extract one PNG image per slide from a PPTX file.
 *
 * Uses a hidden Electron BrowserWindow with the /ppt-capture route to render
 * slides via pptx-preview, then captures each via webContents.capturePage().
 * No LibreOffice, no poppler, no external tools required.
 *
 * @param {string} pptxPath  Absolute path to the .pptx file.
 * @returns {Promise<{ success: boolean; slides?: Array<{ index: number; image_base64: string }>; error?: string }>}
 */
async function extractPptSlideImages(pptxPath) {
  if (!fs.existsSync(pptxPath)) {
    return { success: false, error: 'PPTX file not found' };
  }

  const url = buildCaptureUrl();
  let win = null;

  try {
    // ── Create hidden window ────────────────────────────────────────────────
    win = new BrowserWindow({
      width: SLIDE_W,
      height: SLIDE_H,
      show: false,
      frame: false,
      // Keep it out of the taskbar / dock
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // Disable web security for the local app protocol (same as main window)
        webSecurity: true,
      },
    });

    // Suppress any unhandled console errors from the app's normal init code
    // that doesn't apply to this minimal context.
    win.webContents.on('console-message', (_e, _level, message) => {
      if (process.env.PPT_EXTRACTOR_DEBUG) {
        console.log('[PptExtractor/page]', message);
      }
    });

    await win.loadURL(url);
    await waitForPageReady(win);

    // ── Pass PPTX data to the renderer ─────────────────────────────────────
    const pptxBuffer = fs.readFileSync(pptxPath);
    const pptxBase64 = pptxBuffer.toString('base64');

    // init() loads the PPTX, renders slide 0, and returns the slide count.
    const slideCount = await win.webContents.executeJavaScript(
      `window.__pptCapture.init(${JSON.stringify(pptxBase64)})`,
    );

    if (!slideCount || typeof slideCount !== 'number' || slideCount <= 0) {
      return { success: false, error: 'No slides found in the presentation' };
    }

    const total = Math.min(slideCount, MAX_SLIDES);

    // ── Capture each slide ─────────────────────────────────────────────────
    const slides = [];

    for (let i = 0; i < total; i++) {
      if (win.isDestroyed()) {
        return { success: false, error: 'Capture window was destroyed during extraction' };
      }

      // Slide 0 is already rendered by init(); render subsequent slides.
      if (i > 0) {
        await win.webContents.executeJavaScript(
          `window.__pptCapture.renderSlide(${i})`,
        );
      }

      await waitForRender(win);

      const image = await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: SLIDE_W,
        height: SLIDE_H,
      });

      slides.push({
        index: i,
        image_base64: image.toPNG().toString('base64'),
      });
    }

    return { success: true, slides };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PptExtractor] Error:', msg);
    return { success: false, error: msg };
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }
}

module.exports = { extractPptSlideImages };
