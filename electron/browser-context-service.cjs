/* eslint-disable no-console */
/**
 * macOS: read URL/title from the frontmost browser window (Safari, Chrome family).
 * Uses JXA (osascript -l JavaScript) for maintainability.
 */
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * @returns {Promise<{ success: boolean, url?: string, title?: string, browser?: string, error?: string }>}
 */
async function getActiveBrowserTabMacOS() {
  if (process.platform !== 'darwin') {
    return { success: false, error: 'Solo disponible en macOS.' };
  }

  const jxa = `
(function () {
  function fail(msg) {
    return JSON.stringify({ ok: false, error: String(msg) });
  }
  function ok(payload) {
    return JSON.stringify(Object.assign({ ok: true }, payload));
  }
  try {
    var se = Application('System Events');
    var procs = se.processes.whose({ frontmost: true });
    if (!procs || procs.length === 0) {
      return fail('No frontmost application');
    }
    var frontName = procs[0].name();
    if (frontName === 'Safari') {
      var safari = Application('Safari');
      if (!safari.windows || safari.windows.length === 0) {
        return fail('Safari has no windows');
      }
      var sw = safari.windows[0];
      var tab = sw.currentTab();
      return ok({
        url: tab.url(),
        title: tab.name(),
        browser: 'Safari',
      });
    }
    if (frontName === 'Google Chrome' || frontName === 'Chromium' || frontName === 'Brave Browser' || frontName === 'Microsoft Edge') {
      var chrome = Application(frontName);
      if (!chrome.windows || chrome.windows.length === 0) {
        return fail(frontName + ' has no windows');
      }
      var cw = chrome.windows[0];
      var ct = cw.activeTab();
      return ok({
        url: ct.url(),
        title: ct.title(),
        browser: frontName,
      });
    }
    return fail('Ventana activa no es un navegador compatible: ' + frontName);
  } catch (e) {
    return fail(e && e.message ? e.message : String(e));
  }
})();
`;

  try {
    const { stdout, stderr } = await execFileAsync('osascript', ['-l', 'JavaScript', '-e', jxa], {
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    });
    if (stderr && stderr.trim()) {
      console.warn('[BrowserContext]', stderr.trim());
    }
    const raw = (stdout || '').trim();
    if (!raw) {
      return { success: false, error: 'Empty response from macOS' };
    }
    const parsed = JSON.parse(raw);
    if (!parsed.ok) {
      return { success: false, error: parsed.error || 'Unknown error' };
    }
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : '';
    if (!url) {
      return { success: false, error: 'No URL from browser' };
    }
    return {
      success: true,
      url,
      title: typeof parsed.title === 'string' ? parsed.title.trim() : '',
      browser: typeof parsed.browser === 'string' ? parsed.browser : '',
    };
  } catch (err) {
    console.error('[BrowserContext] osascript failed:', err);
    return { success: false, error: err.message || 'osascript failed' };
  }
}

module.exports = { getActiveBrowserTabMacOS };
