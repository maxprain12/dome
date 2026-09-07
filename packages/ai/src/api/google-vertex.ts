import {
	type GenerateContentConfig,
	type GenerateContentParameters,
	type GenerateContentResponse,
	GoogleGenAI,
	type HttpOptions,
	type Part,
	ResourceScope,
	type ThinkingConfig,
	ThinkingLevel,
} from "@google/genai";
import { calculateCost, clampThinkingLevel } from "../models.js";
import type {
	Api,
	AssistantMessage,
	Context,
	Model,
	ProviderEnv,
	ProviderHeaders,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingBudgets,
	ThinkingContent,
	ToolCall,
} from "../types.js";
import { formatProviderError, normalizeProviderError } from "../utils/error-body.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { providerHeadersToRecord } from "../utils/headers.js";
import { getPiUserAgent } from "../utils/pi-user-agent.js";
import { getProviderEnvValue } from "../utils/provider-env.js";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.js";
import type { GoogleApiThinkingLevel, ResolvedGoogleThinkingLevel } from "./google-shared.js";
import {
	convertMessages,
	convertTools,
	isThinkingPart,
	mapStopReason,
	resolveGoogleFunctionCallingMode,
	resolveGoogleThinkingLevel,
	retainThoughtSignature,
	retryGoogleRequest,
	supportsGoogleStrictToolSampling,
} from "./google-shared.js";
import { buildBaseOptions } from "./simple-options.js";

export interface GoogleVertexOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "any";
	thinking?: {
		enabled: boolean;
		budgetTokens?: number; // -1 for dynamic, 0 to disable
		level?: GoogleApiThinkingLevel;
	};
	project?: string;
	location?: string;
}

const API_VERSION = "v1";
const GCP_VERTEX_CREDENTIALS_MARKER = "gcp-vertex-credentials";

const THINKING_LEVEL_MAP: Record<GoogleApiThinkingLevel, ThinkingLevel> = {
	THINKING_LEVEL_UNSPECIFIED: ThinkingLevel.THINKING_LEVEL_UNSPECIFIED,
	MINIMAL: ThinkingLevel.MINIMAL,
	LOW: ThinkingLevel.LOW,
	MEDIUM: ThinkingLevel.MEDIUM,
	HIGH: ThinkingLevel.HIGH,
};

// Counter for generating unique tool call IDs
let toolCallCounter = 0;

export const stream: StreamFunction<"google-vertex", GoogleVertexOptions> = (
	model: Model<"google-vertex">,
	context: Context,
	options?: GoogleVertexOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output = createInitialOutput(model);
		try {
			validateOptions(options);
			const client = createVertexClient(model, options);
			const params = await resolveParams(model, context, options);
			const googleStream = await retryGoogleRequest(
				() => client.models.generateContentStream(params),
				options,
			);

			stream.push({ type: "start", partial: output });
			const state = createStreamState();
			for await (const chunk of googleStream) {
				processChunk(chunk, output, state, stream, model);
			}
			finalizeStream(stream, output, state, options);
		} catch (error) {
			handleStreamError(output, options, error, stream);
		}
	})();

	return stream;
};

interface StreamState {
	currentBlock: TextContent | ThinkingContent | null;
}

function createInitialOutput(model: Model<"google-vertex">): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "google-vertex" as Api,
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
		stopReason: "pending",
		timestamp: Date.now(),
	};
}

function createStreamState(): StreamState {
	return { currentBlock: null };
}

function validateOptions(options?: GoogleVertexOptions): void {
	if (options?.fetch && options.fetch !== globalThis.fetch) {
		throw new Error("Custom fetch is not supported by the Google Vertex adapter");
	}
}

function createVertexClient(model: Model<"google-vertex">, options?: GoogleVertexOptions): GoogleGenAI {
	const apiKey = resolveApiKey(options);
	return apiKey
		? createClientWithApiKey(model, apiKey, options?.headers)
		: createClient(model, resolveProject(options), resolveLocation(options), options?.headers, options?.env);
}

async function resolveParams(
	model: Model<"google-vertex">,
	context: Context,
	options?: GoogleVertexOptions,
): Promise<GenerateContentParameters> {
	let params = buildParams(model, context, options);
	const nextParams = await options?.onPayload?.(params, model);
	if (nextParams !== undefined) {
		params = nextParams as GenerateContentParameters;
	}
	return params;
}

