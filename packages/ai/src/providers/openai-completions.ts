import OpenAI from "openai";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionChunk,
	ChatCompletionContentPart,
	ChatCompletionContentPartImage,
	ChatCompletionContentPartText,
	ChatCompletionDeveloperMessageParam,
	ChatCompletionMessageParam,
	ChatCompletionSystemMessageParam,
	ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";
import { calculateCost, clampThinkingLevel } from "../models.js";
import type {
	AssistantMessage,
	CacheRetention,
	Context,
	ImageContent,
	Message,
	Model,
	OpenAICompletionsCompat,
	SimpleStreamOptions,
	StopReason,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
	ToolResultMessage,
} from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { headersToRecord } from "../utils/headers.js";
import { parseStreamingJson } from "../utils/json-parse.js";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.js";
import { normalizeToolSchema } from "../utils/tool-schema.js";
import { isCloudflareProvider, resolveCloudflareBaseUrl } from "./cloudflare.js";
import { buildCopilotDynamicHeaders, hasCopilotVisionInput } from "./github-copilot-headers.js";
import { clampOpenAIPromptCacheKey } from "./openai-prompt-cache.js";
import { buildBaseOptions } from "./simple-options.js";
import { transformMessages } from "./transform-messages.js";
import { ollamaRequiresApiKey, OLLAMA_LOCAL_PLACEHOLDER_KEY } from "../ollama-mode.js";

function resolveOpenAICompletionsApiKey(
	model: Model<"openai-completions">,
	apiKey?: string,
): string {
	if (apiKey) return apiKey;
	if (model.provider === "ollama") {
		if (ollamaRequiresApiKey(model.baseUrl)) {
			throw new Error("Ollama cloud requires an API key");
		}
		return OLLAMA_LOCAL_PLACEHOLDER_KEY;
	}
	throw new Error(`No API key for provider: ${model.provider}`);
}

/**
 * Check if conversation messages contain tool calls or tool results.
 * This is needed because Anthropic (via proxy) requires the tools param
 * to be present when messages include tool_calls or tool role messages.
 */
function hasToolHistory(messages: Message[]): boolean {
	for (const msg of messages) {
		if (msg.role === "toolResult") {
			return true;
		}
		if (msg.role === "assistant") {
			if (msg.content.some((block) => block.type === "toolCall")) {
				return true;
			}
		}
	}
	return false;
}

function isTextContentBlock(block: { type: string }): block is TextContent {
	return block.type === "text";
}

function isThinkingContentBlock(block: { type: string }): block is ThinkingContent {
	return block.type === "thinking";
}

function isToolCallBlock(block: { type: string }): block is ToolCall {
	return block.type === "toolCall";
}

function isImageContentBlock(block: { type: string }): block is ImageContent {
	return block.type === "image";
}

export interface OpenAICompletionsOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
	reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

interface OpenAICompatCacheControl {
	type: "ephemeral";
	ttl?: string;
}

type ResolvedOpenAICompletionsCompat = Omit<Required<OpenAICompletionsCompat>, "cacheControlFormat"> & {
	cacheControlFormat?: OpenAICompletionsCompat["cacheControlFormat"];
};

type ChatCompletionInstructionMessageParam = ChatCompletionDeveloperMessageParam | ChatCompletionSystemMessageParam;

type ChatCompletionTextPartWithCacheControl = ChatCompletionContentPartText & {
	cache_control?: OpenAICompatCacheControl;
};

type ChatCompletionToolWithCacheControl = OpenAI.Chat.Completions.ChatCompletionTool & {
	cache_control?: OpenAICompatCacheControl;
};

function resolveCacheRetention(cacheRetention?: CacheRetention): CacheRetention {
	if (cacheRetention) {
		return cacheRetention;
	}
	if (typeof process !== "undefined" && process.env.PI_CACHE_RETENTION === "long") {
		return "long";
	}
	return "short";
}

