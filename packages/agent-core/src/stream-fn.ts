import { streamSimple } from "@dome/ai";
import type { StreamFn } from "./types.js";

let defaultStreamFn: StreamFn | undefined;

/**
 * Configure the fallback used by Agent and low-level loops when callers omit streamFn.
 *
 * Hosts that provide a default model runtime can install its stream function here
 * without making pi-agent-core depend on a provider catalog or compatibility layer.
 */
export function setDefaultStreamFn(streamFn: StreamFn | undefined): void {
	defaultStreamFn = streamFn;
}

/** Dome falls back to the shared `streamSimple` when no default was installed (pi throws here). */
export function getDefaultStreamFn(): StreamFn {
	return defaultStreamFn ?? (streamSimple as unknown as StreamFn);
}
