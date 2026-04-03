import manifest from './realtime-tools-manifest.json';

/** OpenAI Realtime session tool definitions — kept in sync with `electron/ipc/realtime.cjs` executors. */
export const REALTIME_TOOLS = manifest as unknown as Record<string, unknown>[];