export const streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions> = (
	model: Model<"openai-completions">,
	context: Context,
	options?: OpenAICompletionsOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const apiKey = resolveOpenAICompletionsApiKey(model, options?.apiKey);
			const compat = getCompat(model);
			const cacheRetention = resolveCacheRetention(options?.cacheRetention);
			const cacheSessionId = cacheRetention === "none" ? undefined : options?.sessionId;
			const client = createClient(model, context, apiKey, options?.headers, cacheSessionId, compat);
			let params = buildParams(model, context, options, compat, cacheRetention);
			const nextParams = await options?.onPayload?.(params, model);
			if (nextParams !== undefined) {
				params = nextParams as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
			}
			const requestOptions = {
				...(options?.signal ? { signal: options.signal } : {}),
				...(options?.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
				maxRetries: options?.maxRetries ?? 0,
			};
			const { data: openaiStream, response } = await client.chat.completions
				.create(params, requestOptions)
				.withResponse();
			await options?.onResponse?.({ status: response.status, headers: headersToRecord(response.headers) }, model);
			stream.push({ type: "start", partial: output });

			interface StreamingToolCallBlock extends ToolCall {
				partialArgs?: string;
				streamIndex?: number;
			}
			type StreamingBlock = TextContent | ThinkingContent | StreamingToolCallBlock;
			type StreamingToolCallDelta = NonNullable<ChatCompletionChunk.Choice.Delta["tool_calls"]>[number];

			let textBlock: TextContent | null = null;
			let thinkingBlock: ThinkingContent | null = null;
			let hasFinishReason = false;
			const toolCallBlocksByIndex = new Map<number, StreamingToolCallBlock>();
			const toolCallBlocksById = new Map<string, StreamingToolCallBlock>();
			const blocks = output.content as StreamingBlock[];
			const getContentIndex = (block: StreamingBlock) => blocks.indexOf(block);
			const finishBlock = (block: StreamingBlock) => {
				const contentIndex = getContentIndex(block);
				if (contentIndex === -1) {
					return;
				}
				if (block.type === "text") {
					stream.push({
						type: "text_end",
						contentIndex,
						content: block.text,
						partial: output,
					});
				} else if (block.type === "thinking") {
					stream.push({
						type: "thinking_end",
						contentIndex,
						content: block.thinking,
						partial: output,
					});
				} else if (block.type === "toolCall") {
					block.arguments = parseStreamingJson(block.partialArgs);
					// Finalize in-place and strip the scratch buffers so replay only
					// carries parsed arguments.
					delete block.partialArgs;
					delete block.streamIndex;
					stream.push({
						type: "toolcall_end",
						contentIndex,
						toolCall: block,
						partial: output,
					});
				}
			};
			const ensureTextBlock = () => {
				if (!textBlock) {
					textBlock = { type: "text", text: "" };
					blocks.push(textBlock);
					stream.push({ type: "text_start", contentIndex: getContentIndex(textBlock), partial: output });
				}
				return textBlock;
			};
			const ensureThinkingBlock = (thinkingSignature: string) => {
				if (!thinkingBlock) {
					thinkingBlock = {
						type: "thinking",
						thinking: "",
						thinkingSignature,
					};
					blocks.push(thinkingBlock);
					stream.push({ type: "thinking_start", contentIndex: getContentIndex(thinkingBlock), partial: output });
				}
				return thinkingBlock;
			};
			const ensureToolCallBlock = (toolCall: StreamingToolCallDelta) => {
				const streamIndex = typeof toolCall.index === "number" ? toolCall.index : undefined;
				let block = streamIndex !== undefined ? toolCallBlocksByIndex.get(streamIndex) : undefined;
				if (!block && toolCall.id) {
					block = toolCallBlocksById.get(toolCall.id);
				}
				if (!block) {
					block = {
						type: "toolCall",
						id: toolCall.id || "",
						name: toolCall.function?.name || "",
						arguments: {},
						partialArgs: "",
						streamIndex,
					};
					if (streamIndex !== undefined) {
						toolCallBlocksByIndex.set(streamIndex, block);
					}
					if (toolCall.id) {
						toolCallBlocksById.set(toolCall.id, block);
					}
					blocks.push(block);
					stream.push({
						type: "toolcall_start",
						contentIndex: getContentIndex(block),
						partial: output,
					});
				}
				if (streamIndex !== undefined && block.streamIndex === undefined) {
					block.streamIndex = streamIndex;
					toolCallBlocksByIndex.set(streamIndex, block);
				}
				if (toolCall.id) {
					toolCallBlocksById.set(toolCall.id, block);
				}
				return block;
			};

			for await (const chunk of openaiStream) {
				if (!chunk || typeof chunk !== "object") continue;

				// OpenAI documents ChatCompletionChunk.id as the unique chat completion identifier,
				// and each chunk in a streamed completion carries the same id.
				output.responseId ||= chunk.id;
				if (typeof chunk.model === "string" && chunk.model.length > 0 && chunk.model !== model.id) {
					output.responseModel ||= chunk.model;
				}
				if (chunk.usage) {
					output.usage = parseChunkUsage(chunk.usage, model);
				}

				const choice = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
				if (!choice) continue;

				// Fallback: some providers (e.g., Moonshot) return usage
				// in choice.usage instead of the standard chunk.usage
				if (!chunk.usage && (choice as any).usage) {
					output.usage = parseChunkUsage((choice as any).usage, model);
				}

				if (choice.finish_reason) {
					const finishReasonResult = mapStopReason(choice.finish_reason);
					output.stopReason = finishReasonResult.stopReason;
					if (finishReasonResult.errorMessage) {
						output.errorMessage = finishReasonResult.errorMessage;
					}
					hasFinishReason = true;
				}

				if (choice.delta) {
					if (
						choice.delta.content !== null &&
						choice.delta.content !== undefined &&
						choice.delta.content.length > 0
					) {
						const block = ensureTextBlock();
						block.text += choice.delta.content;
						stream.push({
							type: "text_delta",
							contentIndex: getContentIndex(block),
							delta: choice.delta.content,
							partial: output,
						});
					}

					// Some endpoints return reasoning in reasoning_content (llama.cpp),
					// or reasoning (other openai compatible endpoints)
					// Use the first non-empty reasoning field to avoid duplication
					// (e.g., chutes.ai returns both reasoning_content and reasoning with same content)
					const reasoningFields = ["reasoning_content", "reasoning", "reasoning_text"];
					const deltaFields = choice.delta as Record<string, unknown>;
					let foundReasoningField: string | null = null;
					for (const field of reasoningFields) {
						const value = deltaFields[field];
						if (typeof value === "string" && value.length > 0) {
							foundReasoningField = field;
							break;
						}
					}

					if (foundReasoningField) {
						const delta = deltaFields[foundReasoningField];
						if (typeof delta === "string" && delta.length > 0) {
							const thinkingSignature =
								model.provider === "opencode-go" && foundReasoningField === "reasoning"
									? "reasoning_content"
									: foundReasoningField;
							const block = ensureThinkingBlock(thinkingSignature);
							block.thinking += delta;
							stream.push({
								type: "thinking_delta",
								contentIndex: getContentIndex(block),
								delta,
								partial: output,
							});
						}
					}

					if (choice?.delta?.tool_calls) {
						for (const toolCall of choice.delta.tool_calls) {
							const block = ensureToolCallBlock(toolCall);
							if (!block.id && toolCall.id) {
								block.id = toolCall.id;
								toolCallBlocksById.set(toolCall.id, block);
							}
							if (!block.name && toolCall.function?.name) {
								block.name = toolCall.function.name;
							}

							let delta = "";
							if (toolCall.function?.arguments) {
								delta = toolCall.function.arguments;
								block.partialArgs = (block.partialArgs ?? "") + toolCall.function.arguments;
								block.arguments = parseStreamingJson(block.partialArgs);
							}
							stream.push({
								type: "toolcall_delta",
								contentIndex: getContentIndex(block),
								delta,
								partial: output,
							});
						}
					}

					const reasoningDetails = (choice.delta as any).reasoning_details;
					if (reasoningDetails && Array.isArray(reasoningDetails)) {
						for (const detail of reasoningDetails) {
							if (detail.type === "reasoning.encrypted" && detail.id && detail.data) {
								const matchingToolCall = output.content.find(
									(b) => b.type === "toolCall" && b.id === detail.id,
								) as ToolCall | undefined;
								if (matchingToolCall) {
									matchingToolCall.thoughtSignature = JSON.stringify(detail);
								}
							}
						}
					}
				}
			}

			for (const block of blocks) {
				finishBlock(block);
			}
			if (options?.signal?.aborted) {
				throw new Error("Request was aborted");
			}

			if (output.stopReason === "aborted") {
				throw new Error("Request was aborted");
			}
			if (output.stopReason === "error") {
				throw new Error(output.errorMessage || "Provider returned an error stop reason");
			}
			if (!hasFinishReason) {
				throw new Error("Stream ended without finish_reason");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) {
				delete (block as { index?: number }).index;
				// Streaming scratch buffers are only used during parsing; never persist them.
				delete (block as { partialArgs?: string }).partialArgs;
				delete (block as { streamIndex?: number }).streamIndex;
			}
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			// Some providers via OpenRouter give additional information in this field.
			const rawMetadata = (error as any)?.error?.metadata?.raw;
			if (rawMetadata) output.errorMessage += `\n${rawMetadata}`;
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};

export const streamSimpleOpenAICompletions: StreamFunction<"openai-completions", SimpleStreamOptions> = (
	model: Model<"openai-completions">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = resolveOpenAICompletionsApiKey(model, options?.apiKey);

	const base = buildBaseOptions(model, options, apiKey);
	const clampedReasoning = options?.reasoning ? clampThinkingLevel(model, options.reasoning) : undefined;
	const reasoningEffort = clampedReasoning === "off" ? undefined : clampedReasoning;
	const toolChoice = (options as OpenAICompletionsOptions | undefined)?.toolChoice;

	return streamOpenAICompletions(model, context, {
		...base,
		reasoningEffort,
		toolChoice,
	} satisfies OpenAICompletionsOptions);
};

function createClient(
	model: Model<"openai-completions">,
	context: Context,
	apiKey: string,
	optionsHeaders?: Record<string, string>,
	sessionId?: string,
	compat: ResolvedOpenAICompletionsCompat = getCompat(model),
) {
	const headers = { ...model.headers };
	if (model.provider === "github-copilot") {
		const hasImages = hasCopilotVisionInput(context.messages);
		const copilotHeaders = buildCopilotDynamicHeaders({
			messages: context.messages,
			hasImages,
		});
		Object.assign(headers, copilotHeaders);
	}

	if (sessionId && compat.sendSessionAffinityHeaders) {
		headers.session_id = sessionId;
		headers["x-client-request-id"] = sessionId;
		headers["x-session-affinity"] = sessionId;
	}

	// Merge options headers last so they can override defaults
	if (optionsHeaders) {
		Object.assign(headers, optionsHeaders);
	}

	const defaultHeaders =
		model.provider === "cloudflare-ai-gateway"
			? {
					...headers,
					Authorization: headers.Authorization ?? null,
					"cf-aig-authorization": `Bearer ${apiKey}`,
				}
			: headers;

	return new OpenAI({
		apiKey,
		baseURL: isCloudflareProvider(model.provider) ? resolveCloudflareBaseUrl(model) : model.baseUrl,
		dangerouslyAllowBrowser: true,
		defaultHeaders,
	});
}

function applyToolParams(
	params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
	context: Context,
	compat: ResolvedOpenAICompletionsCompat,
): void {
	if (context.tools && context.tools.length > 0) {
		params.tools = convertTools(context.tools, compat);
		if (compat.zaiToolStream) {
			(params as any).tool_stream = true;
		}
	} else if (hasToolHistory(context.messages)) {
		// Anthropic (via LiteLLM/proxy) requires tools param when conversation has tool_calls/tool_results
		params.tools = [];
	}
}

function buildParams(
	model: Model<"openai-completions">,
	context: Context,
	options?: OpenAICompletionsOptions,
	compat: ResolvedOpenAICompletionsCompat = getCompat(model),
	cacheRetention: CacheRetention = resolveCacheRetention(options?.cacheRetention),
) {
	const messages = convertMessages(model, context, compat);
	const cacheControl = getCompatCacheControl(compat, cacheRetention);

	const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: model.id,
		messages,
		stream: true,
		prompt_cache_key:
			(model.baseUrl.includes("api.openai.com") && cacheRetention !== "none") ||
			(cacheRetention === "long" && compat.supportsLongCacheRetention)
				? clampOpenAIPromptCacheKey(options?.sessionId)
				: undefined,
		prompt_cache_retention: cacheRetention === "long" && compat.supportsLongCacheRetention ? "24h" : undefined,
	};

	if (compat.supportsUsageInStreaming !== false) {
		(params as any).stream_options = { include_usage: true };
	}

	if (compat.supportsStore) {
		params.store = false;
	}

	if (options?.maxTokens) {
		if (compat.maxTokensField === "max_tokens") {
			(params as any).max_tokens = options.maxTokens;
		} else {
			params.max_completion_tokens = options.maxTokens;
		}
	}

	if (options?.temperature !== undefined) {
		params.temperature = options.temperature;
	}

	applyToolParams(params, context, compat);

	if (cacheControl) {
		applyAnthropicCacheControl(messages, params.tools, cacheControl);
	}

	if (options?.toolChoice) {
		params.tool_choice = options.toolChoice;
	}

	applyReasoningParams(params, model, compat, options);
	applyProviderRoutingParams(params, model);

	return params;
}

