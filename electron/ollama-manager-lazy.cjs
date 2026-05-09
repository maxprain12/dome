/**
 * Deferred load of `./ollama-manager.cjs` so startup does not pull the module until IPC/window hooks need it.
 * `electron-ollama` itself is only required inside `OllamaManager.ensureInitialized()`.
 */

let singleton = null;

function getOllamaManager() {
  if (!singleton) {
    singleton = require('./ollama-manager.cjs');
  }
  return singleton;
}

async function cleanupOllamaManagerIfLoaded() {
  if (!singleton) return;
  try {
    await singleton.cleanup();
  } catch {
    // best-effort on quit
  }
}

module.exports = { getOllamaManager, cleanupOllamaManagerIfLoaded };