function processChunk(
	chunk: GenerateContentResponse,
	output: AssistantMessage,
	state: StreamState,
	stream: AssistantMessageEventStream,
	model: Model<"google-vertex">,
): void {
	output.responseId ||= chunk.responseId;
	const candidate = chunk.candidates?.[0];
	if (candidate?.content?.parts) {
		for (const part of candidate.content.parts) {
			if (part.text !== undefined) {
				handleTextPart(part, output, state, stream);
			}
			if (part.functionCall) {
				handleFunctionCallPart(part, output, state, stream);
			}
		}
	}
	applyFinishReason(candidate, output);
	applyUsageMetadata(chunk.usageMetadata, model, output);
}

function handleTextPart(
	part: Part,
	output: AssistantMessage,
	state: StreamState,
	stream: AssistantMessageEventStream,
): void {
	if (part.text === undefined) return;
	const isThinking = isThinkingPart(part);
	if (!shouldKeepBlock(state.currentBlock, isThinking)) {
		closeCurrentBlock(state, output, stream);
		openBlock(state, output, stream, isThinking);
	}
	appendTextDelta(part, state, output, stream, isThinking);
}

function shouldKeepBlock(
	currentBlock: TextContent | ThinkingContent | null,
	isThinking: boolean,
): boolean {
	if (!currentBlock) return false;
	return isThinking ? currentBlock.type === "thinking" : currentBlock.type === "text";
}

function closeCurrentBlock(
	state: StreamState,
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
): void {
	const block = state.currentBlock;
	if (!block) return;
	if (block.type === "text") {
		stream.push({
			type: "text_end",
			contentIndex: output.content.length - 1,
			content: block.text,
			partial: output,
		});
		return;
	}
	stream.push({
		type: "thinking_end",
		contentIndex: output.content.length - 1,
		content: block.thinking,
		partial: output,
	});
}

function openBlock(
	state: StreamState,
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	isThinking: boolean,
): void {
	if (isThinking) {
		state.currentBlock = { type: "thinking", thinking: "", thinkingSignature: undefined };
		output.content.push(state.currentBlock);
		stream.push({
			type: "thinking_start",
			contentIndex: output.content.length - 1,
			partial: output,
		});
		return;
	}
	state.currentBlock = { type: "text", text: "" };
	output.content.push(state.currentBlock);
	stream.push({
		type: "text_start",
		contentIndex: output.content.length - 1,
		partial: output,
	});
}

function appendTextDelta(
	part: Part,
	state: StreamState,
	output: AssistantMessage,
	stream: AssistantMessageEventStream,
	isThinking: boolean,
): void {
	if (part.text === undefined) return;
	const block = state.currentBlock;
	if (!block) return;
	const contentIndex = output.content.length - 1;
	if (isThinking) {
		const thinkingBlock = block as ThinkingContent;
		thinkingBlock.thinking += part.text;
		thinkingBlock.thinkingSignature = retainThoughtSignature(
			thinkingBlock.thinkingSignature,
			part.thoughtSignature,
		);
		stream.push({ type: "thinking_delta", contentIndex, delta: part.text, partial: output });
		return;
	}
	const textBlock = block as TextContent;
	textBlock.text += part.text;
	textBlock.textSignature = retainThoughtSignature(textBlock.textSignature, part.thoughtSignature);
	stream.push({ type: "text_delta", contentIndex, delta: part.text, partial: output });
}

function handleFunctionCallPart(
	part: Part,
	output: AssistantMessage,
	state: StreamState,
	stream: AssistantMessageEventStream,
): void {
	if (!part.functionCall) return;
	closeCurrentBlock(state, output, stream);
	state.currentBlock = null;

	const providedId = part.functionCall.id;
	const needsNewId = !providedId || output.content.some((b) => b.type === "toolCall" && b.id === providedId);
	const toolCallId = needsNewId
		? `${part.functionCall.name}_${Date.now()}_${++toolCallCounter}`
		: providedId;

	const toolCall: ToolCall = {
		type: "toolCall",
		id: toolCallId,
		name: part.functionCall.name || "",
		arguments: (part.functionCall.args as Record<string, any>) ?? {},
		...(part.thoughtSignature && { thoughtSignature: part.thoughtSignature }),
	};

	output.content.push(toolCall);
	stream.push({ type: "toolcall_start", contentIndex: output.content.length - 1, partial: output });
	stream.push({
		type: "toolcall_delta",
		contentIndex: output.content.length - 1,
		delta: JSON.stringify(toolCall.arguments),
		partial: output,
	});
	stream.push({ type: "toolcall_end", contentIndex: output.content.length - 1, toolCall, partial: output });
}