/**
 * Map options.reasoningEffort onto the provider-specific thinking/reasoning
 * params. Each named thinkingFormat handles the request fully, except
 * "ant-ling" without a reasoningEffort, which (like unknown formats) falls
 * back to the generic OpenAI-style reasoning_effort handling.
 */
function applyReasoningParams(
	params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
	model: Model<"openai-completions">,
	compat: ResolvedOpenAICompletionsCompat,
	options?: OpenAICompletionsOptions,
): void {
	if (!model.reasoning) return;
	const requestedEffort = options?.reasoningEffort;
	const mappedEffort = requestedEffort ? (model.thinkingLevelMap?.[requestedEffort] ?? requestedEffort) : undefined;

	switch (compat.thinkingFormat) {
		case "zai":
		case "qwen":
			(params as any).enable_thinking = !!requestedEffort;
			return;
		case "qwen-chat-template":
			(params as any).chat_template_kwargs = {
				enable_thinking: !!requestedEffort,
				preserve_thinking: true,
			};
			return;
		case "deepseek":
			(params as any).thinking = { type: requestedEffort ? "enabled" : "disabled" };
			if (requestedEffort && compat.supportsReasoningEffort) {
				(params as any).reasoning_effort = mappedEffort;
			}
			return;
		case "openrouter": {
			// OpenRouter normalizes reasoning across providers via a nested reasoning object.
			const openRouterParams = params as typeof params & { reasoning?: { effort?: string } };
			if (requestedEffort) {
				openRouterParams.reasoning = { effort: mappedEffort };
			} else if (model.thinkingLevelMap?.off !== null) {
				openRouterParams.reasoning = { effort: model.thinkingLevelMap?.off ?? "none" };
			}
			return;
		}
		case "ant-ling": {
			if (!requestedEffort) break; // falls back to generic reasoning_effort handling
			const effort = model.thinkingLevelMap?.[requestedEffort];
			if (typeof effort === "string") {
				(params as typeof params & { reasoning?: { effort: string } }).reasoning = { effort };
			}
			return;
		}
		case "together": {
			const togetherParams = params as Omit<typeof params, "reasoning_effort"> & {
				reasoning?: { enabled: boolean };
				reasoning_effort?: string;
			};
			togetherParams.reasoning = { enabled: !!requestedEffort };
			if (requestedEffort && compat.supportsReasoningEffort) {
				togetherParams.reasoning_effort = mappedEffort;
			}
			return;
		}
		case "string-thinking": {
			const stringThinkingParams = params as typeof params & { thinking?: string };
			if (requestedEffort) {
				stringThinkingParams.thinking = mappedEffort;
			} else if (model.thinkingLevelMap?.off !== null) {
				stringThinkingParams.thinking = model.thinkingLevelMap?.off ?? "none";
			}
			return;
		}
		default:
			break;
	}

	// Generic OpenAI-style reasoning_effort
	if (!compat.supportsReasoningEffort) return;
	if (requestedEffort) {
		(params as any).reasoning_effort = mappedEffort;
	} else {
		const offValue = model.thinkingLevelMap?.off;
		if (typeof offValue === "string") {
			(params as any).reasoning_effort = offValue;
		}
	}
}

