import type { FileSystem, JsonlSessionMetadata, SessionStorage, SessionTreeEntry } from "../types.js";
import { SessionError, toError } from "../types.js";
import {
	encodeV4Header,
	encodeV4Mutation,
	isV3HeaderLine,
	isV4HeaderLine,
	parseV4Header,
	parseV4SessionText,
	treeEntryToV4Entry,
	upgradeV3TextToV4,
	type JsonlV4Header,
} from "./jsonl-v4.js";
import { getFileSystemResultOrThrow } from "./repo-utils.js";
import { uuidv7 } from "./uuid.js";

type JsonlSessionStorageFileSystem = Pick<
	FileSystem,
	"readTextFile" | "readTextLines" | "writeFile" | "appendFile"
>;

interface SessionHeaderV3 {
	type: "session";
	version: 3;
	id: string;
	timestamp: string;
	cwd: string;
	parentSession?: string;
}

function updateLabelCache(labelsById: Map<string, string>, entry: SessionTreeEntry): void {
	if (entry.type !== "label") return;
	const label = entry.label?.trim();
	if (label) {
		labelsById.set(entry.targetId, label);
	} else {
		labelsById.delete(entry.targetId);
	}
}

function buildLabelsById(entries: SessionTreeEntry[]): Map<string, string> {
	const labelsById = new Map<string, string>();
	for (const entry of entries) {
		updateLabelCache(labelsById, entry);
	}
	return labelsById;
}

