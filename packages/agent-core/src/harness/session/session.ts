import type { ImageContent, TextContent } from "@dome/ai";
import type { AgentMessage } from "../../types.js";
import { createBranchSummaryMessage, createCompactionSummaryMessage, createCustomMessage } from "../messages.js";
import type {
	ActiveToolsChangeEntry,
	BranchSummaryEntry,
	CompactionEntry,
	CustomEntry,
	CustomMessageEntry,
	LabelEntry,
	MessageEntry,
	ModelChangeEntry,
	SessionContext,
	SessionInfoEntry,
	SessionMetadata,
	SessionStorage,
	SessionTreeEntry,
	ThinkingLevelChangeEntry,
} from "../types.js";
import { SessionError } from "../types.js";

interface SessionStateAccumulator {
	thinkingLevel: string;
	model: { provider: string; modelId: string } | null;
	activeToolNames: string[] | null;
	compaction: CompactionEntry | null;
}

function applyEntryToState(entry: SessionTreeEntry, state: SessionStateAccumulator): void {
	if (entry.type === "thinking_level_change") {
		state.thinkingLevel = entry.thinkingLevel;
		return;
	}
	if (entry.type === "model_change") {
		state.model = { provider: entry.provider, modelId: entry.modelId };
		return;
	}
	if (entry.type === "message") {
		if (entry.message.role === "assistant") {
			state.model = { provider: entry.message.provider, modelId: entry.message.model };
		}
		return;
	}
	if (entry.type === "active_tools_change") {
		state.activeToolNames = [...entry.activeToolNames];
		return;
	}
	if (entry.type === "compaction") {
		state.compaction = entry;
	}
}

function collectSessionState(pathEntries: SessionTreeEntry[]): SessionStateAccumulator {
	const state: SessionStateAccumulator = {
		thinkingLevel: "off",
		model: null,
		activeToolNames: null,
		compaction: null,
	};
	for (const entry of pathEntries) {
		applyEntryToState(entry, state);
	}
	return state;
}

function appendEntryAsMessage(messages: AgentMessage[], entry: SessionTreeEntry): void {
	if (entry.type === "message") {
		messages.push(entry.message as AgentMessage);
		return;
	}
	if (entry.type === "custom_message") {
		messages.push(
			createCustomMessage(
				entry.customType,
				entry.content as string | (TextContent | ImageContent)[],
				entry.display,
				entry.details,
				entry.timestamp,
			),
		);
		return;
	}
	if (entry.type === "branch_summary" && entry.summary) {
		messages.push(createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp));
	}
}

function appendEntriesAroundCompaction(
	pathEntries: SessionTreeEntry[],
	compactionIdx: number,
	compaction: CompactionEntry,
	messages: AgentMessage[],
): void {
	let foundFirstKept = false;
	for (let i = 0; i < compactionIdx; i++) {
		const entry = pathEntries[i]!;
		if (entry.id === compaction.firstKeptEntryId) foundFirstKept = true;
		if (foundFirstKept) appendEntryAsMessage(messages, entry);
	}
	for (let i = compactionIdx + 1; i < pathEntries.length; i++) {
		appendEntryAsMessage(messages, pathEntries[i]!);
	}
}

function buildContextMessages(
	pathEntries: SessionTreeEntry[],
	compaction: CompactionEntry | null,
): AgentMessage[] {
	const messages: AgentMessage[] = [];
	if (!compaction) {
		for (const entry of pathEntries) {
			appendEntryAsMessage(messages, entry);
		}
		return messages;
	}
	messages.push(createCompactionSummaryMessage(compaction.summary, compaction.tokensBefore, compaction.timestamp));
	const compactionIdx = pathEntries.findIndex((e) => e.type === "compaction" && e.id === compaction.id);
	appendEntriesAroundCompaction(pathEntries, compactionIdx, compaction, messages);
	return messages;
}

export function buildSessionContext(pathEntries: SessionTreeEntry[]): SessionContext {
	const state = collectSessionState(pathEntries);
	const messages = buildContextMessages(pathEntries, state.compaction);
	return {
		messages,
		thinkingLevel: state.thinkingLevel,
		model: state.model,
		activeToolNames: state.activeToolNames,
	};
}

export class Session<TMetadata extends SessionMetadata = SessionMetadata> {
	private storage: SessionStorage<TMetadata>;

	constructor(storage: SessionStorage<TMetadata>) {
		this.storage = storage;
	}