function applyProviderRoutingParams(
	params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
	model: Model<"openai-completions">,
): void {
	// OpenRouter provider routing preferences
	if (model.compat?.openRouterRouting) {
		(params as any).provider = model.compat.openRouterRouting;
	}

	// Vercel AI Gateway provider routing preferences
	if (model.baseUrl.includes("ai-gateway.vercel.sh") && model.compat?.vercelGatewayRouting) {
		const routing = model.compat.vercelGatewayRouting;
		if (routing.only || routing.order) {
			const gatewayOptions: Record<string, string[]> = {};
			if (routing.only) gatewayOptions.only = routing.only;
			if (routing.order) gatewayOptions.order = routing.order;
			(params as any).providerOptions = { gateway: gatewayOptions };
		}
	}
}

function getCompatCacheControl(
	compat: ResolvedOpenAICompletionsCompat,
	cacheRetention: CacheRetention,
): OpenAICompatCacheControl | undefined {
	if (compat.cacheControlFormat !== "anthropic" || cacheRetention === "none") {
		return undefined;
	}

	const ttl = cacheRetention === "long" && compat.supportsLongCacheRetention ? "1h" : undefined;
	return { type: "ephemeral", ...(ttl ? { ttl } : {}) };
}

function applyAnthropicCacheControl(
	messages: ChatCompletionMessageParam[],
	tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
	cacheControl: OpenAICompatCacheControl,
): void {
	addCacheControlToSystemPrompt(messages, cacheControl);
	addCacheControlToLastTool(tools, cacheControl);
	addCacheControlToLastConversationMessage(messages, cacheControl);
}

function addCacheControlToSystemPrompt(
	messages: ChatCompletionMessageParam[],
	cacheControl: OpenAICompatCacheControl,
): void {
	for (const message of messages) {
		if (message.role === "system" || message.role === "developer") {
			addCacheControlToInstructionMessage(message, cacheControl);
			return;
		}
	}
}

