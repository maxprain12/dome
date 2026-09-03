import type { SessionTreeEntry } from "../types.js";
import { SessionError } from "../types.js";

export const JSONL_V4_VERSION = 4;

export type JsonlV4Header = {
	kind: "header";
	version: 4;
	id: string;
	createdAt: number;
	cwd: string;
	parentSessionId?: string;
	legacyParentSessionPath?: string;
	metadata?: Record<string, unknown>;
};

export type SessionMutation =
	| { kind: "entry"; lane?: string; entry: V4Entry }
	| { kind: "record"; record: Record<string, unknown> & { seq: number; type: string } }
	| { kind: "lane"; seq: number; lane: string; leafId: string | null }
	| { kind: "fact"; seq: number; fact: "name"; name: string | undefined }
	| { kind: "fact"; seq: number; fact: "label"; targetId: string; label: string | undefined };

export type V4Entry = {
	type: string;
	id: string;
	seq: number;
	parentId: string | null;
	timestamp: number;
	[key: string]: unknown;
};

const ENTRY_TYPES = new Set([
	"message",
	"model_change",
	"thinking_level_change",
	"active_tools_change",
	"compaction",
	"branch_summary",
	"custom",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== "string") throw new SessionError("invalid_session", `v4 mutation has invalid ${field}`);
	return value;
}

function requireSequence(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw new SessionError("invalid_session", "v4 mutation has invalid seq");
	}
	return value as number;
}

function requireTimestamp(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new SessionError("invalid_session", "v4 header/mutation has invalid timestamp");
	}
	return value as number;
}

export function isV4HeaderLine(line: string): boolean {
	try {
		const parsed: unknown = JSON.parse(line);
		return isRecord(parsed) && parsed.kind === "header" && parsed.version === JSONL_V4_VERSION;
	} catch {
		return false;
	}
}

export function isV3HeaderLine(line: string): boolean {
	try {
		const parsed: unknown = JSON.parse(line);
		return isRecord(parsed) && parsed.type === "session" && parsed.version === 3;
	} catch {
		return false;
	}
}

export function parseV4Header(line: string): JsonlV4Header {
	const value = JSON.parse(line) as unknown;
	if (!isRecord(value) || value.kind !== "header" || value.version !== JSONL_V4_VERSION) {
		throw new SessionError("invalid_session", "first line is not a JSONL v4 header");
	}
	const parentSessionId = value.parentSessionId;
	if (parentSessionId !== undefined && typeof parentSessionId !== "string") {
		throw new SessionError("invalid_session", "v4 header has invalid parentSessionId");
	}
	const legacyParentSessionPath = value.legacyParentSessionPath;
	if (legacyParentSessionPath !== undefined && typeof legacyParentSessionPath !== "string") {
		throw new SessionError("invalid_session", "v4 header has invalid legacyParentSessionPath");
	}
	return {
		kind: "header",
		version: 4,
		id: requireString(value.id, "id"),
		createdAt: requireTimestamp(value.createdAt),
		cwd: requireString(value.cwd, "cwd"),
		...(typeof parentSessionId === "string" ? { parentSessionId } : {}),
		...(typeof legacyParentSessionPath === "string" ? { legacyParentSessionPath } : {}),
		...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
	};
}

export function encodeV4Header(header: JsonlV4Header): string {
	return `${JSON.stringify(header)}\n`;
}

export function parseV4Mutation(line: string): SessionMutation {
	const value = JSON.parse(line) as unknown;
	if (!isRecord(value)) throw new SessionError("invalid_session", "v4 mutation is not an object");
	const seq = requireSequence(value.seq);
	switch (value.kind) {
		case "entry": {
			const id = requireString(value.id, "id");
			const type = requireString(value.type, "entry type");
			if (!ENTRY_TYPES.has(type)) {
				throw new SessionError("invalid_session", `v4 mutation has unknown entry type ${type}`);
			}
			const parentId = value.parentId === null || typeof value.parentId === "string" ? value.parentId : undefined;
			if (parentId === undefined) throw new SessionError("invalid_session", "v4 entry has invalid parentId");
			const timestamp = requireTimestamp(value.timestamp);
			if (type === "custom") requireString(value.customType, "customType");
			const { kind: _kind, lane, ...entryFields } = value;
			const entry = { ...entryFields, id, type, parentId, seq, timestamp } as V4Entry;
			return typeof lane === "string" ? { kind: "entry", lane, entry } : { kind: "entry", entry };
		}
		case "record": {
			const type = requireString(value.type, "record type");
			const { kind: _kind, ...recordFields } = value;
			return { kind: "record", record: { ...recordFields, seq, type } };
		}
		case "lane":
			return {
				kind: "lane",
				seq,
				lane: requireString(value.lane, "lane"),
				leafId: value.leafId === null || typeof value.leafId === "string" ? value.leafId : null,
			};
		case "fact":
			if (value.fact === "name") {
				return {
					kind: "fact",
					seq,
					fact: "name",
					name: typeof value.name === "string" ? value.name : undefined,
				};
			}
			if (value.fact === "label") {
				return {
					kind: "fact",
					seq,
					fact: "label",
					targetId: requireString(value.targetId, "targetId"),
					label: typeof value.label === "string" ? value.label : undefined,
				};
			}
			throw new SessionError("invalid_session", "v4 mutation has unknown fact type");
		default:
			throw new SessionError("invalid_session", "v4 mutation has unknown kind");
	}
}

