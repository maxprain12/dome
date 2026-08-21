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

describe("applyReasoningParams (openai-completions thinkingFormat mapping)", () => {
	function reasoningModel(
		overrides: Partial<Model<"openai-completions">> = {},
	): Model<"openai-completions"> {
		return baseModel({
			reasoning: true,
			thinkingLevelMap: { off: "none", low: "low", medium: "medium", high: "high" },
			...overrides,
		});
	}

	it("sets enable_thinking for zai/qwen formats", async () => {
		const zaiOn = await captureBuildParams(
			reasoningModel({ compat: { thinkingFormat: "zai" } }),
			emptyContext(),
			{ reasoningEffort: "medium" },
		);
		expect(zaiOn.enable_thinking).toBe(true);

		const qwenOff = await captureBuildParams(
			reasoningModel({ compat: { thinkingFormat: "qwen" } }),
			emptyContext(),
		);
		expect(qwenOff.enable_thinking).toBe(false);
	});

	it("sets chat_template_kwargs for qwen-chat-template", async () => {
		const params = await captureBuildParams(
			reasoningModel({ compat: { thinkingFormat: "qwen-chat-template" } }),
			emptyContext(),
			{ reasoningEffort: "low" },
		);
		expect(params.chat_template_kwargs).toEqual({
			enable_thinking: true,
			preserve_thinking: true,
		});
	});

	it("maps deepseek thinking + optional reasoning_effort", async () => {
		const withEffort = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
			}),
			emptyContext(),
			{ reasoningEffort: "high" },
		);
		expect(withEffort.thinking).toEqual({ type: "enabled" });
		expect(withEffort.reasoning_effort).toBe("high");

		const disabled = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "deepseek", supportsReasoningEffort: true },
			}),
			emptyContext(),
		);
		expect(disabled.thinking).toEqual({ type: "disabled" });
		expect(disabled).not.toHaveProperty("reasoning_effort");
	});

	it("maps openrouter nested reasoning and off fallback", async () => {
		const on = await captureBuildParams(
			reasoningModel({ compat: { thinkingFormat: "openrouter" } }),
			emptyContext(),
			{ reasoningEffort: "low" },
		);
		expect(on.reasoning).toEqual({ effort: "low" });

		const off = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "openrouter" },
				thinkingLevelMap: { off: "none" },
			}),
			emptyContext(),
		);
		expect(off.reasoning).toEqual({ effort: "none" });
	});

	it("maps ant-ling via thinkingLevelMap and falls back without effort", async () => {
		const mapped = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "ant-ling", supportsReasoningEffort: true },
				thinkingLevelMap: { medium: "ant-medium", off: "none" },
			}),
			emptyContext(),
			{ reasoningEffort: "medium" },
		);
		expect(mapped.reasoning).toEqual({ effort: "ant-medium" });

		const fallthrough = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "ant-ling", supportsReasoningEffort: true },
				thinkingLevelMap: { off: "none", medium: "ant-medium" },
			}),
			emptyContext(),
		);
		expect(fallthrough.reasoning_effort).toBe("none");
		expect(fallthrough).not.toHaveProperty("reasoning");
	});

	it("maps together and string-thinking formats", async () => {
		const together = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "together", supportsReasoningEffort: true },
			}),
			emptyContext(),
			{ reasoningEffort: "medium" },
		);
		expect(together.reasoning).toEqual({ enabled: true });
		expect(together.reasoning_effort).toBe("medium");

		const stringThinking = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "string-thinking" },
				thinkingLevelMap: { high: "think-hard", off: "none" },
			}),
			emptyContext(),
			{ reasoningEffort: "high" },
		);
		expect(stringThinking.thinking).toBe("think-hard");
	});

	it("applies generic reasoning_effort for openai format", async () => {
		const on = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
			}),
			emptyContext(),
			{ reasoningEffort: "medium" },
		);
		expect(on.reasoning_effort).toBe("medium");

		const off = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "openai", supportsReasoningEffort: true },
				thinkingLevelMap: { off: "minimal" },
			}),
			emptyContext(),
		);
		expect(off.reasoning_effort).toBe("minimal");

		const unsupported = await captureBuildParams(
			reasoningModel({
				compat: { thinkingFormat: "openai", supportsReasoningEffort: false },
			}),
			emptyContext(),
			{ reasoningEffort: "medium" },
		);
		expect(unsupported).not.toHaveProperty("reasoning_effort");
	});

	it("skips reasoning params when model.reasoning is false", async () => {
		const params = await captureBuildParams(
			baseModel({
				reasoning: false,
				compat: { thinkingFormat: "zai" },
			}),
			emptyContext(),
			{ reasoningEffort: "medium" },
		);
		expect(params).not.toHaveProperty("enable_thinking");
		expect(params).not.toHaveProperty("reasoning_effort");
	});
});