function addCacheControlToLastConversationMessage(
	messages: ChatCompletionMessageParam[],
	cacheControl: OpenAICompatCacheControl,
): void {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role === "user" || message.role === "assistant") {
			if (addCacheControlToMessage(message, cacheControl)) {
				return;
			}
		}
	}
}

function addCacheControlToLastTool(
	tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined,
	cacheControl: OpenAICompatCacheControl,
): void {
	if (!tools || tools.length === 0) {
		return;
	}

	const lastTool = tools[tools.length - 1] as ChatCompletionToolWithCacheControl;
	lastTool.cache_control = cacheControl;
}

function addCacheControlToInstructionMessage(
	message: ChatCompletionInstructionMessageParam,
	cacheControl: OpenAICompatCacheControl,
): boolean {
	return addCacheControlToTextContent(message, cacheControl);
}

function addCacheControlToMessage(
	message: ChatCompletionMessageParam,
	cacheControl: OpenAICompatCacheControl,
): boolean {
	if (message.role === "user" || message.role === "assistant") {
		return addCacheControlToTextContent(message, cacheControl);
	}
	return false;
}

function addCacheControlToTextContent(
	message:
		| ChatCompletionInstructionMessageParam
		| ChatCompletionAssistantMessageParam
		| Extract<ChatCompletionMessageParam, { role: "user" }>,
	cacheControl: OpenAICompatCacheControl,
): boolean {
	const content = message.content;
	if (typeof content === "string") {
		if (content.length === 0) {
			return false;
		}
		message.content = [
			{
				type: "text",
				text: content,
				cache_control: cacheControl,
			},
		] as ChatCompletionTextPartWithCacheControl[];
		return true;
	}

	if (!Array.isArray(content)) {
		return false;
	}

	for (let i = content.length - 1; i >= 0; i--) {
		const part = content[i];
		if (part?.type === "text") {
			const textPart = part as ChatCompletionTextPartWithCacheControl;
			textPart.cache_control = cacheControl;
			return true;
		}
	}

	return false;
}

function normalizeToolCallId(id: string, model: Model<"openai-completions">): string {
	// Handle pipe-separated IDs from OpenAI Responses API
	// Format: {call_id}|{id} where {id} can be 400+ chars with special chars (+, /, =)
	// These come from providers like github-copilot, openai-codex, opencode
	// Extract just the call_id part and normalize it
	if (id.includes("|")) {
		const [callId] = id.split("|");
		// Sanitize to allowed chars and truncate to 40 chars (OpenAI limit)
		return callId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
	}

	if (model.provider === "openai") return id.length > 40 ? id.slice(0, 40) : id;
	return id;
}

/** Returns null when the message converts to empty content and must be skipped. */
function convertUserMessage(msg: Extract<Message, { role: "user" }>): ChatCompletionMessageParam | null {
	if (typeof msg.content === "string") {
		return {
			role: "user",
			content: sanitizeSurrogates(msg.content),
		};
	}
	const content: ChatCompletionContentPart[] = msg.content.map((item): ChatCompletionContentPart => {
		if (item.type === "text") {
			return {
				type: "text",
				text: sanitizeSurrogates(item.text),
			} satisfies ChatCompletionContentPartText;
		} else {
			return {
				type: "image_url",
				image_url: {
					url: `data:${item.mimeType};base64,${item.data}`,
				},
			} satisfies ChatCompletionContentPartImage;
		}
	});
	if (content.length === 0) return null;
	return { role: "user", content };
}

function applyAssistantThinkingBlocks(
	assistantMsg: ChatCompletionAssistantMessageParam,
	msg: AssistantMessage,
	assistantTextParts: ChatCompletionContentPartText[],
	assistantText: string,
	model: Model<"openai-completions">,
	compat: ResolvedOpenAICompletionsCompat,
): void {
	const nonEmptyThinkingBlocks = msg.content
		.filter(isThinkingContentBlock)
		.filter((block) => block.thinking.trim().length > 0);
	if (nonEmptyThinkingBlocks.length > 0) {
		if (compat.requiresThinkingAsText) {
			// Convert thinking blocks to plain text (no tags to avoid model mimicking them)
			const thinkingText = nonEmptyThinkingBlocks
				.map((block) => sanitizeSurrogates(block.thinking))
				.join("\n\n");
			assistantMsg.content = [{ type: "text", text: thinkingText }, ...assistantTextParts];
		} else {
			// Always send assistant content as a plain string (OpenAI Chat Completions
			// API standard format). Sending as an array of {type:"text", text:"..."}
			// objects is non-standard and causes some models (e.g. DeepSeek V3.2 via
			// NVIDIA NIM) to mirror the content-block structure literally in their
			// output, producing recursive nesting like [{'type':'text','text':'[{...}]'}].
			if (assistantText.length > 0) {
				assistantMsg.content = assistantText;
			}

			// Use the signature from the first thinking block if available (for llama.cpp server + gpt-oss)
			let signature = nonEmptyThinkingBlocks[0].thinkingSignature;
			if (model.provider === "opencode-go" && signature === "reasoning") {
				signature = "reasoning_content";
			}
			if (signature && signature.length > 0) {
				(assistantMsg as any)[signature] = nonEmptyThinkingBlocks.map((block) => block.thinking).join("\n");
			}
		}
	} else if (assistantText.length > 0) {
		// Always send assistant content as a plain string (OpenAI Chat Completions
		// API standard format). Sending as an array of {type:"text", text:"..."}
		// objects is non-standard and causes some models (e.g. DeepSeek V3.2 via
		// NVIDIA NIM) to mirror the content-block structure literally in their
		// output, producing recursive nesting like [{'type':'text','text':'[{...}]'}].
		assistantMsg.content = assistantText;
	}
}

