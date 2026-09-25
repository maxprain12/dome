'use strict';

/**
 * OS media permissions (microphone, screen recording).
 *
 * macOS gates both behind TCC. Microphone has a native prompt
 * (`askForMediaAccess`); Screen Recording does not — the first
 * `desktopCapturer.getSources` call registers Dome in the list, and once denied
 * the only way back is System Settings. Other platforms manage this outside the
 * app, so every status reports `granted`.
 */

const MEDIA_PERMISSION_KINDS = Object.freeze(['microphone', 'screen']);

const SETTINGS_URLS = Object.freeze({
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
});

const KNOWN_STATUSES = new Set(['granted', 'denied', 'not-determined', 'restricted']);

function isMediaPermissionKind(kind) {
  return MEDIA_PERMISSION_KINDS.includes(kind);
}

function normalizeStatus(raw) {
  return KNOWN_STATUSES.has(raw) ? raw : 'unknown';
}

function createMediaPermissions({ platform = process.platform, systemPreferences, desktopCapturer, shell }) {
  const managedByApp = platform === 'darwin';

  function statusOf(kind) {
    if (!managedByApp) return 'granted';
    try {
      return normalizeStatus(systemPreferences.getMediaAccessStatus(kind));
    } catch {
      return 'unknown';
    }
  }

  function getStatus() {
    return {
      managedByApp,
      microphone: statusOf('microphone'),
      screen: statusOf('screen'),
    };
  }

  async function openSystemSettings(kind) {
    if (!managedByApp || !isMediaPermissionKind(kind)) return false;
    await shell.openExternal(SETTINGS_URLS[kind]);
    return true;
  }

  async function probeScreenCapture() {
    try {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    } catch {
      /* denied: status below reflects it */
    }
  }

  /**
   * Ask for `kind`. Falls back to System Settings when the OS will not show a
   * prompt anymore (denied / restricted, or Screen Recording still missing).
   * @returns {Promise<{ status: string, openedSettings: boolean }>}
   */
  async function request(kind) {
    if (!isMediaPermissionKind(kind)) throw new Error('invalid_permission_kind');
    if (!managedByApp) return { status: 'granted', openedSettings: false };

    const before = statusOf(kind);
    if (before === 'granted') return { status: before, openedSettings: false };

    if (before === 'not-determined') {
      if (kind === 'microphone') await systemPreferences.askForMediaAccess('microphone');
      else await probeScreenCapture();
    }

    const after = statusOf(kind);
    if (after === 'granted') return { status: after, openedSettings: false };
    // Microphone keeps a pending prompt answer as not-determined only if the user dismissed it.
    if (kind === 'microphone' && after === 'not-determined') return { status: after, openedSettings: false };
    const openedSettings = await openSystemSettings(kind);
    return { status: after, openedSettings };
  }

  return { getStatus, request, openSystemSettings };
}

module.exports = {
  MEDIA_PERMISSION_KINDS,
  SETTINGS_URLS,
  isMediaPermissionKind,
  createMediaPermissions,
};
