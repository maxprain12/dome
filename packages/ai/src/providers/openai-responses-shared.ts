import type OpenAI from "openai";
import type {
	Tool as OpenAITool,
	ResponseCreateParamsStreaming,
	ResponseFunctionCallOutputItemList,
	ResponseFunctionToolCall,
	ResponseInput,
	ResponseInputContent,
	ResponseInputImage,
	ResponseInputText,
	ResponseOutputMessage,
	ResponseReasoningItem,
	ResponseStreamEvent,
} from "openai/resources/responses/responses.js";
import { calculateCost } from "../models.js";
import type {
	Api,
	AssistantMessage,
	Context,
	ImageContent,
	Model,
	StopReason,
	TextContent,
	TextSignatureV1,
	ThinkingContent,
	Tool,
	ToolCall,
	Usage,
} from "../types.js";
import type { AssistantMessageEventStream } from "../utils/event-stream.js";
import { shortHash } from "../utils/hash.js";
import { parseStreamingJson } from "../utils/json-parse.js";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.js";
import { transformMessages } from "./transform-messages.js";

// =============================================================================
// Utilities
// =============================================================================

function encodeTextSignatureV1(id: string, phase?: TextSignatureV1["phase"]): string {
	const payload: TextSignatureV1 = { v: 1, id };
	if (phase) payload.phase = phase;
	return JSON.stringify(payload);
}

function parseTextSignature(
	signature: string | undefined,
): { id: string; phase?: TextSignatureV1["phase"] } | undefined {
	if (!signature) return undefined;
	if (signature.startsWith("{")) {
		try {
			const parsed = JSON.parse(signature) as Partial<TextSignatureV1>;
			if (parsed.v === 1 && typeof parsed.id === "string") {
				if (parsed.phase === "commentary" || parsed.phase === "final_answer") {
					return { id: parsed.id, phase: parsed.phase };
				}
				return { id: parsed.id };
			}
		} catch {
			// Fall through to legacy plain-string handling.
		}
	}
	return { id: signature };
}

export interface OpenAIResponsesStreamOptions {
	serviceTier?: ResponseCreateParamsStreaming["service_tier"];
	resolveServiceTier?: (
		responseServiceTier: ResponseCreateParamsStreaming["service_tier"] | undefined,
		requestServiceTier: ResponseCreateParamsStreaming["service_tier"] | undefined,
	) => ResponseCreateParamsStreaming["service_tier"] | undefined;
	applyServiceTierPricing?: (
		usage: Usage,
		serviceTier: ResponseCreateParamsStreaming["service_tier"] | undefined,
	) => void;
}

export interface ConvertResponsesMessagesOptions {
	includeSystemPrompt?: boolean;
}

export interface ConvertResponsesToolsOptions {
	strict?: boolean | null;
}

// =============================================================================
// Message conversion
// =============================================================================