export function encodeV4Mutation(mutation: SessionMutation): string {
	switch (mutation.kind) {
		case "entry":
			return `${JSON.stringify({ kind: "entry", lane: mutation.lane, ...mutation.entry })}\n`;
		case "record":
			return `${JSON.stringify({ kind: "record", ...mutation.record })}\n`;
		case "lane":
		case "fact":
			return `${JSON.stringify(mutation)}\n`;
		default: {
			const _never: never = mutation;
			return _never;
		}
	}
}

function isoToUnixMs(timestamp: string): number {
	const parsed = Date.parse(timestamp);
	return Number.isFinite(parsed) ? parsed : Date.now();
}

function unixMsToIso(timestamp: number): string {
	return new Date(timestamp).toISOString();
}

/** Map a Dome tree entry to a v4 entry mutation payload (seq assigned by caller). */
export function treeEntryToV4Entry(entry: SessionTreeEntry, seq: number): V4Entry {
	if (entry.type === "custom_message") {
		return {
			type: "custom",
			id: entry.id,
			seq,
			parentId: entry.parentId,
			timestamp: isoToUnixMs(entry.timestamp),
			customType: entry.customType,
			data: {
				content: entry.content,
				display: entry.display,
				details: entry.details,
				legacyType: "custom_message",
			},
		};
	}
	if (entry.type === "leaf") {
		return {
			type: "custom",
			id: entry.id,
			seq,
			parentId: entry.parentId,
			timestamp: isoToUnixMs(entry.timestamp),
			customType: "dome.leaf",
			data: { targetId: entry.targetId },
		};
	}
	if (entry.type === "session_info") {
		return {
			type: "custom",
			id: entry.id,
			seq,
			parentId: entry.parentId,
			timestamp: isoToUnixMs(entry.timestamp),
			customType: "dome.session_info",
			data: { name: entry.name },
		};
	}
	if (entry.type === "label") {
		return {
			type: "custom",
			id: entry.id,
			seq,
			parentId: entry.parentId,
			timestamp: isoToUnixMs(entry.timestamp),
			customType: "dome.label",
			data: { targetId: entry.targetId, label: entry.label },
		};
	}
	const { timestamp, ...rest } = entry;
	return { ...rest, seq, timestamp: isoToUnixMs(timestamp) };
}

export function v4EntryToTreeEntry(entry: V4Entry): SessionTreeEntry {
	const timestamp = unixMsToIso(entry.timestamp);
	if (entry.type === "custom" && isRecord(entry.data) && entry.data.legacyType === "custom_message") {
		return {
			type: "custom_message",
			id: entry.id,
			parentId: entry.parentId,
			timestamp,
			customType: typeof entry.customType === "string" ? entry.customType : "custom",
			content: (entry.data.content as string) ?? "",
			display: entry.data.display === true,
			details: entry.data.details,
		};
	}
	if (entry.type === "custom" && entry.customType === "dome.leaf" && isRecord(entry.data)) {
		return {
			type: "leaf",
			id: entry.id,
			parentId: entry.parentId,
			timestamp,
			targetId: typeof entry.data.targetId === "string" || entry.data.targetId === null ? entry.data.targetId : null,
		};
	}
	if (entry.type === "custom" && entry.customType === "dome.session_info" && isRecord(entry.data)) {
		return {
			type: "session_info",
			id: entry.id,
			parentId: entry.parentId,
			timestamp,
			name: typeof entry.data.name === "string" ? entry.data.name : undefined,
		};
	}
	if (entry.type === "custom" && entry.customType === "dome.label" && isRecord(entry.data)) {
		return {
			type: "label",
			id: entry.id,
			parentId: entry.parentId,
			timestamp,
			targetId: typeof entry.data.targetId === "string" ? entry.data.targetId : "",
			label: typeof entry.data.label === "string" ? entry.data.label : undefined,
		};
	}
	const { seq: _seq, timestamp: _ts, ...rest } = entry;
	return { ...rest, timestamp } as SessionTreeEntry;
}

