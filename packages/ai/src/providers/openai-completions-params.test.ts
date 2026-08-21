import { describe, expect, it } from "vitest";
import type { Context, Model, Tool } from "../types.js";
import { streamOpenAICompletions } from "./openai-completions.js";

function baseModel(overrides: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
	return {
		id: "gpt-4o",
		name: "GPT-4o",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		...overrides,
	};
}

function emptyContext(overrides: Partial<Context> = {}): Context {
	return {
		messages: [{ role: "user", content: "hi", timestamp: 1 }],
		...overrides,
	};
}

const echoTool: Tool = {
	name: "echo",
	description: "Echo",
	parameters: { type: "object", properties: {} },
};

/** Capture ChatCompletion create params via onPayload, aborting before any network call. */
async function captureBuildParams(
	model: Model<"openai-completions">,
	context: Context,
	options: Parameters<typeof streamOpenAICompletions>[2] = {},
): Promise<Record<string, unknown>> {
	let captured: Record<string, unknown> | undefined;
	const stream = streamOpenAICompletions(model, context, {
		apiKey: "sk-test",
		...options,
		onPayload: (params) => {
			captured = params as Record<string, unknown>;
			throw new Error("abort-before-network");
		},
	});
	await stream.result();
	if (!captured) {
		throw new Error("onPayload did not capture params");
	}
	return captured;
}

describe("buildParams (openai-completions request mapping)", () => {
	it("sets stream_options.include_usage and store=false for standard OpenAI compat", async () => {
		const params = await captureBuildParams(baseModel(), emptyContext());

		expect(params.stream).toBe(true);
		expect(params.store).toBe(false);
		expect(params.stream_options).toEqual({ include_usage: true });
		expect(params.model).toBe("gpt-4o");
	});

	it("uses max_completion_tokens by default and max_tokens when compat requests it", async () => {
		const defaultField = await captureBuildParams(baseModel(), emptyContext(), { maxTokens: 128 });
		expect(defaultField.max_completion_tokens).toBe(128);
		expect(defaultField).not.toHaveProperty("max_tokens");

		const legacyField = await captureBuildParams(
			baseModel({
				compat: { maxTokensField: "max_tokens" },
			}),
			emptyContext(),
			{ maxTokens: 64 },
		);
		expect(legacyField.max_tokens).toBe(64);
		expect(legacyField).not.toHaveProperty("max_completion_tokens");
	});

	it("sets prompt_cache_key for api.openai.com when retention is not none", async () => {
		const withCache = await captureBuildParams(baseModel(), emptyContext(), {
			sessionId: "session-abc",
			cacheRetention: "short",
		});
		expect(withCache.prompt_cache_key).toBe("session-abc");
		expect(withCache.prompt_cache_retention).toBeUndefined();

		const none = await captureBuildParams(baseModel(), emptyContext(), {
			sessionId: "session-abc",
			cacheRetention: "none",
		});
		expect(none.prompt_cache_key).toBeUndefined();
	});

	it("sets prompt_cache_retention 24h only for long retention with long-cache support", async () => {
		const longOk = await captureBuildParams(
			baseModel({
				baseUrl: "https://example.com/v1",
				compat: { supportsLongCacheRetention: true },
			}),
			emptyContext(),
			{ sessionId: "sess", cacheRetention: "long" },
		);
		expect(longOk.prompt_cache_key).toBe("sess");
		expect(longOk.prompt_cache_retention).toBe("24h");

		const longUnsupported = await captureBuildParams(
			baseModel({
				baseUrl: "https://example.com/v1",
				compat: { supportsLongCacheRetention: false },
			}),
			emptyContext(),
			{ sessionId: "sess", cacheRetention: "long" },
		);
		expect(longUnsupported.prompt_cache_key).toBeUndefined();
		expect(longUnsupported.prompt_cache_retention).toBeUndefined();
	});

	it("forwards temperature, toolChoice, and converts tools", async () => {
		const params = await captureBuildParams(baseModel(), emptyContext({ tools: [echoTool] }), {
			temperature: 0.2,
			toolChoice: "auto",
		});

		expect(params.temperature).toBe(0.2);
		expect(params.tool_choice).toBe("auto");
		expect(params.tools).toEqual([
			{
				type: "function",
				function: {
					name: "echo",
					description: "Echo",
					parameters: { type: "object", properties: {}, required: [] },
					strict: false,
				},
			},
		]);
	});

	it("sends empty tools array when conversation has tool history but no tools", async () => {
		const params = await captureBuildParams(
			baseModel(),
			emptyContext({
				messages: [
					{
						role: "assistant",
						content: [{ type: "toolCall", id: "c1", name: "echo", arguments: {} }],
						api: "openai-completions",
						provider: "openai",
						model: "gpt-4o",
						usage: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 0,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "toolUse",
						timestamp: 1,
					},
					{
						role: "toolResult",
						toolCallId: "c1",
						toolName: "echo",
						content: [{ type: "text", text: "ok" }],
						isError: false,
						timestamp: 2,
					},
				],
			}),
		);

		expect(params.tools).toEqual([]);
	});
});