	getMetadata(): Promise<TMetadata> {
		return this.storage.getMetadata();
	}

	getStorage(): SessionStorage<TMetadata> {
		return this.storage;
	}

	getLeafId(): Promise<string | null> {
		return this.storage.getLeafId();
	}

	getEntry(id: string): Promise<SessionTreeEntry | undefined> {
		return this.storage.getEntry(id);
	}

	getEntries(): Promise<SessionTreeEntry[]> {
		return this.storage.getEntries();
	}

	async getBranch(fromId?: string): Promise<SessionTreeEntry[]> {
		const leafId = fromId ?? (await this.storage.getLeafId());
		return this.storage.getPathToRoot(leafId);
	}

	async buildContext(): Promise<SessionContext> {
		return buildSessionContext(await this.getBranch());
	}

	getLabel(id: string): Promise<string | undefined> {
		return this.storage.getLabel(id);
	}

	async getSessionName(): Promise<string | undefined> {
		const entries = await this.storage.findEntries("session_info");
		return entries[entries.length - 1]?.name?.trim() || undefined;
	}

	private async appendTypedEntry<TEntry extends SessionTreeEntry>(entry: TEntry): Promise<string> {
		await this.storage.appendEntry(entry);
		return entry.id;
	}

	async appendMessage(message: AgentMessage): Promise<string> {
		return this.appendTypedEntry({
			type: "message",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			message,
		} satisfies MessageEntry);
	}

	async appendThinkingLevelChange(thinkingLevel: string): Promise<string> {
		return this.appendTypedEntry({
			type: "thinking_level_change",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			thinkingLevel,
		} satisfies ThinkingLevelChangeEntry);
	}

	async appendModelChange(provider: string, modelId: string): Promise<string> {
		return this.appendTypedEntry({
			type: "model_change",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			provider,
			modelId,
		} satisfies ModelChangeEntry);
	}

	async appendActiveToolsChange(activeToolNames: string[]): Promise<string> {
		return this.appendTypedEntry({
			type: "active_tools_change",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			activeToolNames: [...activeToolNames],
		} satisfies ActiveToolsChangeEntry);
	}

	async appendCompaction<T = unknown>(
		summary: string,
		firstKeptEntryId: string,
		tokensBefore: number,
		details?: T,
		fromHook?: boolean,
	): Promise<string> {
		return this.appendTypedEntry({
			type: "compaction",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			summary,
			firstKeptEntryId,
			tokensBefore,
			details,
			fromHook,
		} satisfies CompactionEntry<T>);
	}

	async appendCustomEntry(customType: string, data?: unknown): Promise<string> {
		return this.appendTypedEntry({
			type: "custom",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			customType,
			data,
		} satisfies CustomEntry);
	}

	async appendCustomMessageEntry<T = unknown>(
		customType: string,
		content: string | (TextContent | ImageContent)[],
		display: boolean,
		details?: T,
	): Promise<string> {
		return this.appendTypedEntry({
			type: "custom_message",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			customType,
			content,
			display,
			details,
		} satisfies CustomMessageEntry<T>);
	}

	async appendLabel(targetId: string, label: string | undefined): Promise<string> {
		if (!(await this.storage.getEntry(targetId))) {
			throw new SessionError("not_found", `Entry ${targetId} not found`);
		}
		return this.appendTypedEntry({
			type: "label",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			targetId,
			label,
		} satisfies LabelEntry);
	}

	async appendSessionName(name: string): Promise<string> {
		return this.appendTypedEntry({
			type: "session_info",
			id: await this.storage.createEntryId(),
			parentId: await this.storage.getLeafId(),
			timestamp: new Date().toISOString(),
			name: name.trim(),
		} satisfies SessionInfoEntry);
	}

	async moveTo(
		entryId: string | null,
		summary?: { summary: string; details?: unknown; fromHook?: boolean },
	): Promise<string | undefined> {
		if (entryId !== null && !(await this.storage.getEntry(entryId))) {
			throw new SessionError("not_found", `Entry ${entryId} not found`);
		}
		await this.storage.setLeafId(entryId);
		if (!summary) return undefined;
		return this.appendTypedEntry({
			type: "branch_summary",
			id: await this.storage.createEntryId(),
			parentId: entryId,
			timestamp: new Date().toISOString(),
			fromId: entryId ?? "root",
			summary: summary.summary,
			details: summary.details,
			fromHook: summary.fromHook,
		} satisfies BranchSummaryEntry);
	}
}