function applyFinishReason(
	candidate: NonNullable<GenerateContentResponse["candidates"]>[number] | undefined,
	output: AssistantMessage,
): void {
	if (!candidate?.finishReason) return;
	output.rawStopReason = candidate.finishReason;
	output.stopReason = mapStopReason(candidate.finishReason);
	if (output.content.some((b) => b.type === "toolCall") && output.stopReason === "stop") {
		output.stopReason = "toolUse";
	}
}

function applyUsageMetadata(
	metadata: GenerateContentResponse["usageMetadata"],
	model: Model<"google-vertex">,
	output: AssistantMessage,
): void {
	if (!metadata) return;
	output.usage = {
		input: (metadata.promptTokenCount || 0) - (metadata.cachedContentTokenCount || 0),
		output: (metadata.candidatesTokenCount || 0) + (metadata.thoughtsTokenCount || 0),
		cacheRead: metadata.cachedContentTokenCount || 0,
		cacheWrite: 0,
		reasoning: metadata.thoughtsTokenCount || 0,
		totalTokens: metadata.totalTokenCount || 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	calculateCost(model, output.usage);
}

function finalizeStream(
	stream: AssistantMessageEventStream,
	output: AssistantMessage,
	state: StreamState,
	options?: GoogleVertexOptions,
): void {
	closeCurrentBlock(state, output, stream);

	if (options?.signal?.aborted) {
		throw new Error("Request was aborted");
	}
	if (output.stopReason === "pending") {
		throw new Error("Google Vertex stream ended without a finish reason");
	}
	if (output.stopReason === "aborted" || output.stopReason === "error") {
		const errorMessage = output.rawStopReason
			? `Provider stopped with: ${output.rawStopReason}`
			: "An unknown error occurred";
		throw new Error(errorMessage);
	}

	stream.push({ type: "done", reason: output.stopReason, message: output });
	stream.end();
}

function handleStreamError(
	output: AssistantMessage,
	options: GoogleVertexOptions | undefined,
	error: unknown,
	stream: AssistantMessageEventStream,
): void {
	// Remove internal index property used during streaming
	for (const block of output.content) {
		if ("index" in block) {
			delete (block as { index?: number }).index;
		}
	}
	output.stopReason = options?.signal?.aborted ? "aborted" : "error";
	output.errorMessage = formatProviderError(normalizeProviderError(error));
	stream.push({ type: "error", reason: output.stopReason, error: output });
	stream.end();
}

export const streamSimple: StreamFunction<"google-vertex", SimpleStreamOptions> = (
	model: Model<"google-vertex">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const base = {
		...buildBaseOptions(model, context, options, undefined),
		toolChoice: options?.toolChoice,
	} satisfies GoogleVertexOptions;
	if (!options?.reasoning) {
		return stream(model, context, {
			...base,
			thinking: { enabled: false },
		} satisfies GoogleVertexOptions);
	}

	const clampedReasoning = clampThinkingLevel(model, options.reasoning);
	const resolvedLevel = resolveGoogleThinkingLevel(model, clampedReasoning);
	const geminiModel = model as unknown as Model<"google-generative-ai">;

	if (isGemini3ProModel(geminiModel) || isGemini3FlashModel(geminiModel)) {
		return stream(model, context, {
			...base,
			thinking: {
				enabled: true,
				level: getGemini3ThinkingLevel(resolvedLevel, geminiModel),
			},
		} satisfies GoogleVertexOptions);
	}

	return stream(model, context, {
		...base,
		thinking: {
			enabled: true,
			budgetTokens: getGoogleBudget(geminiModel, resolvedLevel, options.thinkingBudgets),
		},
	} satisfies GoogleVertexOptions);
};

function createClient(
	model: Model<"google-vertex">,
	project: string,
	location: string,
	optionsHeaders?: ProviderHeaders,
	env?: ProviderEnv,
): GoogleGenAI {
	const googleAuthOptions = buildGoogleAuthOptions(env);
	return new GoogleGenAI({
		vertexai: true,
		project,
		location,
		apiVersion: API_VERSION,
		...(googleAuthOptions ? { googleAuthOptions } : {}),
		httpOptions: buildHttpOptions(model, optionsHeaders),
	});
}

function createClientWithApiKey(
	model: Model<"google-vertex">,
	apiKey: string,
	optionsHeaders?: ProviderHeaders,
): GoogleGenAI {
	return new GoogleGenAI({
		vertexai: true,
		apiKey,
		apiVersion: API_VERSION,
		httpOptions: buildHttpOptions(model, optionsHeaders),
	});
}

function buildHttpOptions(model: Model<"google-vertex">, optionsHeaders?: ProviderHeaders): HttpOptions | undefined {
	const httpOptions: HttpOptions = {};
	const baseUrl = resolveCustomBaseUrl(model.baseUrl);
	if (baseUrl) {
		httpOptions.baseUrl = baseUrl;
		httpOptions.baseUrlResourceScope = ResourceScope.COLLECTION;
		if (baseUrlIncludesApiVersion(baseUrl)) {
			httpOptions.apiVersion = "";
		}
	}

	const headers = providerHeadersToRecord({ "User-Agent": getPiUserAgent(), ...model.headers, ...optionsHeaders });
	if (headers) {
		httpOptions.headers = headers;
	}

	return Object.keys(httpOptions).length > 0 ? httpOptions : undefined;
}

function resolveCustomBaseUrl(baseUrl: string): string | undefined {
	const trimmed = baseUrl.trim();
	if (!trimmed || trimmed.includes("{location}")) {
		return undefined;
	}
	return trimmed;
}

function baseUrlIncludesApiVersion(baseUrl: string): boolean {
	try {
		const url = new URL(baseUrl);
		return url.pathname.split("/").some((part) => /^v\d+(?:beta\d*)?$/.test(part));
	} catch {
		return /(?:^|\/)v\d+(?:beta\d*)?(?:\/|$)/.test(baseUrl);
	}
}

function buildGoogleAuthOptions(env?: ProviderEnv): { keyFilename: string } | undefined {
	const keyFilename = getProviderEnvValue("GOOGLE_APPLICATION_CREDENTIALS", env);
	return keyFilename ? { keyFilename } : undefined;
}

function resolveApiKey(options?: GoogleVertexOptions): string | undefined {
	const apiKey = options?.apiKey?.trim();
	if (!apiKey || apiKey === GCP_VERTEX_CREDENTIALS_MARKER || isPlaceholderApiKey(apiKey)) {
		return undefined;
	}
	return apiKey;
}

function isPlaceholderApiKey(apiKey: string): boolean {
	return /^<[^>]+>$/.test(apiKey);
}

function resolveProject(options?: GoogleVertexOptions): string {
	const project =
		options?.project ||
		getProviderEnvValue("GOOGLE_CLOUD_PROJECT", options?.env) ||
		getProviderEnvValue("GCLOUD_PROJECT", options?.env);
	if (!project) {
		throw new Error(
			"Vertex AI requires a project ID. Set GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT or pass project in options.",
		);
	}
	return project;
}

function resolveLocation(options?: GoogleVertexOptions): string {
	const location = options?.location || getProviderEnvValue("GOOGLE_CLOUD_LOCATION", options?.env);
	if (!location) {
		throw new Error("Vertex AI requires a location. Set GOOGLE_CLOUD_LOCATION or pass location in options.");
	}
	return location;
}

function buildParams(
	model: Model<"google-vertex">,
	context: Context,
	options: GoogleVertexOptions = {},
): GenerateContentParameters {
	const contents = convertMessages(model, context);

	const generationConfig: GenerateContentConfig = {};
	if (options.temperature !== undefined) {
		generationConfig.temperature = options.temperature;
	}
	if (options.maxTokens !== undefined) {
		generationConfig.maxOutputTokens = options.maxTokens;
	}

	const supportsStrictMode = supportsGoogleStrictToolSampling(model.id);
	const functionCallingMode = context.tools?.length
		? resolveGoogleFunctionCallingMode(context.tools, options.toolChoice, supportsStrictMode)
		: undefined;
	const config: GenerateContentConfig = {
		...(Object.keys(generationConfig).length > 0 && generationConfig),
		...(context.systemPrompt && { systemInstruction: sanitizeSurrogates(context.systemPrompt) }),
		...(context.tools &&
			context.tools.length > 0 && {
				tools: convertTools(context.tools, false, supportsStrictMode),
			}),
		...(functionCallingMode !== undefined && {
			toolConfig: { functionCallingConfig: { mode: functionCallingMode } },
		}),
	};

	if (options.thinking?.enabled && model.reasoning) {
		const thinkingConfig: ThinkingConfig = { includeThoughts: true };
		if (options.thinking.level !== undefined) {
			thinkingConfig.thinkingLevel = THINKING_LEVEL_MAP[options.thinking.level];
		} else if (options.thinking.budgetTokens !== undefined) {
			thinkingConfig.thinkingBudget = options.thinking.budgetTokens;
		}
		config.thinkingConfig = thinkingConfig;
	} else if (model.reasoning && options.thinking && !options.thinking.enabled) {
		config.thinkingConfig = getDisabledThinkingConfig(model);
	}

	if (options.signal) {
		if (options.signal.aborted) {
			throw new Error("Request aborted");
		}
		config.abortSignal = options.signal;
	}

	const params: GenerateContentParameters = {
		model: model.id,
		contents,
		config,
	};

	return params;
}

function isGemini3ProModel(model: Model<"google-generative-ai">): boolean {
	return /gemini-3(?:\.\d+)?-pro/.test(model.id.toLowerCase());
}

function isGemini3FlashModel(model: Model<"google-generative-ai">): boolean {
	const id = model.id.toLowerCase();
	return /gemini-3(?:\.\d+)?-flash/.test(id) || id === "gemini-flash-latest" || id === "gemini-flash-lite-latest";
}

function getDisabledThinkingConfig(model: Model<"google-vertex">): ThinkingConfig {
	// Google docs: Gemini 3.1 Pro cannot disable thinking, and Gemini 3 Flash / Flash-Lite
	// do not support full thinking-off either. For Gemini 3 models, use the lowest supported
	// thinkingLevel without includeThoughts so hidden thinking remains invisible to pi.
	const geminiModel = model as unknown as Model<"google-generative-ai">;
	if (isGemini3ProModel(geminiModel)) {
		return { thinkingLevel: ThinkingLevel.LOW };
	}
	if (isGemini3FlashModel(geminiModel)) {
		return { thinkingLevel: ThinkingLevel.MINIMAL };
	}

	// Gemini 2.x supports disabling via thinkingBudget = 0.
	return { thinkingBudget: 0 };
}

function getGemini3ThinkingLevel(
	effort: ResolvedGoogleThinkingLevel,
	model: Model<"google-generative-ai">,
): GoogleApiThinkingLevel {
	if (isGemini3ProModel(model)) {
		switch (effort) {
			case "minimal":
			case "low":
				return "LOW";
			case "medium":
			case "high":
				return "HIGH";
		}
	}
	switch (effort) {
		case "minimal":
			return "MINIMAL";
		case "low":
			return "LOW";
		case "medium":
			return "MEDIUM";
		case "high":
			return "HIGH";
	}
}

function getGoogleBudget(
	model: Model<"google-generative-ai">,
	level: ResolvedGoogleThinkingLevel,
	customBudgets?: ThinkingBudgets,
): number {
	if (customBudgets?.[level] !== undefined) {
		return customBudgets[level]!;
	}

	if (model.id.includes("2.5-pro")) {
		const budgets: Record<ResolvedGoogleThinkingLevel, number> = {
			minimal: 128,
			low: 2048,
			medium: 8192,
			high: 32768,
		};
		return budgets[level];
	}

	if (model.id.includes("2.5-flash")) {
		const budgets: Record<ResolvedGoogleThinkingLevel, number> = {
			minimal: 128,
			low: 2048,
			medium: 8192,
			high: 24576,
		};
		return budgets[level];
	}

	return -1;
}