function applyAssistantToolCalls(assistantMsg: ChatCompletionAssistantMessageParam, msg: AssistantMessage): void {
	const toolCalls = msg.content.filter(isToolCallBlock);
	if (toolCalls.length === 0) return;
	assistantMsg.tool_calls = toolCalls.map((tc) => ({
		id: tc.id,
		type: "function" as const,
		function: {
			name: tc.name,
			arguments: JSON.stringify(tc.arguments),
		},
	}));
	const reasoningDetails = toolCalls
		.filter((tc) => tc.thoughtSignature)
		.map((tc) => {
			try {
				return JSON.parse(tc.thoughtSignature!);
			} catch {
				return null;
			}
		})
		.filter(Boolean);
	if (reasoningDetails.length > 0) {
		(assistantMsg as any).reasoning_details = reasoningDetails;
	}
}

/** Returns null when the message has no content and no tool calls and must be skipped. */
function convertAssistantMessage(
	msg: AssistantMessage,
	model: Model<"openai-completions">,
	compat: ResolvedOpenAICompletionsCompat,
): ChatCompletionAssistantMessageParam | null {
	// Some providers don't accept null content, use empty string instead
	const assistantMsg: ChatCompletionAssistantMessageParam = {
		role: "assistant",
		content: compat.requiresAssistantAfterToolResult ? "" : null,
	};

	const assistantTextParts = msg.content
		.filter(isTextContentBlock)
		.filter((block) => block.text.trim().length > 0)
		.map(
			(block) =>
				({
					type: "text",
					text: sanitizeSurrogates(block.text),
				}) satisfies ChatCompletionContentPartText,
		);
	const assistantText = assistantTextParts.map((part) => part.text).join("");

	applyAssistantThinkingBlocks(assistantMsg, msg, assistantTextParts, assistantText, model, compat);
	applyAssistantToolCalls(assistantMsg, msg);

	if (
		compat.requiresReasoningContentOnAssistantMessages &&
		model.reasoning &&
		(assistantMsg as { reasoning_content?: string }).reasoning_content === undefined
	) {
		(assistantMsg as { reasoning_content?: string }).reasoning_content = "";
	}
	// Skip assistant messages that have no content and no tool calls.
	// Some providers require "either content or tool_calls, but not none".
	// Other providers also don't accept empty assistant messages.
	// This handles aborted assistant responses that got no content.
	const content = assistantMsg.content;
	const hasContent =
		content !== null && content !== undefined && content.length > 0;
	if (!hasContent && !assistantMsg.tool_calls) {
		return null;
	}
	return assistantMsg;
}

/**
 * Convert a run of consecutive toolResult messages starting at startIndex.
 * Returns the converted messages (tool results plus, when images are present,
 * an optional synthetic assistant bridge and a user message carrying the
 * images), the index of the last consumed message, and the effective lastRole.
 */
function convertToolResultGroup(
	transformedMessages: Message[],
	startIndex: number,
	model: Model<"openai-completions">,
	compat: ResolvedOpenAICompletionsCompat,
): { messages: ChatCompletionMessageParam[]; endIndex: number; lastRole: "user" | "toolResult" } {
	const messages: ChatCompletionMessageParam[] = [];
	const imageBlocks: Array<{ type: "image_url"; image_url: { url: string } }> = [];
	let j = startIndex;

	for (; j < transformedMessages.length && transformedMessages[j].role === "toolResult"; j++) {
		const toolMsg = transformedMessages[j] as ToolResultMessage;

		// Extract text and image content
		const textResult = toolMsg.content
			.filter(isTextContentBlock)
			.map((block) => block.text)
			.join("\n");
		const hasImages = toolMsg.content.some((c) => c.type === "image");

		// Always send tool result with text (or placeholder if only images)
		const hasText = textResult.length > 0;
		// Some providers require the 'name' field in tool results
		const toolResultMsg: ChatCompletionToolMessageParam = {
			role: "tool",
			content: sanitizeSurrogates(hasText ? textResult : "(see attached image)"),
			tool_call_id: toolMsg.toolCallId,
		};
		if (compat.requiresToolResultName && toolMsg.toolName) {
			(toolResultMsg as any).name = toolMsg.toolName;
		}
		messages.push(toolResultMsg);

		if (hasImages && model.input.includes("image")) {
			for (const block of toolMsg.content) {
				if (isImageContentBlock(block)) {
					imageBlocks.push({
						type: "image_url",
						image_url: {
							url: `data:${block.mimeType};base64,${block.data}`,
						},
					});
				}
			}
		}
	}

	if (imageBlocks.length === 0) {
		return { messages, endIndex: j - 1, lastRole: "toolResult" };
	}

	if (compat.requiresAssistantAfterToolResult) {
		messages.push({
			role: "assistant",
			content: "I have processed the tool results.",
		});
	}
	messages.push({
		role: "user",
		content: [
			{
				type: "text",
				text: "Attached image(s) from tool result:",
			},
			...imageBlocks,
		],
	});
	return { messages, endIndex: j - 1, lastRole: "user" };
}

function addSystemPrompt(
	params: ChatCompletionMessageParam[],
	context: Context,
	model: Model<"openai-completions">,
	compat: ResolvedOpenAICompletionsCompat,
): void {
	if (!context.systemPrompt) return;
	const useDeveloperRole = model.reasoning && compat.supportsDeveloperRole;
	const role = useDeveloperRole ? "developer" : "system";
	params.push({ role, content: sanitizeSurrogates(context.systemPrompt) });
}

/**
 * Some providers don't allow user messages directly after tool results.
 * Insert a synthetic assistant message to bridge the gap.
 */
