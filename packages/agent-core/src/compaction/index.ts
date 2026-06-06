/**
 * @dome/agent-core — public surface of the compaction subsystem.
 *
 * The runtime loop imports `createDefaultCompaction` from here. Test
 * code can pull in `createTrimmingEngine` + `estimateTokens` directly
 * from `trim.js` to exercise edge cases with custom settings.
 */

export { createTrimmingEngine, estimateTokens } from './trim.js';
export { createDefaultCompaction } from './default.js';
