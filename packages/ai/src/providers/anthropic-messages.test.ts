import { describe, expect, it } from "vitest";
import type { AssistantMessage, Message, Model, ToolResultMessage } from "../types.js";
import { convertMessages } from "./anthropic.js";

function baseModel(overrides: Partial<Model<"anthropic-messages">> = {}): Model<"anthropic-messages"> {
	return {
		id: "claude-sonnet-4-5",
		name: "Claude Sonnet",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "https://api.anthropic.com",
		reasoning: true,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
		...overrides,
	};
}

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 1,
	};
}

function toolResult(partial: Partial<ToolResultMessage> & Pick<ToolResultMessage, "toolCallId" | "content">): ToolResultMessage {
	return {
		role: "toolResult",
		toolName: "Read",
		isError: false,
		timestamp: 2,
		...partial,
	};
}

describe("convertMessages (anthropic)", () => {
	it("skips blank string user messages and empty text-only content arrays", () => {
		const messages: Message[] = [
			{ role: "user", content: "   ", timestamp: 1 },
			{
				role: "user",
				content: [{ type: "text", text: "  " }],
				timestamp: 2,
			},
			{ role: "user", content: "hello", timestamp: 3 },
		];

		expect(convertMessages(messages, baseModel(), false)).toEqual([
			{ role: "user", content: "hello" },
		]);
	});

	it("maps thinking without signature to text unless allowEmptySignature", () => {
		const messages: Message[] = [
			assistant([
				{ type: "thinking", thinking: "ponder", thinkingSignature: "" },
				{ type: "text", text: "answer" },
			]),
		];

		expect(convertMessages(messages, baseModel(), false)).toEqual([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "ponder" },
					{ type: "text", text: "answer" },
				],
			},
		]);

		expect(convertMessages(messages, baseModel(), false, undefined, true)).toEqual([
			{
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "ponder", signature: "" },
					{ type: "text", text: "answer" },
				],
			},
		]);
	});

	it("preserves redacted thinking and signed thinking blocks", () => {
		const messages: Message[] = [
			assistant([
				{
					type: "thinking",
					thinking: "[Reasoning redacted]",
					thinkingSignature: "opaque-payload",
					redacted: true,
				},
				{
					type: "thinking",
					thinking: "visible",
					thinkingSignature: "sig-1",
				},
			]),
		];

		expect(convertMessages(messages, baseModel(), false)).toEqual([
			{
				role: "assistant",
				content: [
					{ type: "redacted_thinking", data: "opaque-payload" },
					{ type: "thinking", thinking: "visible", signature: "sig-1" },
				],
			},
		]);
	});

	it("drops empty-name tool_use and orphans matching tool_result (MiniMax 2013)", () => {
		const messages: Message[] = [
			assistant([
				{ type: "toolCall", id: "bad", name: "  ", arguments: {} },
				{ type: "toolCall", id: "good", name: "Read", arguments: { path: "a.ts" } },
			]),
			toolResult({
				toolCallId: "bad",
				content: [{ type: "text", text: "should drop" }],
			}),
			toolResult({
				toolCallId: "good",
				content: [{ type: "text", text: "file contents" }],
			}),
		];

		expect(convertMessages(messages, baseModel(), false)).toEqual([
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "good",
						name: "Read",
						input: { path: "a.ts" },
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "good",
						content: "file contents",
						is_error: false,
					},
				],
			},
		]);
	});

	it("clears tool_use tracking when an assistant turn only had invalid tool calls", () => {
		const messages: Message[] = [
			assistant([{ type: "toolCall", id: "only-bad", name: "", arguments: {} }]),
			toolResult({
				toolCallId: "only-bad",
				content: [{ type: "text", text: "orphan" }],
			}),
		];

		expect(convertMessages(messages, baseModel(), false)).toEqual([]);
	});

	it("batches consecutive tool results into one user message", () => {
		const messages: Message[] = [
			assistant([
				{ type: "toolCall", id: "a", name: "Read", arguments: {} },
				{ type: "toolCall", id: "b", name: "Bash", arguments: {} },
			]),
			toolResult({
				toolCallId: "a",
				content: [{ type: "text", text: "one" }],
			}),
			toolResult({
				toolCallId: "b",
				content: [{ type: "text", text: "two" }],
				isError: true,
			}),
		];

		const params = convertMessages(messages, baseModel(), false);
		expect(params).toHaveLength(2);
		expect(params[1]).toEqual({
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "a",
					content: "one",
					is_error: false,
				},
				{
					type: "tool_result",
					tool_use_id: "b",
					content: "two",
					is_error: true,
				},
			],
		});
	});

	it("applies cache_control to the last user string or block", () => {
		const cacheControl = { type: "ephemeral" as const };
		const stringParams = convertMessages(
			[{ role: "user", content: "hi", timestamp: 1 }],
			baseModel(),
			false,
			cacheControl,
		);
		expect(stringParams).toEqual([
			{
				role: "user",
				content: [{ type: "text", text: "hi", cache_control: cacheControl }],
			},
		]);

		const blockParams = convertMessages(
			[
				{
					role: "user",
					content: [
						{ type: "text", text: "see" },
						{ type: "image", mimeType: "image/png", data: "abc" },
					],
					timestamp: 1,
				},
			],
			baseModel(),
			false,
			cacheControl,
		);
		expect(blockParams[0]).toMatchObject({
			role: "user",
			content: [
				{ type: "text", text: "see" },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "abc" },
					cache_control: cacheControl,
				},
			],
		});
	});

	it("maps tool names to Claude Code casing when using OAuth tokens", () => {
		const messages: Message[] = [
			assistant([{ type: "toolCall", id: "t1", name: "read", arguments: { path: "x" } }]),
			toolResult({
				toolCallId: "t1",
				content: [{ type: "text", text: "ok" }],
			}),
		];

		const params = convertMessages(messages, baseModel(), true);
		expect(params[0]).toEqual({
			role: "assistant",
			content: [
				{
					type: "tool_use",
					id: "t1",
					name: "Read",
					input: { path: "x" },
				},
			],
		});
		expect(params[1]).toMatchObject({
			role: "user",
			content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }],
		});
	});
});
