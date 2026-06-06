'use strict';

const path = require('node:path');
const os = require('node:os');

/** Default filesystem permissions for the deepagents harness (conservative). */
const DEFAULT_HARNESS_PERMISSIONS = [
  { operations: ['read', 'write', 'edit'], paths: ['/memories/**'] },
  { operations: ['read'], paths: ['/**'] },
  { operations: ['write', 'edit'], paths: ['/**'], mode: 'deny' },
];

/**
 * Resolve whether LocalShellBackend should be enabled.
 */
function harnessShellEnabled() {
  const v = String(process.env.DOME_HARNESS_SHELL ?? '').toLowerCase().trim();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Build the deepagents backend factory (State + persistent /memories/ in store).
 *
 * @param {import('@langchain/langgraph').BaseStore | null | undefined} store
 * @returns {(config: { state: unknown; store?: import('@langchain/langgraph').BaseStore }) => Promise<import('deepagents').AnyBackendProtocol>}
 */
function createDomeHarnessBackendFactory(store) {
  return async (config) => {
    const { CompositeBackend, StateBackend, StoreBackend } = await import('deepagents');
    const stateBackend = new StateBackend(config);
    const routes = {
      '/memories/': new StoreBackend({ ...config, store: config.store ?? store }),
    };

    if (harnessShellEnabled()) {
      try {
        const { LocalShellBackend } = await import('deepagents');
        const domeRoot = path.join(os.homedir(), '.dome', 'harness-workspace');
        routes['/workspace/'] = new LocalShellBackend({
          rootDir: domeRoot,
          virtualMode: true,
        });
      } catch (e) {
        console.warn('[Harness] LocalShellBackend not loaded:', e?.message || e);
      }
    }

    return new CompositeBackend(stateBackend, routes);
  };
}

module.exports = {
  DEFAULT_HARNESS_PERMISSIONS,
  harnessShellEnabled,
  createDomeHarnessBackendFactory,
};
