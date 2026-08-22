import type { Message, ToolCall } from "@dome/ai";
import type { AgentMessage } from "../../types.js";

/** File paths touched by a session branch or compaction range. */
export interface FileOperations {
	/** Files read but not necessarily modified. */
	read: Set<string>;
	/** Files written by full-file write operations. */
	written: Set<string>;
	/** Files modified by edit operations. */
	edited: Set<string>;
}

/** Create an empty file-operation accumulator. */
export function createFileOps(): FileOperations {
	return {
		read: new Set(),
		written: new Set(),
		edited: new Set(),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isToolCallBlock(block: unknown): block is ToolCall {
	if (!isRecord(block)) return false;
	if (block.type !== "toolCall") return false;
	if (typeof block.name !== "string") return false;
	return isRecord(block.arguments);
}

function toolCallPath(args: Record<string, unknown>): string | undefined {
	return typeof args.path === "string" ? args.path : undefined;
}

function recordToolCallFileOp(name: string, path: string, fileOps: FileOperations): void {
	switch (name) {
		case "read":
			fileOps.read.add(path);
			break;
		case "write":
			fileOps.written.add(path);
			break;
		case "edit":
			fileOps.edited.add(path);
			break;
	}
}

/** Assistant message content blocks, or null when the message cannot yield file ops. */
function assistantContentBlocks(message: AgentMessage): unknown[] | null {
	if (message.role !== "assistant") return null;
	if (!("content" in message) || !Array.isArray(message.content)) return null;
	return message.content;
}

function applyToolCallFileOp(block: ToolCall, fileOps: FileOperations): void {
	const path = toolCallPath(block.arguments);
	if (!path) return;
	recordToolCallFileOp(block.name, path, fileOps);
}

/** Add file operations from assistant tool calls to an accumulator. */
export function extractFileOpsFromMessage(message: AgentMessage, fileOps: FileOperations): void {
	const content = assistantContentBlocks(message);
	if (!content) return;

	for (const block of content) {
		if (!isToolCallBlock(block)) continue;
		applyToolCallFileOp(block, fileOps);
	}
}

/** Compute sorted read-only and modified file lists from accumulated operations. */
export function computeFileLists(fileOps: FileOperations): { readFiles: string[]; modifiedFiles: string[] } {
	const modified = new Set([...fileOps.edited, ...fileOps.written]);
	const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort((a, b) => a.localeCompare(b));
	const modifiedFiles = [...modified].sort((a, b) => a.localeCompare(b));
	return { readFiles: readOnly, modifiedFiles };
}

/** Format file lists as summary metadata tags. */
export function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
	const sections: string[] = [];
	if (readFiles.length > 0) {
		sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
	}
	if (modifiedFiles.length > 0) {
		sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
	}
	if (sections.length === 0) return "";
	return `\n\n${sections.join("\n\n")}`;
}

const TOOL_RESULT_MAX_CHARS = 2000;

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
		return "[unserializable]";
	}
}

function truncateForSummary(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	const truncatedChars = text.length - maxChars;
	return `${text.slice(0, maxChars)}\n\n[... ${truncatedChars} more characters truncated]`;
}

function formatToolCall(block: ToolCall): string {
	const args = block.arguments as Record<string, unknown>;
	const argsStr = Object.entries(args)
		.map(([k, v]) => `${k}=${safeJsonStringify(v)}`)
		.join(", ");
	return `${block.name}(${argsStr})`;
}

function joinTextContent(content: readonly { type: string }[]): string {
	return content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("");
}

function serializeUserMessage(msg: Extract<Message, { role: "user" }>): string[] {
	const content = typeof msg.content === "string" ? msg.content : joinTextContent(msg.content);
	return content ? [`[User]: ${content}`] : [];
}

interface AssistantContentParts {
	textParts: string[];
	thinkingParts: string[];
	toolCalls: string[];
}

function collectAssistantContentParts(content: Extract<Message, { role: "assistant" }>["content"]): AssistantContentParts {
	const textParts: string[] = [];
	const thinkingParts: string[] = [];
	const toolCalls: string[] = [];
	for (const block of content) {
		switch (block.type) {
			case "text":
				textParts.push(block.text);
				break;
			case "thinking":
				thinkingParts.push(block.thinking);
				break;
			case "toolCall":
				toolCalls.push(formatToolCall(block));
				break;
		}
	}
	return { textParts, thinkingParts, toolCalls };
}

function formatAssistantContentParts(parts: AssistantContentParts): string[] {
	const lines: string[] = [];
	if (parts.thinkingParts.length > 0) {
		lines.push(`[Assistant thinking]: ${parts.thinkingParts.join("\n")}`);
	}
	if (parts.textParts.length > 0) {
		lines.push(`[Assistant]: ${parts.textParts.join("\n")}`);
	}
	if (parts.toolCalls.length > 0) {
		lines.push(`[Assistant tool calls]: ${parts.toolCalls.join("; ")}`);
	}
	return lines;
}

function serializeAssistantMessage(msg: Extract<Message, { role: "assistant" }>): string[] {
	return formatAssistantContentParts(collectAssistantContentParts(msg.content));
}

function serializeToolResultMessage(msg: Extract<Message, { role: "toolResult" }>): string[] {
	const content = joinTextContent(msg.content);
	return content ? [`[Tool result]: ${truncateForSummary(content, TOOL_RESULT_MAX_CHARS)}`] : [];
}

function serializeMessage(msg: Message): string[] {
	switch (msg.role) {
		case "user":
			return serializeUserMessage(msg);
		case "assistant":
			return serializeAssistantMessage(msg);
		case "toolResult":
			return serializeToolResultMessage(msg);
	}
}

/** Serialize LLM messages to plain text for summarization prompts. */
export function serializeConversation(messages: Message[]): string {
	const parts: string[] = [];
	for (const msg of messages) {
		parts.push(...serializeMessage(msg));
	}
	return parts.join("\n\n");
}
