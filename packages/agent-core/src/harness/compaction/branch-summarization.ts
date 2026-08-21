import type { Model } from "@dome/ai";
import { completeSimple } from "@dome/ai";
import type { AgentMessage } from "../../types.js";
import {
	convertToLlm,
	createBranchSummaryMessage,
	createCompactionSummaryMessage,
	createCustomMessage,
} from "../messages.js";
import type { BranchSummaryResult, Session, SessionTreeEntry } from "../types.js";
import { BranchSummaryError, err, ok, type Result, SessionError } from "../types.js";
import { estimateTokens, SUMMARIZATION_SYSTEM_PROMPT } from "./compaction.js";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	type FileOperations,
	formatFileOperations,
	serializeConversation,
} from "./utils.js";

/** File-operation details stored on generated branch summary entries. */
export interface BranchSummaryDetails {
	/** Files read while exploring the summarized branch. */
	readFiles: string[];
	/** Files modified while exploring the summarized branch. */
	modifiedFiles: string[];
}

export type { FileOperations } from "./utils.js";

/** Prepared branch content for summarization. */
export interface BranchPreparation {
	/** Messages selected for the branch summary. */
	messages: AgentMessage[];
	/** File operations extracted from the branch. */
	fileOps: FileOperations;
	/** Estimated token count for selected messages. */
	totalTokens: number;
}

/** Entries selected for branch summarization. */
export interface CollectEntriesResult {
	/** Entries to summarize in chronological order. */
	entries: SessionTreeEntry[];
	/** Deepest common ancestor between the previous leaf and target entry. */
	commonAncestorId: string | null;
}

/** Options for generating a branch summary. */
export interface GenerateBranchSummaryOptions {
	/** Model used for summarization. */
	model: Model<any>;
	/** API key forwarded to the provider. */
	apiKey: string;
	/** Optional request headers forwarded to the provider. */
	headers?: Record<string, string>;
	/** Abort signal for the summarization request. */
	signal: AbortSignal;
	/** Optional instructions appended to or replacing the default prompt. */
	customInstructions?: string;
	/** Replace the default prompt with custom instructions instead of appending them. */
	replaceInstructions?: boolean;
	/** Tokens reserved for prompt and model output. Defaults to 16384. */
	reserveTokens?: number;
}

/** Collect entries that should be summarized before navigating to a different session tree entry. */
export async function collectEntriesForBranchSummary(
	session: Session,
	oldLeafId: string | null,
	targetId: string,
): Promise<CollectEntriesResult> {
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}
	const oldPath = new Set((await session.getBranch(oldLeafId)).map((e) => e.id));
	const targetPath = await session.getBranch(targetId);
	let commonAncestorId: string | null = null;
	for (let i = targetPath.length - 1; i >= 0; i--) {
		if (oldPath.has(targetPath[i].id)) {
			commonAncestorId = targetPath[i].id;
			break;
		}
	}
	const entries: SessionTreeEntry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = await session.getEntry(current);
		if (!entry) throw new SessionError("invalid_session", `Entry ${current} not found`);
		entries.push(entry as SessionTreeEntry);
		current = entry.parentId;
	}
	entries.reverse();

	return { entries, commonAncestorId };
}
function getMessageFromEntry(entry: SessionTreeEntry): AgentMessage | undefined {
	switch (entry.type) {
		case "message":
			if (entry.message.role === "toolResult") return undefined;
			return entry.message;

		case "custom_message":
			return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);

		case "branch_summary":
			return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);

		case "compaction":
			return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);
		case "thinking_level_change":
		case "model_change":
		case "active_tools_change":
		case "custom":
		case "label":
		case "session_info":
		case "leaf":
			return undefined;
	}
}

/** Append paths from one list into a file-ops set when the list is an array. */
function appendPathsToSet(target: Set<string>, paths: unknown): void {
	if (!Array.isArray(paths)) return;
	for (const path of paths as string[]) target.add(path);
}

/** Append the read/modified file lists from a branch-summary entry into the accumulator. */
function appendBranchSummaryFiles(fileOps: FileOperations, details: BranchSummaryDetails): void {
	appendPathsToSet(fileOps.read, details.readFiles);
	appendPathsToSet(fileOps.edited, details.modifiedFiles);
}

/** Collect read/modified files reported on non-hook branch-summary entries. */
function collectBranchSummaryFiles(entry: SessionTreeEntry, fileOps: FileOperations): void {
	if (entry.type !== "branch_summary" || entry.fromHook || !entry.details) return;
	appendBranchSummaryFiles(fileOps, entry.details as BranchSummaryDetails);
}

/** Seed file-ops from prior non-hook branch-summary details on the abandoned branch. */
function accumulateBranchFileOps(entries: SessionTreeEntry[]): FileOperations {
	const fileOps = createFileOps();
	for (const entry of entries) {
		collectBranchSummaryFiles(entry, fileOps);
	}
	return fileOps;
}