function generateEntryId(byId: { has(id: string): boolean }): string {
	for (let i = 0; i < 100; i++) {
		const id = uuidv7().slice(0, 8);
		if (!byId.has(id)) return id;
	}
	return uuidv7();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function invalidSession(filePath: string, message: string, cause?: Error): SessionError {
	return new SessionError("invalid_session", `Invalid JSONL session file ${filePath}: ${message}`, cause);
}

function invalidEntry(filePath: string, lineNumber: number, message: string, cause?: Error): SessionError {
	return new SessionError(
		"invalid_entry",
		`Invalid JSONL session file ${filePath}: line ${lineNumber} ${message}`,
		cause,
	);
}

function parseV3HeaderLine(line: string, filePath: string): SessionHeaderV3 {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch (error) {
		throw invalidSession(filePath, "first line is not a valid session header", toError(error));
	}
	if (!isRecord(parsed)) throw invalidSession(filePath, "first line is not a valid session header");
	if (parsed.type !== "session") throw invalidSession(filePath, "first line is not a valid session header");
	if (parsed.version !== 3) throw invalidSession(filePath, "unsupported session version");
	if (typeof parsed.id !== "string" || !parsed.id) throw invalidSession(filePath, "session header is missing id");
	if (typeof parsed.timestamp !== "string" || !parsed.timestamp) {
		throw invalidSession(filePath, "session header is missing timestamp");
	}
	if (typeof parsed.cwd !== "string" || !parsed.cwd) throw invalidSession(filePath, "session header is missing cwd");
	if (parsed.parentSession !== undefined && typeof parsed.parentSession !== "string") {
		throw invalidSession(filePath, "session header parentSession must be a string");
	}
	return {
		type: "session",
		version: 3,
		id: parsed.id,
		timestamp: parsed.timestamp,
		cwd: parsed.cwd,
		parentSession: parsed.parentSession,
	};
}

function parseV3EntryLine(line: string, filePath: string, lineNumber: number): SessionTreeEntry {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch (error) {
		throw invalidEntry(filePath, lineNumber, "is not valid JSON", toError(error));
	}
	if (!isRecord(parsed)) throw invalidEntry(filePath, lineNumber, "is not a valid session entry");
	if (typeof parsed.type !== "string") throw invalidEntry(filePath, lineNumber, "is missing entry type");
	if (typeof parsed.id !== "string" || !parsed.id) throw invalidEntry(filePath, lineNumber, "is missing entry id");
	if (parsed.parentId !== null && typeof parsed.parentId !== "string") {
		throw invalidEntry(filePath, lineNumber, "has invalid parentId");
	}
	if (typeof parsed.timestamp !== "string" || !parsed.timestamp) {
		throw invalidEntry(filePath, lineNumber, "is missing timestamp");
	}
	if (parsed.type === "leaf" && parsed.targetId !== null && typeof parsed.targetId !== "string") {
		throw invalidEntry(filePath, lineNumber, "has invalid targetId");
	}
	return parsed as unknown as SessionTreeEntry;
}

function leafIdAfterEntry(entry: SessionTreeEntry): string | null {
	return entry.type === "leaf" ? entry.targetId : entry.id;
}

function v4HeaderToMetadata(header: JsonlV4Header, path: string): JsonlSessionMetadata {
	return {
		id: header.id,
		createdAt: new Date(header.createdAt).toISOString(),
		cwd: header.cwd,
		path,
		parentSessionPath: header.parentSessionId ?? header.legacyParentSessionPath,
	};
}

function v3HeaderToMetadata(header: SessionHeaderV3, path: string): JsonlSessionMetadata {
	return {
		id: header.id,
		createdAt: header.timestamp,
		cwd: header.cwd,
		path,
		parentSessionPath: header.parentSession,
	};
}

export async function loadJsonlSessionMetadata(
	fs: JsonlSessionStorageFileSystem,
	filePath: string,
): Promise<JsonlSessionMetadata> {
	const lines = getFileSystemResultOrThrow(
		await fs.readTextLines(filePath, { maxLines: 1 }),
		`Failed to read session header ${filePath}`,
	);
	const line = lines[0];
	if (!line?.trim()) throw invalidSession(filePath, "missing session header");
	if (isV4HeaderLine(line)) {
		return v4HeaderToMetadata(parseV4Header(line), filePath);
	}
	if (isV3HeaderLine(line)) {
		return v3HeaderToMetadata(parseV3HeaderLine(line, filePath), filePath);
	}
	throw invalidSession(filePath, "unsupported session header");
}

function loadV3Entries(
	content: string,
	filePath: string,
): { header: SessionHeaderV3; entries: SessionTreeEntry[]; leafId: string | null } {
	const lines = content.split("\n").filter((line) => line.trim());
	if (lines.length === 0) throw invalidSession(filePath, "missing session header");
	const header = parseV3HeaderLine(lines[0]!, filePath);
	const entries: SessionTreeEntry[] = [];
	let leafId: string | null = null;
	for (let i = 1; i < lines.length; i++) {
		const entry = parseV3EntryLine(lines[i]!, filePath, i + 1);
		entries.push(entry);
		leafId = leafIdAfterEntry(entry);
	}
	return { header, entries, leafId };
}

export class JsonlSessionStorage implements SessionStorage<JsonlSessionMetadata> {
	private readonly fs: JsonlSessionStorageFileSystem;
	private readonly filePath: string;
	private readonly metadata: JsonlSessionMetadata;
	private entries: SessionTreeEntry[];
	private byId: Map<string, SessionTreeEntry>;
	private labelsById: Map<string, string>;
	private currentLeafId: string | null;
	private nextSeq: number;

	private constructor(
		fs: JsonlSessionStorageFileSystem,
		filePath: string,
		header: JsonlV4Header,
		entries: SessionTreeEntry[],
		leafId: string | null,
		nextSeq: number,
		labelsById?: Map<string, string>,
	) {
		this.fs = fs;
		this.filePath = filePath;
		this.metadata = v4HeaderToMetadata(header, this.filePath);
		this.entries = entries;
		this.byId = new Map(entries.map((entry) => [entry.id, entry]));
		this.labelsById = labelsById ?? buildLabelsById(entries);
		this.currentLeafId = leafId;
		this.nextSeq = nextSeq;
	}

	static async open(fs: JsonlSessionStorageFileSystem, filePath: string): Promise<JsonlSessionStorage> {
		const content = getFileSystemResultOrThrow(await fs.readTextFile(filePath), `Failed to read session ${filePath}`);
		const firstLine = content.split("\n").find((line) => line.trim()) ?? "";
		if (isV4HeaderLine(firstLine)) {
			const snapshot = parseV4SessionText(content);
			return new JsonlSessionStorage(
				fs,
				filePath,
				snapshot.header,
				snapshot.entries,
				snapshot.leafId,
				snapshot.nextSeq,
				snapshot.labelsById,
			);
		}
		if (!isV3HeaderLine(firstLine)) {
			throw invalidSession(filePath, "unsupported session header");
		}
		const loaded = loadV3Entries(content, filePath);
		const upgraded = upgradeV3TextToV4(content);
		getFileSystemResultOrThrow(
			await fs.writeFile(`${filePath}.v3.bak`, content),
			`Failed to backup v3 session ${filePath}`,
		);
		getFileSystemResultOrThrow(await fs.writeFile(filePath, upgraded), `Failed to rewrite session ${filePath} as v4`);
		const snapshot = parseV4SessionText(upgraded);
		return new JsonlSessionStorage(
			fs,
			filePath,
			snapshot.header,
			snapshot.entries,
			loaded.leafId,
			snapshot.nextSeq,
			snapshot.labelsById,
		);
	}

	static async create(
		fs: JsonlSessionStorageFileSystem,
		filePath: string,
		options: {
			cwd: string;
			sessionId: string;
			parentSessionPath?: string;
		},
	): Promise<JsonlSessionStorage> {
		const header: JsonlV4Header = {
			kind: "header",
			version: 4,
			id: options.sessionId,
			createdAt: Date.now(),
			cwd: options.cwd,
			...(options.parentSessionPath ? { legacyParentSessionPath: options.parentSessionPath } : {}),
		};
		getFileSystemResultOrThrow(
			await fs.writeFile(filePath, encodeV4Header(header)),
			`Failed to create session ${filePath}`,
		);
		return new JsonlSessionStorage(fs, filePath, header, [], null, 1);
	}

	async getMetadata(): Promise<JsonlSessionMetadata> {
		return this.metadata;
	}

	async getLeafId(): Promise<string | null> {
		if (this.currentLeafId !== null && !this.byId.has(this.currentLeafId)) {
			throw new SessionError("invalid_session", `Entry ${this.currentLeafId} not found`);
		}
		return this.currentLeafId;
	}

	async setLeafId(leafId: string | null): Promise<void> {
		if (leafId !== null && !this.byId.has(leafId)) {
			throw new SessionError("not_found", `Entry ${leafId} not found`);
		}
		const seq = this.nextSeq;
		this.nextSeq += 1;
		getFileSystemResultOrThrow(
			await this.fs.appendFile(
				this.filePath,
				encodeV4Mutation({ kind: "lane", seq, lane: "main", leafId }),
			),
			`Failed to append session leaf`,
		);
		this.currentLeafId = leafId;
	}

	async createEntryId(): Promise<string> {
		return generateEntryId(this.byId);
	}

	async appendEntry(entry: SessionTreeEntry): Promise<void> {
		const seq = this.nextSeq;
		this.nextSeq += 1;
		getFileSystemResultOrThrow(
			await this.fs.appendFile(this.filePath, encodeV4Mutation({ kind: "entry", entry: treeEntryToV4Entry(entry, seq) })),
			`Failed to append session entry ${entry.id}`,
		);
		this.entries.push(entry);
		this.byId.set(entry.id, entry);
		updateLabelCache(this.labelsById, entry);
		this.currentLeafId = leafIdAfterEntry(entry);
	}

	async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
		return this.byId.get(id);
	}

	async findEntries<TType extends SessionTreeEntry["type"]>(
		type: TType,
	): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
		return this.entries.filter((entry): entry is Extract<SessionTreeEntry, { type: TType }> => entry.type === type);
	}

	async getLabel(id: string): Promise<string | undefined> {
		return this.labelsById.get(id);
	}

	async getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
		if (leafId === null) return [];
		const path: SessionTreeEntry[] = [];
		let current = this.byId.get(leafId);
		if (!current) throw new SessionError("not_found", `Entry ${leafId} not found`);
		while (current) {
			path.unshift(current);
			if (!current.parentId) break;
			const parent = this.byId.get(current.parentId);
			if (!parent) throw new SessionError("invalid_session", `Entry ${current.parentId} not found`);
			current = parent;
		}
		return path;
	}

	async getEntries(): Promise<SessionTreeEntry[]> {
		return [...this.entries];
	}
}