export function convertResponsesMessages<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	allowedToolCallProviders: ReadonlySet<string>,
	options?: ConvertResponsesMessagesOptions,
): ResponseInput {
	const messages: ResponseInput = [];

	const normalizeIdPart = (part: string): string => {
		const sanitized = part.replace(/[^a-zA-Z0-9_-]/g, "_");
		const normalized = sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
		return normalized.replace(/_+$/, "");
	};

	const buildForeignResponsesItemId = (itemId: string): string => {
		const normalized = `fc_${shortHash(itemId)}`;
		return normalized.length > 64 ? normalized.slice(0, 64) : normalized;
	};

	const normalizeToolCallId = (id: string, _targetModel: Model<TApi>, source: AssistantMessage): string => {
		if (!allowedToolCallProviders.has(model.provider)) return normalizeIdPart(id);
		if (!id.includes("|")) return normalizeIdPart(id);
		const [callId, itemId] = id.split("|");
		const normalizedCallId = normalizeIdPart(callId);
		const isForeignToolCall = source.provider !== model.provider || source.api !== model.api;
		let normalizedItemId = isForeignToolCall ? buildForeignResponsesItemId(itemId) : normalizeIdPart(itemId);
		// OpenAI Responses API requires item id to start with "fc"
		if (!normalizedItemId.startsWith("fc_")) {
			normalizedItemId = normalizeIdPart(`fc_${normalizedItemId}`);
		}
		return `${normalizedCallId}|${normalizedItemId}`;
	};

	const transformedMessages = transformMessages(context.messages, model, normalizeToolCallId);

	const includeSystemPrompt = options?.includeSystemPrompt ?? true;
	if (includeSystemPrompt && context.systemPrompt) {
		const role = model.reasoning ? "developer" : "system";
		messages.push({
			role,
			content: sanitizeSurrogates(context.systemPrompt),
		});
	}

	let msgIndex = 0;
	for (const msg of transformedMessages) {
		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				messages.push({
					role: "user",
					content: [{ type: "input_text", text: sanitizeSurrogates(msg.content) }],
				});
			} else {
				const content: ResponseInputContent[] = msg.content.map((item): ResponseInputContent => {
					if (item.type === "text") {
						return {
							type: "input_text",
							text: sanitizeSurrogates(item.text),
						} satisfies ResponseInputText;
					}
					return {
						type: "input_image",
						detail: "auto",
						image_url: `data:${item.mimeType};base64,${item.data}`,
					} satisfies ResponseInputImage;
				});
				if (content.length === 0) continue;
				messages.push({
					role: "user",
					content,
				});
			}
		} else if (msg.role === "assistant") {
			const output: ResponseInput = [];
			const assistantMsg = msg as AssistantMessage;
			const isDifferentModel =
				assistantMsg.model !== model.id &&
				assistantMsg.provider === model.provider &&
				assistantMsg.api === model.api;
			let textBlockIndex = 0;

			for (const block of msg.content) {
				if (block.type === "thinking") {
					if (block.thinkingSignature) {
						const reasoningItem = JSON.parse(block.thinkingSignature) as ResponseReasoningItem;
						output.push(reasoningItem);
					}
				} else if (block.type === "text") {
					const textBlock = block as TextContent;
					const parsedSignature = parseTextSignature(textBlock.textSignature);
					const fallbackMessageId =
						textBlockIndex === 0 ? `msg_pi_${msgIndex}` : `msg_pi_${msgIndex}_${textBlockIndex}`;
					textBlockIndex++;
					// OpenAI requires id to be max 64 characters
					let msgId = parsedSignature?.id;
					if (!msgId) {
						msgId = fallbackMessageId;
					} else if (msgId.length > 64) {
						msgId = `msg_${shortHash(msgId)}`;
					}
					output.push({
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: sanitizeSurrogates(textBlock.text), annotations: [] }],
						status: "completed",
						id: msgId,
						phase: parsedSignature?.phase,
					} satisfies ResponseOutputMessage);
				} else if (block.type === "toolCall") {
					const toolCall = block as ToolCall;
					const [callId, itemIdRaw] = toolCall.id.split("|");
					let itemId: string | undefined = itemIdRaw;

					// For different-model messages, set id to undefined to avoid pairing validation.
					// OpenAI tracks which fc_xxx IDs were paired with rs_xxx reasoning items.
					// By omitting the id, we avoid triggering that validation (like cross-provider does).
					if (isDifferentModel && itemId?.startsWith("fc_")) {
						itemId = undefined;
					}

					output.push({
						type: "function_call",
						id: itemId,
						call_id: callId,
						name: toolCall.name,
						arguments: JSON.stringify(toolCall.arguments),
					});
				}
			}
			if (output.length === 0) continue;
			messages.push(...output);
		} else if (msg.role === "toolResult") {
			const textResult = msg.content
				.filter((c): c is TextContent => c.type === "text")
				.map((c) => c.text)
				.join("\n");
			const hasImages = msg.content.some((c): c is ImageContent => c.type === "image");
			const hasText = textResult.length > 0;
			const [callId] = msg.toolCallId.split("|");

			let output: string | ResponseFunctionCallOutputItemList;
			if (hasImages && model.input.includes("image")) {
				const contentParts: ResponseFunctionCallOutputItemList = [];

				if (hasText) {
					contentParts.push({
						type: "input_text",
						text: sanitizeSurrogates(textResult),
					});
				}

				for (const block of msg.content) {
					if (block.type === "image") {
						contentParts.push({
							type: "input_image",
							detail: "auto",
							image_url: `data:${block.mimeType};base64,${block.data}`,
						});
					}
				}

				output = contentParts;
			} else {
				output = sanitizeSurrogates(hasText ? textResult : "(see attached image)");
			}

			messages.push({
				type: "function_call_output",
				call_id: callId,
				output,
			});
		}
		msgIndex++;
	}

	return messages;
}