export type V4SessionSnapshot = {
	header: JsonlV4Header;
	entries: SessionTreeEntry[];
	leafId: string | null;
	nextSeq: number;
	labelsById: Map<string, string>;
	name?: string;
};

export function applyV4Mutations(header: JsonlV4Header, mutations: SessionMutation[]): V4SessionSnapshot {
	const entries: SessionTreeEntry[] = [];
	const labelsById = new Map<string, string>();
	let leafId: string | null = null;
	let nextSeq = 1;
	let name: string | undefined;
	for (const mutation of mutations) {
		const seq =
			mutation.kind === "entry"
				? mutation.entry.seq
				: mutation.kind === "record"
					? mutation.record.seq
					: mutation.seq;
		if (seq !== nextSeq) {
			throw new SessionError("invalid_session", `v4 mutation has non-consecutive seq ${seq}`);
		}
		nextSeq = seq + 1;
		if (mutation.kind === "entry") {
			const tree = v4EntryToTreeEntry(mutation.entry);
			entries.push(tree);
			if (tree.type === "leaf") {
				leafId = tree.targetId;
			} else if (tree.type === "label") {
				const label = tree.label?.trim();
				if (label) labelsById.set(tree.targetId, label);
				else labelsById.delete(tree.targetId);
				leafId = tree.id;
			} else {
				leafId = tree.id;
			}
		} else if (mutation.kind === "lane" && mutation.lane === "main") {
			leafId = mutation.leafId;
		} else if (mutation.kind === "fact" && mutation.fact === "label") {
			if (mutation.label?.trim()) labelsById.set(mutation.targetId, mutation.label);
			else labelsById.delete(mutation.targetId);
		} else if (mutation.kind === "fact" && mutation.fact === "name") {
			name = mutation.name;
		}
	}
	return { header, entries, leafId, nextSeq, labelsById, name };
}

export function parseV4SessionText(text: string): V4SessionSnapshot {
	const physicalLines = text.split("\n");
	if (physicalLines.at(-1) === "") physicalLines.pop();
	if (physicalLines.length === 0 || !physicalLines[0]) {
		throw new SessionError("invalid_session", "JSONL v4 session is missing a header");
	}
	const header = parseV4Header(physicalLines[0]);
	const mutations: SessionMutation[] = [];
	for (let i = 1; i < physicalLines.length; i++) {
		const line = physicalLines[i]!;
		if (!line.trim()) continue;
		try {
			mutations.push(parseV4Mutation(line));
		} catch (error) {
			const isTornTail = i === physicalLines.length - 1;
			if (isTornTail) break;
			throw error;
		}
	}
	return applyV4Mutations(header, mutations);
}

export function upgradeV3TextToV4(text: string): string {
	const lines = text.split("\n").filter((line) => line.trim());
	if (lines.length === 0) throw new SessionError("invalid_session", "missing session header");
	const rawHeader = JSON.parse(lines[0]!) as unknown;
	if (!isRecord(rawHeader) || rawHeader.type !== "session" || rawHeader.version !== 3) {
		throw new SessionError("invalid_session", "not a JSONL v3 session");
	}
	const header: JsonlV4Header = {
		kind: "header",
		version: 4,
		id: requireString(rawHeader.id, "id"),
		createdAt: isoToUnixMs(requireString(rawHeader.timestamp, "timestamp")),
		cwd: requireString(rawHeader.cwd, "cwd"),
		...(typeof rawHeader.parentSession === "string"
			? { legacyParentSessionPath: rawHeader.parentSession }
			: {}),
	};
	const chunks = [encodeV4Header(header)];
	let seq = 1;
	for (let i = 1; i < lines.length; i++) {
		const parsed = JSON.parse(lines[i]!) as unknown;
		if (!isRecord(parsed) || typeof parsed.type !== "string" || typeof parsed.id !== "string") {
			throw new SessionError("invalid_session", `v3 line ${i + 1} is not a valid entry`);
		}
		const entry = parsed as unknown as SessionTreeEntry;
		if (entry.type === "leaf") {
			chunks.push(
				encodeV4Mutation({
					kind: "lane",
					seq,
					lane: "main",
					leafId: (entry as { targetId: string | null }).targetId,
				}),
			);
		} else if (entry.type === "label") {
			chunks.push(
				encodeV4Mutation({
					kind: "fact",
					seq,
					fact: "label",
					targetId: (entry as { targetId: string }).targetId,
					label: (entry as { label?: string }).label,
				}),
			);
		} else if (entry.type === "session_info") {
			chunks.push(
				encodeV4Mutation({
					kind: "fact",
					seq,
					fact: "name",
					name: (entry as { name?: string }).name,
				}),
			);
		} else {
			chunks.push(encodeV4Mutation({ kind: "entry", entry: treeEntryToV4Entry(entry, seq) }));
		}
		seq += 1;
	}
	return chunks.join("");
}

