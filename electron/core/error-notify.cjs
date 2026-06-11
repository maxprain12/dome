/* eslint-disable no-console */
/**
 * User-visible error notifications (docs/auditoria/06-calidad-observabilidad/T03).
 *
 * Single funnel for main-process failures the user should know about: logs the
 * full detail via the structured logger AND broadcasts a compact, renderer-safe
 * payload on `system:error-notification` (shown as a toast by
 * app/components/shell/SystemErrorNotifier.tsx).
 *
 * Throttled per scope so a broken automation firing every minute produces one
 * toast per window, not fifty.
 */

const logger = require('./logger.cjs');

const THROTTLE_MS = 60 * 1000;

/** scope → last broadcast timestamp */
const lastNotifiedByScope = new Map();

let _windowManager = null;

function init(windowManager) {
  _windowManager = windowManager;
}

/**
 * Map raw error text to a stable code the renderer can translate with
 * cause + action. Keep coarse — detail goes to the log, not the toast.
 */
function classifyError(message) {
  const text = String(message || '').toLowerCase();
  if (/(invalid[ _]?api[ _-]?key|incorrect api key|unauthorized|401|authentication)/.test(text)) {
    return 'invalid_api_key';
  }
  if (/(rate.?limit|429|quota|insufficient_quota)/.test(text)) return 'rate_limit';
  if (/(model.*(not found|does not exist)|404.*model)/.test(text)) return 'model_not_found';
  if (/(econnrefused|enotfound|etimedout|fetch failed|network|socket hang up)/.test(text)) {
    return 'network';
  }
  if (/(context.*(length|window)|too many tokens|maximum.*tokens)/.test(text)) {
    return 'context_overflow';
  }
  return 'unknown';
}

/**
 * @param {object} opts
 * @param {'error'|'warning'} [opts.severity]
 * @param {string} opts.scope    — 'runs' | 'automations' | 'ai' | 'indexing' | 'sync' | …
 * @param {string} opts.message  — short, raw error message (renderer maps code → i18n)
 * @param {string} [opts.detail] — technical detail (logged, shown in expandible)
 * @param {string} [opts.runId]
 * @param {string} [opts.title]  — context label (run/automation title)
 */
function notifyError({ severity = 'error', scope, message, detail, runId, title }) {
  const code = classifyError(message);
  const log = severity === 'warning' ? logger.warn : logger.error;
  log(scope || 'app', message || 'Unknown error', { detail, runId, title, code });

  if (!_windowManager) return;

  const now = Date.now();
  const last = lastNotifiedByScope.get(scope) ?? 0;
  if (now - last < THROTTLE_MS) return;
  lastNotifiedByScope.set(scope, now);

  try {
    _windowManager.broadcast('system:error-notification', {
      severity,
      scope,
      code,
      message: String(message || '').slice(0, 500),
      detail: detail ? String(detail).slice(0, 1000) : undefined,
      runId,
      title,
      ts: now,
    });
  } catch (err) {
    console.error('[error-notify] broadcast failed:', err?.message);
  }
}

/** Test hook. */
function _resetThrottle() {
  lastNotifiedByScope.clear();
}

module.exports = { init, notifyError, classifyError, _resetThrottle };