// =============================================================================
// Tool conversion
// =============================================================================

export function convertResponsesTools(tools: Tool[], options?: ConvertResponsesToolsOptions): OpenAITool[] {
	const strict = options?.strict === undefined ? false : options.strict;
	return tools.map((tool) => ({
		type: "function",
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters as any, // TypeBox already generates JSON Schema
		strict,
	}));
}

// =============================================================================
// Stream processing
// =============================================================================

type ResponsesStreamCurrentItem =
	| ResponseReasoningItem
	| ResponseOutputMessage
	| ResponseFunctionToolCall
	| null;

type ResponsesStreamToolCallBlock = ToolCall & { partialJson: string };

type ResponsesStreamCurrentBlock =
	| ThinkingContent
	| TextContent
	| ResponsesStreamToolCallBlock
	| null;

interface ResponsesStreamState {
	currentItem: ResponsesStreamCurrentItem;
	currentBlock: ResponsesStreamCurrentBlock;
	output: AssistantMessage;
	stream: AssistantMessageEventStream;
	blockIndex: () => number;
}

export async function processResponsesStream<TApi extends Api>(
	openaiStream: AsyncIterable<ResponseStreamEvent>,
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	model: Model<TApi>,
	options?: OpenAIResponsesStreamOptions,
): Promise<void> {
	const state: ResponsesStreamState = {
		currentItem: null,
		currentBlock: null,
		output,
		stream,
		blockIndex: () => output.content.length - 1,
	};

	for await (const event of openaiStream) {
		dispatchResponsesStreamEvent(event, state, model, options);
	}
}

function dispatchResponsesStreamEvent<TApi extends Api>(
	event: ResponseStreamEvent,
	state: ResponsesStreamState,
	model: Model<TApi>,
	options?: OpenAIResponsesStreamOptions,
): void {
	switch (event.type) {
		case "response.created":
			state.output.responseId = event.response.id;
			return;
		case "response.output_item.added":
			handleOutputItemAdded(event, state);
			return;
		case "response.reasoning_summary_part.added":
			handleReasoningSummaryPartAdded(event, state);
			return;
		case "response.reasoning_summary_text.delta":
			handleReasoningSummaryTextDelta(event, state);
			return;
		case "response.reasoning_summary_part.done":
			handleReasoningSummaryPartDone(state);
			return;
		case "response.reasoning_text.delta":
			handleReasoningTextDelta(event, state);
			return;
		case "response.content_part.added":
			handleContentPartAdded(event, state);
			return;
		case "response.output_text.delta":
			handleOutputTextDelta(event, state);
			return;
		case "response.refusal.delta":
			handleRefusalDelta(event, state);
			return;
		case "response.function_call_arguments.delta":
			handleFunctionCallArgumentsDelta(event, state);
			return;
		case "response.function_call_arguments.done":
			handleFunctionCallArgumentsDone(event, state);
			return;
		case "response.output_item.done":
			handleOutputItemDone(event, state);
			return;
		case "response.completed":
			handleResponseCompleted(event, state, model, options);
			return;
		case "error":
			throwResponsesStreamError(event);
			return;
		case "response.failed":
			throwResponsesStreamFailed(event);
			return;
		default:
			return;
	}
}

