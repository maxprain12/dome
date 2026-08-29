import { describe, expect, it } from "vitest";
import type { ResponseStreamEvent } from "openai/resources/responses/responses.js";
import type { AssistantMessage, AssistantMessageEvent, Model, Usage } from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { processResponsesStream } from "./openai-responses-shared.js";

function baseModel(overrides: Partial<Model<"openai-responses">> = {}): Model<"openai-responses"> {
	return {
		id: "gpt-4o",
		name: "GPT-4o",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 4096,
		...overrides,
	};
}

function emptyOutput(): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "openai-responses",
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
		stopReason: "stop",
		timestamp: 1,
	};
}

/** Test fixtures omit SDK bookkeeping fields (sequence_number, indexes). */
function asStreamEvent(event: object): ResponseStreamEvent {
	return event as unknown as ResponseStreamEvent;
}

async function* eventsOf(...events: object[]): AsyncIterable<ResponseStreamEvent> {
	for (const event of events) {
		yield asStreamEvent(event);
	}
}

async function collectStreamEvents(
	stream: AssistantMessageEventStream,
): Promise<AssistantMessageEvent[]> {
	const collected: AssistantMessageEvent[] = [];
	for await (const event of stream) {
		collected.push(event);
	}
	return collected;
}

describe("processResponsesStream", () => {
	it("streams text deltas, sets usage/cost, and maps stop reason", async () => {
		const output = emptyOutput();
		const stream = new AssistantMessageEventStream();
		const model = baseModel();

		const messageItem = {
			type: "message" as const,
			id: "msg_1",
			role: "assistant" as const,
			status: "in_progress" as const,
			content: [] as Array<{ type: "output_text"; text: string; annotations: [] }>,
		};

		const run = processResponsesStream(
			eventsOf(
				{
					type: "response.created",
					response: { id: "resp_1" },
				},
				{
					type: "response.output_item.added",
					item: messageItem,
				},
				{
					type: "response.content_part.added",
					part: { type: "output_text", text: "", annotations: [] },
				},
				{
					type: "response.output_text.delta",
					delta: "Hello",
				},
				{
					type: "response.output_item.done",
					item: {
						...messageItem,
						status: "completed",
						content: [{ type: "output_text", text: "Hello", annotations: [] }],
					},
				},
				{
					type: "response.completed",
					response: {
						id: "resp_1",
						status: "completed",
						usage: {
							input_tokens: 12,
							output_tokens: 3,
							total_tokens: 15,
							input_tokens_details: { cached_tokens: 4 },
						},
					},
				},
			),
			output,
			stream,
			model,
		);

		const collectPromise = collectStreamEvents(stream);
		await run;
		stream.end(output);
		const events = await collectPromise;

		expect(output.responseId).toBe("resp_1");
		expect(output.content).toEqual([
			{
				type: "text",
				text: "Hello",
				textSignature: JSON.stringify({ v: 1, id: "msg_1" }),
			},
		]);
		expect(output.usage).toMatchObject({
			input: 8,
			output: 3,
			cacheRead: 4,
			cacheWrite: 0,
			totalTokens: 15,
		});
		expect(output.usage.cost.total).toBeGreaterThan(0);
		expect(output.stopReason).toBe("stop");
		expect(events.map((e) => e.type)).toEqual([
			"text_start",
			"text_delta",
			"text_end",
		]);
	});

	it("streams tool call args with partialJson deltas and overrides stop to toolUse", async () => {
		const output = emptyOutput();
		const stream = new AssistantMessageEventStream();
		const model = baseModel();

		const toolItem = {
			type: "function_call" as const,
			id: "fc_1",
			call_id: "call_1",
			name: "echo",
			arguments: "",
			status: "in_progress" as const,
		};

		const run = processResponsesStream(
			eventsOf(
				{
					type: "response.output_item.added",
					item: toolItem,
				},
				{
					type: "response.function_call_arguments.delta",
					delta: '{"x":',
				},
				{
					type: "response.function_call_arguments.delta",
					delta: "1}",
				},
				{
					type: "response.function_call_arguments.done",
					arguments: '{"x":1}',
				},
				{
					type: "response.output_item.done",
					item: { ...toolItem, arguments: '{"x":1}', status: "completed" },
				},
				{
					type: "response.completed",
					response: {
						id: "resp_tool",
						status: "completed",
						usage: {
							input_tokens: 5,
							output_tokens: 2,
							total_tokens: 7,
						},
					},
				},
			),
			output,
			stream,
			model,
		);

		const collectPromise = collectStreamEvents(stream);
		await run;
		stream.end(output);
		const events = await collectPromise;

		expect(output.stopReason).toBe("toolUse");
		expect(output.content).toHaveLength(1);
		const toolCall = output.content[0];
		expect(toolCall).toMatchObject({
			type: "toolCall",
			id: "call_1|fc_1",
			name: "echo",
			arguments: { x: 1 },
		});
		expect(toolCall).not.toHaveProperty("partialJson");
		expect(events.map((e) => e.type)).toEqual([
			"toolcall_start",
			"toolcall_delta",
			"toolcall_delta",
			"toolcall_end",
		]);
	});

	it("streams reasoning summary and sets thinkingSignature on done", async () => {
		const output = emptyOutput();
		const stream = new AssistantMessageEventStream();
		const model = baseModel({ reasoning: true });

		const reasoningItem = {
			type: "reasoning" as const,
			id: "rs_1",
			summary: [] as Array<{ type: "summary_text"; text: string }>,
		};

		const doneItem = {
			...reasoningItem,
			summary: [{ type: "summary_text" as const, text: "think" }],
		};

		const run = processResponsesStream(
			eventsOf(
				{
					type: "response.output_item.added",
					item: reasoningItem,
				},
				{
					type: "response.reasoning_summary_part.added",
					part: { type: "summary_text", text: "" },
				},
				{
					type: "response.reasoning_summary_text.delta",
					delta: "think",
				},
				{
					type: "response.output_item.done",
					item: doneItem,
				},
				{
					type: "response.completed",
					response: { id: "resp_r", status: "completed" },
				},
			),
			output,
			stream,
			model,
		);

		const collectPromise = collectStreamEvents(stream);
		await run;
		stream.end(output);
		const events = await collectPromise;

		expect(output.content[0]).toMatchObject({
			type: "thinking",
			thinking: "think",
			thinkingSignature: JSON.stringify(doneItem),
		});
		expect(events.map((e) => e.type)).toEqual([
			"thinking_start",
			"thinking_delta",
			"thinking_end",
		]);
	});

	it("applies service-tier pricing hooks on completed", async () => {
		const output = emptyOutput();
		const stream = new AssistantMessageEventStream();
		const model = baseModel();
		const tiersSeen: unknown[] = [];

		await processResponsesStream(
			eventsOf({
				type: "response.completed",
				response: {
					id: "resp_tier",
					status: "completed",
					service_tier: "priority",
					usage: {
						input_tokens: 10,
						output_tokens: 1,
						total_tokens: 11,
					},
				},
			}),
			output,
			stream,
			model,
			{
				serviceTier: "default",
				resolveServiceTier: (responseTier, requestTier) => responseTier ?? requestTier,
				applyServiceTierPricing: (usage: Usage, serviceTier) => {
					tiersSeen.push(serviceTier);
					usage.cost.total += 1;
				},
			},
		);
		stream.end(output);

		expect(tiersSeen).toEqual(["priority"]);
		expect(output.usage.cost.total).toBeGreaterThan(0);
	});

	it("throws on error and response.failed events", async () => {
		const model = baseModel();

		await expect(
			processResponsesStream(
				eventsOf({ type: "error", code: "E1", message: "boom" }),
				emptyOutput(),
				new AssistantMessageEventStream(),
				model,
			),
		).rejects.toThrow("Error Code E1: boom");

		await expect(
			processResponsesStream(
				eventsOf({
					type: "response.failed",
					response: {
						error: { code: "failed", message: "nope" },
					},
				}),
				emptyOutput(),
				new AssistantMessageEventStream(),
				model,
			),
		).rejects.toThrow("failed: nope");
	});
});