/** Decide whether a candidate message fits in the remaining token budget. */
function evaluateBudgetEntry(
	message: AgentMessage,
	entry: SessionTreeEntry,
	tokenBudget: number,
	totalTokens: number,
): { include: boolean; stop: boolean; tokens: number } {
	const tokens = estimateTokens(message);
	if (tokenBudget <= 0 || totalTokens + tokens <= tokenBudget) {
		return { include: true, stop: false, tokens };
	}
	const isPinnedSummary = entry.type === "compaction" || entry.type === "branch_summary";
	const fitsHeadroom = totalTokens < tokenBudget * 0.9;
	return { include: isPinnedSummary && fitsHeadroom, stop: true, tokens };
}

/** Apply one budget decision: maybe keep the message (newest-first) and stop when over budget. */
function applyBudgetDecision(
	decision: { include: boolean; stop: boolean; tokens: number },
	message: AgentMessage,
	messages: AgentMessage[],
	totalTokens: number,
): { totalTokens: number; stop: boolean } {
	let nextTotal = totalTokens;
	if (decision.include) {
		messages.unshift(message);
		nextTotal += decision.tokens;
	}
	return { totalTokens: nextTotal, stop: decision.stop };
}

/**
 * Walk entries newest→oldest, extract tool file-ops, and keep messages that fit the budget.
 * Pinned compaction/branch_summary messages may still be kept once under 90% headroom.
 */
function selectMessagesWithinBudget(
	entries: SessionTreeEntry[],
	fileOps: FileOperations,
	tokenBudget: number,
): { messages: AgentMessage[]; totalTokens: number } {
	const messages: AgentMessage[] = [];
	let totalTokens = 0;

	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		const message = getMessageFromEntry(entry);
		if (!message) continue;
		extractFileOpsFromMessage(message, fileOps);

		const decision = evaluateBudgetEntry(message, entry, tokenBudget, totalTokens);
		const applied = applyBudgetDecision(decision, message, messages, totalTokens);
		totalTokens = applied.totalTokens;
		if (applied.stop) break;
	}

	return { messages, totalTokens };
}

/** Prepare branch entries for summarization within an optional token budget. */
export function prepareBranchEntries(entries: SessionTreeEntry[], tokenBudget: number = 0): BranchPreparation {
	const fileOps = accumulateBranchFileOps(entries);
	const { messages, totalTokens } = selectMessagesWithinBudget(entries, fileOps, tokenBudget);
	return { messages, fileOps, totalTokens };
}

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

const BRANCH_SUMMARY_PROMPT = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

/** Resolve summarization instructions from default prompt + optional custom focus. */
function resolveBranchSummaryInstructions(
	customInstructions: string | undefined,
	replaceInstructions: boolean | undefined,
): string {
	if (replaceInstructions && customInstructions) return customInstructions;
	if (customInstructions) return `${BRANCH_SUMMARY_PROMPT}\n\nAdditional focus: ${customInstructions}`;
	return BRANCH_SUMMARY_PROMPT;
}

/** Join text blocks from a model response. */
function textFromAssistantContent(content: Array<{ type: string; text?: string }>): string {
	return content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

/** Map aborted/error stop reasons to a BranchSummaryError; otherwise null. */
function branchSummaryStopError(
	stopReason: string,
	errorMessage: string | undefined,
): BranchSummaryError | null {
	if (stopReason === "aborted") {
		return new BranchSummaryError("aborted", errorMessage || "Branch summary aborted");
	}
	if (stopReason === "error") {
		return new BranchSummaryError(
			"summarization_failed",
			`Branch summary failed: ${errorMessage || "Unknown error"}`,
		);
	}
	return null;
}

/** Assemble the final BranchSummaryResult from model text + accumulated file ops. */
function buildBranchSummaryResult(
	rawSummary: string,
	fileOps: FileOperations,
): BranchSummaryResult {
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	const summary = BRANCH_SUMMARY_PREAMBLE + rawSummary + formatFileOperations(readFiles, modifiedFiles);
	return {
		summary: summary || "No summary generated",
		readFiles,
		modifiedFiles,
	};
}

/** Generate a summary for abandoned branch entries. */
export async function generateBranchSummary(
	entries: SessionTreeEntry[],
	options: GenerateBranchSummaryOptions,
): Promise<Result<BranchSummaryResult, BranchSummaryError>> {
	const { model, apiKey, headers, signal, customInstructions, replaceInstructions, reserveTokens = 16384 } = options;
	const contextWindow = model.contextWindow || 128000;
	const tokenBudget = contextWindow - reserveTokens;

	const { messages, fileOps } = prepareBranchEntries(entries, tokenBudget);

	if (messages.length === 0) {
		return ok({ summary: "No content to summarize", readFiles: [], modifiedFiles: [] });
	}
	const llmMessages = convertToLlm(messages);
	const conversationText = serializeConversation(llmMessages);
	const instructions = resolveBranchSummaryInstructions(customInstructions, replaceInstructions);
	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${instructions}`;

	const summarizationMessages = [
		{
			role: "user" as const,
			content: [{ type: "text" as const, text: promptText }],
			timestamp: Date.now(),
		},
	];
	const response = await completeSimple(
		model,
		{ systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: summarizationMessages },
		{ apiKey, headers, signal, maxTokens: 2048 },
	);
	const stopError = branchSummaryStopError(response.stopReason, response.errorMessage);
	if (stopError) return err(stopError);

	return ok(buildBranchSummaryResult(textFromAssistantContent(response.content), fileOps));
}