function handleOutputItemAdded(
	event: Extract<ResponseStreamEvent, { type: "response.output_item.added" }>,
	state: ResponsesStreamState,
): void {
	const item = event.item;
	const { output, stream, blockIndex } = state;

	if (item.type === "reasoning") {
		state.currentItem = item;
		state.currentBlock = { type: "thinking", thinking: "" };
		output.content.push(state.currentBlock);
		stream.push({ type: "thinking_start", contentIndex: blockIndex(), partial: output });
		return;
	}
	if (item.type === "message") {
		state.currentItem = item;
		state.currentBlock = { type: "text", text: "" };
		output.content.push(state.currentBlock);
		stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
		return;
	}
	if (item.type === "function_call") {
		state.currentItem = item;
		state.currentBlock = {
			type: "toolCall",
			id: `${item.call_id}|${item.id}`,
			name: item.name,
			arguments: {},
			partialJson: item.arguments || "",
		};
		output.content.push(state.currentBlock);
		stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
	}
}

function handleReasoningSummaryPartAdded(
	event: Extract<ResponseStreamEvent, { type: "response.reasoning_summary_part.added" }>,
	state: ResponsesStreamState,
): void {
	if (state.currentItem && state.currentItem.type === "reasoning") {
		state.currentItem.summary = state.currentItem.summary || [];
		state.currentItem.summary.push(event.part);
	}
}

function handleReasoningSummaryTextDelta(
	event: Extract<ResponseStreamEvent, { type: "response.reasoning_summary_text.delta" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "reasoning" || currentBlock?.type !== "thinking") return;

	currentItem.summary = currentItem.summary || [];
	const lastPart = currentItem.summary[currentItem.summary.length - 1];
	if (!lastPart) return;

	currentBlock.thinking += event.delta;
	lastPart.text += event.delta;
	stream.push({
		type: "thinking_delta",
		contentIndex: blockIndex(),
		delta: event.delta,
		partial: output,
	});
}

function handleReasoningSummaryPartDone(state: ResponsesStreamState): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "reasoning" || currentBlock?.type !== "thinking") return;

	currentItem.summary = currentItem.summary || [];
	const lastPart = currentItem.summary[currentItem.summary.length - 1];
	if (!lastPart) return;

	currentBlock.thinking += "\n\n";
	lastPart.text += "\n\n";
	stream.push({
		type: "thinking_delta",
		contentIndex: blockIndex(),
		delta: "\n\n",
		partial: output,
	});
}

function handleReasoningTextDelta(
	event: Extract<ResponseStreamEvent, { type: "response.reasoning_text.delta" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "reasoning" || currentBlock?.type !== "thinking") return;

	currentBlock.thinking += event.delta;
	stream.push({
		type: "thinking_delta",
		contentIndex: blockIndex(),
		delta: event.delta,
		partial: output,
	});
}

function handleContentPartAdded(
	event: Extract<ResponseStreamEvent, { type: "response.content_part.added" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem } = state;
	if (currentItem?.type !== "message") return;

	currentItem.content = currentItem.content || [];
	// Filter out ReasoningText, only accept output_text and refusal
	if (event.part.type === "output_text" || event.part.type === "refusal") {
		currentItem.content.push(event.part);
	}
}