function appendAssistantBridgeIfNeeded(
	compat: ResolvedOpenAICompletionsCompat,
	lastRole: string | null,
	nextRole: Message["role"],
	params: ChatCompletionMessageParam[],
): void {
	if (!compat.requiresAssistantAfterToolResult) return;
	if (lastRole !== "toolResult" || nextRole !== "user") return;
	params.push({
		role: "assistant",
		content: "I have processed the tool results.",
	});
}

/**
 * Process a single transformed message and append converted params.
 * Returns the index of the last consumed message and the new lastRole.
 */
function processMessage(
	transformedMessages: Message[],
	index: number,
	lastRole: string | null,
	model: Model<"openai-completions">,
	compat: ResolvedOpenAICompletionsCompat,
	params: ChatCompletionMessageParam[],
): { index: number; lastRole: string | null } {
	const msg = transformedMessages[index];
	appendAssistantBridgeIfNeeded(compat, lastRole, msg.role, params);

	switch (msg.role) {
		case "user": {
			const userMsg = convertUserMessage(msg);
			// Skip user messages that convert to empty content (lastRole is intentionally not updated)
			if (!userMsg) return { index, lastRole };
			params.push(userMsg);
			return { index, lastRole: "user" };
		}
		case "assistant": {
			const assistantMsg = convertAssistantMessage(msg, model, compat);
			// Skip empty assistant messages (lastRole is intentionally not updated)
			if (!assistantMsg) return { index, lastRole };
			params.push(assistantMsg);
			return { index, lastRole: "assistant" };
		}
		case "toolResult": {
			const group = convertToolResultGroup(transformedMessages, index, model, compat);
			params.push(...group.messages);
			return { index: group.endIndex, lastRole: group.lastRole };
		}
	}
	// Unreachable: Message["role"] is "user" | "assistant" | "toolResult", covered above.
	return { index, lastRole };
}

export function convertMessages(
	model: Model<"openai-completions">,
	context: Context,
	compat: ResolvedOpenAICompletionsCompat,
): ChatCompletionMessageParam[] {
	const params: ChatCompletionMessageParam[] = [];
	addSystemPrompt(params, context, model, compat);

	const transformedMessages = transformMessages(context.messages, model, (id) => normalizeToolCallId(id, model));

	let lastRole: string | null = null;
	for (let i = 0; i < transformedMessages.length; i++) {
		const result = processMessage(transformedMessages, i, lastRole, model, compat, params);
		i = result.index;
		lastRole = result.lastRole;
	}

	return params;
}

function convertTools(
	tools: Tool[],
	compat: ResolvedOpenAICompletionsCompat,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools
		.filter((tool) => typeof tool.name === "string" && tool.name.length > 0)
		.map((tool) => ({
			type: "function",
			function: {
				name: tool.name,
				description: tool.description,
				parameters: normalizeToolSchema(tool.parameters),
				// Only include strict if provider supports it. Some reject unknown fields.
				...(compat.supportsStrictMode !== false && { strict: false }),
			},
		}));
}

