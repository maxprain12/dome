import { describe, expect, it } from "vitest";
import type { Context, Model, OpenAICompletionsCompat, ToolResultMessage } from "../types.js";
import { convertMessages } from "./openai-completions.js";

type ResolvedCompat = Omit<Required<OpenAICompletionsCompat>, "cacheControlFormat"> & {
	cacheControlFormat?: OpenAICompletionsCompat["cacheControlFormat"];
};

function baseCompat(overrides: Partial<ResolvedCompat> = {}): ResolvedCompat {
	return {
		supportsStore: true,
		supportsDeveloperRole: false,
		supportsReasoningEffort: true,
		supportsUsageInStreaming: true,
		maxTokensField: "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: false,
		thinkingFormat: "openai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		zaiToolStream: false,
		supportsStrictMode: true,
		cacheControlFormat: undefined,
		sendSessionAffinityHeaders: false,
		supportsLongCacheRetention: true,
		...overrides,
	};
}

function visionModel(overrides: Partial<Model<"openai-completions">> = {}): Model<"openai-completions"> {
	return {
		id: "gpt-4o",
		name: "GPT-4o",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		...overrides,
	};
}

function toolResult(partial: Partial<ToolResultMessage> & Pick<ToolResultMessage, "content">): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: "call-1",
		toolName: "screenshot",
		isError: false,
		timestamp: 1,
		...partial,
	};
}

describe("convertMessages toolResult mapping", () => {
	it("maps text-only tool results without a follow-up user image message", () => {
		const context: Context = {
			messages: [
				toolResult({
					content: [{ type: "text", text: "done" }],
				}),
			],
		};

		const params = convertMessages(visionModel(), context, baseCompat());

		expect(params).toEqual([
			{
				role: "tool",
				content: "done",
				tool_call_id: "call-1",
			},
		]);
	});

	it("uses image placeholder text and attaches images on a follow-up user message", () => {
		const context: Context = {
			messages: [
				toolResult({
					content: [{ type: "image", mimeType: "image/png", data: "abc123" }],
				}),
			],
		};

		const params = convertMessages(visionModel(), context, baseCompat());

		expect(params).toEqual([
			{
				role: "tool",
				content: "(see attached image)",
				tool_call_id: "call-1",
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "Attached image(s) from tool result:" },
					{
						type: "image_url",
						image_url: { url: "data:image/png;base64,abc123" },
					},
				],
			},
		]);
	});

	it("includes tool name and assistant bridge when compat requires them", () => {
		const context: Context = {
			messages: [
				toolResult({
					toolName: "capture",
					content: [
						{ type: "text", text: "shot" },
						{ type: "image", mimeType: "image/jpeg", data: "img" },
					],
				}),
				{ role: "user", content: "what do you see?", timestamp: 2 },
			],
		};

		const params = convertMessages(
			visionModel(),
			context,
			baseCompat({
				requiresToolResultName: true,
				requiresAssistantAfterToolResult: true,
			}),
		);

		expect(params[0]).toEqual({
			role: "tool",
			content: "shot",
			tool_call_id: "call-1",
			name: "capture",
		});
		expect(params[1]).toEqual({
			role: "assistant",
			content: "I have processed the tool results.",
		});
		expect(params[2]).toMatchObject({
			role: "user",
			content: expect.arrayContaining([
				{ type: "text", text: "Attached image(s) from tool result:" },
				{
					type: "image_url",
					image_url: { url: "data:image/jpeg;base64,img" },
				},
			]),
		});
		// lastRole becomes "user" after the image follow-up, so no second bridge.
		expect(params.at(-1)).toEqual({
			role: "user",
			content: "what do you see?",
		});
	});

	it("skips collecting images when the model does not accept image input", () => {
		const context: Context = {
			messages: [
				toolResult({
					content: [{ type: "image", mimeType: "image/png", data: "abc123" }],
				}),
			],
		};

		const params = convertMessages(visionModel({ input: ["text"] }), context, baseCompat());

		expect(params).toEqual([
			{
				role: "tool",
				content: "(tool image omitted: model does not support images)",
				tool_call_id: "call-1",
			},
		]);
	});
});