function handleOutputTextDelta(
	event: Extract<ResponseStreamEvent, { type: "response.output_text.delta" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "message" || currentBlock?.type !== "text") return;
	if (!currentItem.content || currentItem.content.length === 0) return;

	const lastPart = currentItem.content[currentItem.content.length - 1];
	if (lastPart?.type !== "output_text") return;

	currentBlock.text += event.delta;
	lastPart.text += event.delta;
	stream.push({
		type: "text_delta",
		contentIndex: blockIndex(),
		delta: event.delta,
		partial: output,
	});
}

function handleRefusalDelta(
	event: Extract<ResponseStreamEvent, { type: "response.refusal.delta" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "message" || currentBlock?.type !== "text") return;
	if (!currentItem.content || currentItem.content.length === 0) return;

	const lastPart = currentItem.content[currentItem.content.length - 1];
	if (lastPart?.type !== "refusal") return;

	currentBlock.text += event.delta;
	lastPart.refusal += event.delta;
	stream.push({
		type: "text_delta",
		contentIndex: blockIndex(),
		delta: event.delta,
		partial: output,
	});
}

function handleFunctionCallArgumentsDelta(
	event: Extract<ResponseStreamEvent, { type: "response.function_call_arguments.delta" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "function_call" || currentBlock?.type !== "toolCall") return;

	currentBlock.partialJson += event.delta;
	currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);
	stream.push({
		type: "toolcall_delta",
		contentIndex: blockIndex(),
		delta: event.delta,
		partial: output,
	});
}

function handleFunctionCallArgumentsDone(
	event: Extract<ResponseStreamEvent, { type: "response.function_call_arguments.done" }>,
	state: ResponsesStreamState,
): void {
	const { currentItem, currentBlock, output, stream, blockIndex } = state;
	if (currentItem?.type !== "function_call" || currentBlock?.type !== "toolCall") return;

	const previousPartialJson = currentBlock.partialJson;
	currentBlock.partialJson = event.arguments;
	currentBlock.arguments = parseStreamingJson(currentBlock.partialJson);

	if (!event.arguments.startsWith(previousPartialJson)) return;

	const delta = event.arguments.slice(previousPartialJson.length);
	if (delta.length === 0) return;

	stream.push({
		type: "toolcall_delta",
		contentIndex: blockIndex(),
		delta,
		partial: output,
	});
}

function handleOutputItemDone(
	event: Extract<ResponseStreamEvent, { type: "response.output_item.done" }>,
	state: ResponsesStreamState,
): void {
	const item = event.item;

	if (item.type === "reasoning" && state.currentBlock?.type === "thinking") {
		finalizeReasoningItem(item, state);
		return;
	}
	if (item.type === "message" && state.currentBlock?.type === "text") {
		finalizeMessageItem(item, state);
		return;
	}
	if (item.type === "function_call") {
		finalizeFunctionCallItem(item, state);
	}
}

function finalizeReasoningItem(item: ResponseReasoningItem, state: ResponsesStreamState): void {
	const currentBlock = state.currentBlock;
	if (currentBlock?.type !== "thinking") return;

	const summaryText = item.summary?.map((s) => s.text).join("\n\n") || "";
	const contentText = item.content?.map((c) => c.text).join("\n\n") || "";
	currentBlock.thinking = summaryText || contentText || currentBlock.thinking;
	currentBlock.thinkingSignature = JSON.stringify(item);
	state.stream.push({
		type: "thinking_end",
		contentIndex: state.blockIndex(),
		content: currentBlock.thinking,
		partial: state.output,
	});
	state.currentBlock = null;
}

function finalizeMessageItem(item: ResponseOutputMessage, state: ResponsesStreamState): void {
	const currentBlock = state.currentBlock;
	if (currentBlock?.type !== "text") return;

	currentBlock.text = item.content.map((c) => (c.type === "output_text" ? c.text : c.refusal)).join("");
	currentBlock.textSignature = encodeTextSignatureV1(item.id, item.phase ?? undefined);
	state.stream.push({
		type: "text_end",
		contentIndex: state.blockIndex(),
		content: currentBlock.text,
		partial: state.output,
	});
	state.currentBlock = null;
}

