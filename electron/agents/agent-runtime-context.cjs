'use strict';

/**
 * Typed runtime context for the agent runtime tool execution (Many / runs / IPC).
 * Strips unknown keys and normalizes shapes at the trust boundary.
 */

const { z } = require('zod');

const DomeRuntimeContextSchema = z
  .object({
    activeResourceId: z
      .string()
      .min(1)
      .max(200)
      .nullable()
      .optional(),
    pinnedResourceIds: z.array(z.string().min(1).max(200)).optional().default([]),
  })
  .strip();

/**
 * @param {unknown} raw
 * @returns {{ activeResourceId: string | null; pinnedResourceIds: string[] } | null}
 */
function parseRuntimeContext(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  try {
    const parsed = DomeRuntimeContextSchema.parse(raw);
    const active = parsed.activeResourceId ?? null;
    const pins = Array.isArray(parsed.pinnedResourceIds) ? [...new Set(parsed.pinnedResourceIds)] : [];
    if (!active && pins.length === 0) return null;
    return { activeResourceId: active, pinnedResourceIds: pins };
  } catch (e) {
    console.warn('[AgentRuntimeContext] invalid runtimeContext dropped:', e?.message || e);
    return null;
  }
}

module.exports = { parseRuntimeContext, DomeRuntimeContextSchema };
