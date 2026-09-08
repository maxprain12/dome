import type { AssistantMessage, Context, Message, Tool, ToolResultMessage } from "../types.js";

type ToolNameNormalizer = (name: string) => string;

const identityToolName: ToolNameNormalizer = (name) => name;

function collectAssistantToolNames(
	message: AssistantMessage,
	usedNames: Set<string>,
	normalizeName: ToolNameNormalizer,
): void {
	for (const block of message.content) {
		if (block.type === "toolCall") usedNames.add(normalizeName(block.name));
	}
}

function collectToolResultDeferredNames(
	message: ToolResultMessage,
	usedNames: Set<string>,
	deferredNames: Set<string>,
	normalizeName: ToolNameNormalizer,
): void {
	for (const name of message.addedToolNames ?? []) {
		const normalizedName = normalizeName(name);
		if (!usedNames.has(normalizedName)) deferredNames.add(normalizedName);
	}
}

function collectDeferredToolNames(
	messages: Message[],
	normalizeName: ToolNameNormalizer,
): Set<string> {
	const usedNames = new Set<string>();
	const deferredNames = new Set<string>();
	for (const message of messages) {
		if (message.role === "assistant") {
			collectAssistantToolNames(message, usedNames, normalizeName);
		} else if (message.role === "toolResult") {
			collectToolResultDeferredNames(message, usedNames, deferredNames, normalizeName);
		}
	}
	return deferredNames;
}

/** Split current tools into prefix and transcript-loaded definitions. */
export function splitDeferredTools(
	context: Context,
	enabled: boolean,
	normalizeName: ToolNameNormalizer = identityToolName,
): { immediate: Tool[]; deferred: Map<string, Tool> } {
	const uniqueTools = new Map<string, Tool>();
	for (const tool of context.tools ?? []) uniqueTools.set(normalizeName(tool.name), tool);
	if (!enabled) return { immediate: [...uniqueTools.values()], deferred: new Map() };

	const deferredNames = collectDeferredToolNames(context.messages, normalizeName);

	const immediate: Tool[] = [];
	const deferred = new Map<string, Tool>();
	for (const [name, tool] of uniqueTools) {
		if (deferredNames.has(name)) deferred.set(name, tool);
		else immediate.push(tool);
	}
	return { immediate, deferred };
}
