/**
 * Provider-native web search / fetch (server-side tools).
 * When active, Dome's HTTP `web_search` / `web_fetch` client tools are stripped
 * from the LLM context and replaced with each provider's built-in implementation.
 */

import type { Api, Model, NativeWebActivation, Tool } from "./types.js";

export const WEB_CLIENT_TOOL_NAMES = ["web_search", "web_fetch"] as const;
export type WebClientToolName = (typeof WEB_CLIENT_TOOL_NAMES)[number];

export interface NativeWebSupport {
	search: boolean;
	fetch: boolean;
}

/** Which native web capabilities a provider/model supports (before tool-list check). */
export function resolveNativeWebSupport(model: Pick<Model<Api>, "api" | "provider" | "id">): NativeWebSupport {
	const api = model.api;
	const provider = String(model.provider || "").toLowerCase();
	const id = String(model.id || "").toLowerCase();

	if (api === "anthropic-messages") {
		// Anthropic server tools (not available on all proxies / Bedrock).
		// MiniMax exposes the Anthropic-compatible API but does NOT implement
		// web_search_20250305 / web_fetch_20250910 — sending them triggers
		// error 2013 ("function name or parameters is empty"). Keep HTTP client tools.
		if (provider === "anthropic") {
			return { search: true, fetch: true };
		}
		return { search: false, fetch: false };
	}

	if (api === "google-generative-ai" || api === "google-vertex") {
		if (/^gemini(-live)?-[23]/.test(id) || id.startsWith("gemini-2.") || id.startsWith("gemini-3")) {
			return { search: true, fetch: false };
		}
		return { search: false, fetch: false };
	}

	if (api === "openai-responses") {
		if (/gpt-[45]|gpt-4o|o[134]|codex/i.test(id)) {
			return { search: true, fetch: false };
		}
		if (provider === "github-copilot" || provider === "azure-openai-responses") {
			return { search: true, fetch: false };
		}
		return { search: false, fetch: false };
	}

	return { search: false, fetch: false };
}

export function toolNamesIncludeWeb(tools: Tool[] | undefined): { search: boolean; fetch: boolean } {
	const names = new Set((tools ?? []).map((t) => t.name));
	return {
		search: names.has("web_search"),
		fetch: names.has("web_fetch"),
	};
}

/** Resolve which native web tools to enable for this request. */
export function resolveNativeWebActivation(
	model: Pick<Model<Api>, "api" | "provider" | "id">,
	tools: Tool[] | undefined,
): NativeWebActivation {
	const support = resolveNativeWebSupport(model);
	const requested = toolNamesIncludeWeb(tools);
	return {
		search: support.search && requested.search,
		fetch: support.fetch && requested.fetch,
	};
}

export function filterClientWebTools(tools: Tool[] | undefined, activation: NativeWebActivation): Tool[] | undefined {
	if (!tools?.length) return tools;
	if (!activation.search && !activation.fetch) return tools;
	const drop = new Set<string>();
	if (activation.search) drop.add("web_search");
	if (activation.fetch) drop.add("web_fetch");
	return tools.filter((t) => !drop.has(t.name));
}

/** Anthropic Messages API server tool entries. */
export function buildAnthropicServerWebTools(
	activation: NativeWebActivation,
	opts?: { maxSearchUses?: number; maxFetchUses?: number },
): Record<string, unknown>[] {
	const serverTools: Record<string, unknown>[] = [];
	if (activation.search) {
		serverTools.push({
			type: "web_search_20250305",
			name: "web_search",
			max_uses: opts?.maxSearchUses ?? 5,
		});
	}
	if (activation.fetch) {
		serverTools.push({
			type: "web_fetch_20250910",
			name: "web_fetch",
			max_uses: opts?.maxFetchUses ?? 10,
		});
	}
	return serverTools;
}

/** Beta headers required for Anthropic native web fetch. */
export function anthropicNativeWebBetaHeaders(activation: NativeWebActivation): string[] {
	const betas: string[] = [];
	if (activation.fetch) {
		betas.push("web-fetch-2025-09-10");
	}
	return betas;
}

/** OpenAI Responses API hosted web search tool. */
export function buildOpenAIResponsesWebSearchTool(): { type: "web_search" } {
	return { type: "web_search" };
}

/** Google GenAI google_search grounding tool. */
export function buildGoogleSearchTool(): { googleSearch: Record<string, never> } {
	return { googleSearch: {} };
}