function parseChunkUsage(
	rawUsage: {
		prompt_tokens?: number;
		completion_tokens?: number;
		prompt_cache_hit_tokens?: number;
		prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
	},
	model: Model<"openai-completions">,
): AssistantMessage["usage"] {
	const promptTokens = rawUsage.prompt_tokens || 0;
	const cacheReadTokens = rawUsage.prompt_tokens_details?.cached_tokens ?? rawUsage.prompt_cache_hit_tokens ?? 0;
	const cacheWriteTokens = rawUsage.prompt_tokens_details?.cache_write_tokens || 0;

	// Follow documented OpenAI/OpenRouter semantics: cached_tokens is cache-read
	// tokens (hits). OpenAI does not document or emit cache_write_tokens, but
	// OpenRouter-compatible providers can include it as a separate write count.
	// OpenRouter's own provider/tests affirm the separate mapping:
	// https://github.com/OpenRouterTeam/ai-sdk-provider/pull/409
	// Do not subtract writes from cached_tokens, otherwise spec-compliant
	// providers are under-reported. DS4 mirrors this contract too:
	// https://github.com/antirez/ds4/pull/29
	const input = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
	// OpenAI completion_tokens already includes reasoning_tokens.
	const outputTokens = rawUsage.completion_tokens || 0;
	const usage: AssistantMessage["usage"] = {
		input,
		output: outputTokens,
		cacheRead: cacheReadTokens,
		cacheWrite: cacheWriteTokens,
		totalTokens: input + outputTokens + cacheReadTokens + cacheWriteTokens,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	calculateCost(model, usage);
	return usage;
}

function mapStopReason(reason: ChatCompletionChunk.Choice["finish_reason"] | string): {
	stopReason: StopReason;
	errorMessage?: string;
} {
	if (reason === null) return { stopReason: "stop" };
	switch (reason) {
		case "stop":
		case "end":
			return { stopReason: "stop" };
		case "length":
			return { stopReason: "length" };
		case "function_call":
		case "tool_calls":
			return { stopReason: "toolUse" };
		case "content_filter":
			return { stopReason: "error", errorMessage: "Provider finish_reason: content_filter" };
		case "network_error":
			return { stopReason: "error", errorMessage: "Provider finish_reason: network_error" };
		default:
			return {
				stopReason: "error",
				errorMessage: `Provider finish_reason: ${reason}`,
			};
	}
}

/**
 * Detect compatibility settings from provider and baseUrl for known providers.
 * Provider takes precedence over URL-based detection since it's explicitly configured.
 * Returns a fully resolved OpenAICompletionsCompat object with all fields set.
 */
function detectCompat(model: Model<"openai-completions">): ResolvedOpenAICompletionsCompat {
	const provider = model.provider;
	const baseUrl = model.baseUrl;

	const isZai =
		provider === "zai" ||
		provider === "zai-coding-cn" ||
		baseUrl.includes("api.z.ai") ||
		baseUrl.includes("open.bigmodel.cn");
	const isTogether =
		provider === "together" || baseUrl.includes("api.together.ai") || baseUrl.includes("api.together.xyz");
	const isMoonshot = provider === "moonshotai" || provider === "moonshotai-cn" || baseUrl.includes("api.moonshot.");
	const isOpenRouter = provider === "openrouter" || baseUrl.includes("openrouter.ai");
	const isCloudflareWorkersAI = provider === "cloudflare-workers-ai" || baseUrl.includes("api.cloudflare.com");
	const isCloudflareAiGateway = provider === "cloudflare-ai-gateway" || baseUrl.includes("gateway.ai.cloudflare.com");
	const isNvidia = provider === "nvidia" || baseUrl.includes("integrate.api.nvidia.com");
	const isAntLing = provider === "ant-ling" || baseUrl.includes("api.ant-ling.com");

	const isNonStandard =
		isNvidia ||
		provider === "cerebras" ||
		baseUrl.includes("cerebras.ai") ||
		provider === "xai" ||
		baseUrl.includes("api.x.ai") ||
		isTogether ||
		baseUrl.includes("chutes.ai") ||
		baseUrl.includes("deepseek.com") ||
		isZai ||
		isMoonshot ||
		provider === "opencode" ||
		baseUrl.includes("opencode.ai") ||
		isCloudflareWorkersAI ||
		isCloudflareAiGateway ||
		isAntLing;

	const useMaxTokens =
		baseUrl.includes("chutes.ai") || isMoonshot || isCloudflareAiGateway || isTogether || isNvidia || isAntLing;

	const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");
	const isDeepSeek = provider === "deepseek" || baseUrl.includes("deepseek.com");
	const isOpenRouterDeveloperRoleModel =
		isOpenRouter && (model.id.startsWith("anthropic/") || model.id.startsWith("openai/"));
	const cacheControlFormat = provider === "openrouter" && model.id.startsWith("anthropic/") ? "anthropic" : undefined;

	return {
		supportsStore: !isNonStandard,
		supportsDeveloperRole: isOpenRouterDeveloperRoleModel || (!isNonStandard && !isOpenRouter),
		supportsReasoningEffort:
			!isGrok && !isZai && !isMoonshot && !isTogether && !isCloudflareAiGateway && !isNvidia && !isAntLing,
		supportsUsageInStreaming: true,
		maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
		requiresToolResultName: false,
		requiresAssistantAfterToolResult: false,
		requiresThinkingAsText: false,
		requiresReasoningContentOnAssistantMessages: isDeepSeek,
		thinkingFormat: isDeepSeek
			? "deepseek"
			: isZai
				? "zai"
				: isTogether
					? "together"
					: isAntLing
						? "ant-ling"
						: isOpenRouter
							? "openrouter"
							: "openai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		zaiToolStream: false,
		supportsStrictMode: !isMoonshot && !isTogether && !isCloudflareAiGateway && !isNvidia,
		cacheControlFormat,
		sendSessionAffinityHeaders: false,
		supportsLongCacheRetention: !(
			isTogether ||
			isCloudflareWorkersAI ||
			isCloudflareAiGateway ||
			isNvidia ||
			isAntLing
		),
	};
}

/**
 * Get resolved compatibility settings for a model.
 * Uses explicit model.compat if provided, otherwise auto-detects from provider/URL.
 */
function getCompat(model: Model<"openai-completions">): ResolvedOpenAICompletionsCompat {
	const detected = detectCompat(model);
	if (!model.compat) return detected;

	return {
		supportsStore: model.compat.supportsStore ?? detected.supportsStore,
		supportsDeveloperRole: model.compat.supportsDeveloperRole ?? detected.supportsDeveloperRole,
		supportsReasoningEffort: model.compat.supportsReasoningEffort ?? detected.supportsReasoningEffort,
		supportsUsageInStreaming: model.compat.supportsUsageInStreaming ?? detected.supportsUsageInStreaming,
		maxTokensField: model.compat.maxTokensField ?? detected.maxTokensField,
		requiresToolResultName: model.compat.requiresToolResultName ?? detected.requiresToolResultName,
		requiresAssistantAfterToolResult:
			model.compat.requiresAssistantAfterToolResult ?? detected.requiresAssistantAfterToolResult,
		requiresThinkingAsText: model.compat.requiresThinkingAsText ?? detected.requiresThinkingAsText,
		requiresReasoningContentOnAssistantMessages:
			model.compat.requiresReasoningContentOnAssistantMessages ??
			detected.requiresReasoningContentOnAssistantMessages,
		thinkingFormat: model.compat.thinkingFormat ?? detected.thinkingFormat,
		openRouterRouting: model.compat.openRouterRouting ?? {},
		vercelGatewayRouting: model.compat.vercelGatewayRouting ?? detected.vercelGatewayRouting,
		zaiToolStream: model.compat.zaiToolStream ?? detected.zaiToolStream,
		supportsStrictMode: model.compat.supportsStrictMode ?? detected.supportsStrictMode,
		cacheControlFormat: model.compat.cacheControlFormat ?? detected.cacheControlFormat,
		sendSessionAffinityHeaders: model.compat.sendSessionAffinityHeaders ?? detected.sendSessionAffinityHeaders,
		supportsLongCacheRetention: model.compat.supportsLongCacheRetention ?? detected.supportsLongCacheRetention,
	};
}