function finalizeFunctionCallItem(item: ResponseFunctionToolCall, state: ResponsesStreamState): void {
	const currentBlock = state.currentBlock;
	const args =
		currentBlock?.type === "toolCall" && currentBlock.partialJson
			? parseStreamingJson(currentBlock.partialJson)
			: parseStreamingJson(item.arguments || "{}");

	let toolCall: ToolCall;
	if (currentBlock?.type === "toolCall") {
		// Finalize in-place and strip the scratch buffer so replay only
		// carries parsed arguments.
		currentBlock.arguments = args;
		delete (currentBlock as { partialJson?: string }).partialJson;
		toolCall = currentBlock;
	} else {
		toolCall = {
			type: "toolCall",
			id: `${item.call_id}|${item.id}`,
			name: item.name,
			arguments: args,
		};
	}

	state.currentBlock = null;
	state.stream.push({
		type: "toolcall_end",
		contentIndex: state.blockIndex(),
		toolCall,
		partial: state.output,
	});
}

function handleResponseCompleted<TApi extends Api>(
	event: Extract<ResponseStreamEvent, { type: "response.completed" }>,
	state: ResponsesStreamState,
	model: Model<TApi>,
	options?: OpenAIResponsesStreamOptions,
): void {
	const response = event.response;
	const { output } = state;

	if (response?.id) {
		output.responseId = response.id;
	}
	if (response?.usage) {
		const cachedTokens = response.usage.input_tokens_details?.cached_tokens || 0;
		output.usage = {
			// OpenAI includes cached tokens in input_tokens, so subtract to get non-cached input
			input: (response.usage.input_tokens || 0) - cachedTokens,
			output: response.usage.output_tokens || 0,
			cacheRead: cachedTokens,
			cacheWrite: 0,
			totalTokens: response.usage.total_tokens || 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		};
	}
	calculateCost(model, output.usage);
	applyCompletedServiceTierPricing(output, response, options);
	output.stopReason = mapStopReason(response?.status);
	if (output.content.some((b) => b.type === "toolCall") && output.stopReason === "stop") {
		output.stopReason = "toolUse";
	}
}

function applyCompletedServiceTierPricing(
	output: AssistantMessage,
	response: Extract<ResponseStreamEvent, { type: "response.completed" }>["response"],
	options?: OpenAIResponsesStreamOptions,
): void {
	if (!options?.applyServiceTierPricing) return;

	const serviceTier = options.resolveServiceTier
		? options.resolveServiceTier(response?.service_tier, options.serviceTier)
		: (response?.service_tier ?? options.serviceTier);
	options.applyServiceTierPricing(output.usage, serviceTier);
}

function throwResponsesStreamError(
	event: Extract<ResponseStreamEvent, { type: "error" }>,
): never {
	throw new Error(
		event.message
			? `Error Code ${event.code}: ${event.message}`
			: "Unknown error",
	);
}

function throwResponsesStreamFailed(
	event: Extract<ResponseStreamEvent, { type: "response.failed" }>,
): never {
	const error = event.response?.error;
	const details = event.response?.incomplete_details;
	const msg = error
		? `${error.code || "unknown"}: ${error.message || "no message"}`
		: details?.reason
			? `incomplete: ${details.reason}`
			: "Unknown error (no error details in response)";
	throw new Error(msg);
}

function mapStopReason(status: OpenAI.Responses.ResponseStatus | undefined): StopReason {
	if (!status) return "stop";
	switch (status) {
		case "completed":
			return "stop";
		case "incomplete":
			return "length";
		case "failed":
		case "cancelled":
			return "error";
		// These two are wonky ...
		case "in_progress":
		case "queued":
			return "stop";
		default: {
			const _exhaustive: never = status;
			throw new Error(`Unhandled stop reason: ${_exhaustive}`);
		}
	}
}
