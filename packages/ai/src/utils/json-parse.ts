import { parse as partialParse } from "partial-json";

const VALID_JSON_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);

function isControlCharacter(char: string): boolean {
	const codePoint = char.codePointAt(0);
	return codePoint !== undefined && codePoint >= 0x00 && codePoint <= 0x1f;
}

function escapeControlCharacter(char: string): string {
	switch (char) {
		case "\b":
			return "\\b";
		case "\f":
			return "\\f";
		case "\n":
			return "\\n";
		case "\r":
			return "\\r";
		case "\t":
			return "\\t";
		default:
			return `\\u${char.codePointAt(0)?.toString(16).padStart(4, "0") ?? "0000"}`;
	}
}

interface EscapeSequenceResult {
	text: string;
	nextIndex: number;
}

/**
 * Returns the repaired text for a backslash sequence starting at `index`.
 * `nextIndex` is the last index consumed (the `for` loop will increment by 1).
 */
function buildEscapeSequence(json: string, index: number): EscapeSequenceResult {
	const nextChar = json[index + 1];

	if (nextChar === undefined) {
		return { text: "\\\\", nextIndex: index };
	}

	if (nextChar === "u") {
		const unicodeDigits = json.slice(index + 2, index + 6);
		if (/^[0-9a-fA-F]{4}$/.test(unicodeDigits)) {
			return { text: `\\u${unicodeDigits}`, nextIndex: index + 5 };
		}
	}

	if (VALID_JSON_ESCAPES.has(nextChar)) {
		return { text: `\\${nextChar}`, nextIndex: index + 1 };
	}

	return { text: "\\\\", nextIndex: index };
}

function repairCharInsideString(char: string): string {
	return isControlCharacter(char) ? escapeControlCharacter(char) : char;
}

/**
 * Repairs malformed JSON string literals by:
 * - escaping raw control characters inside strings
 * - doubling backslashes before invalid escape characters
 */
export function repairJson(json: string): string {
	let repaired = "";
	let inString = false;

	for (let index = 0; index < json.length; index++) {
		const char = json[index];

		if (!inString) {
			repaired += char;
			if (char === '"') {
				inString = true;
			}
			continue;
		}

		if (char === '"') {
			repaired += char;
			inString = false;
			continue;
		}

		if (char === "\\") {
			const result = buildEscapeSequence(json, index);
			repaired += result.text;
			index = result.nextIndex;
			continue;
		}

		repaired += repairCharInsideString(char);
	}

	return repaired;
}

export function parseJsonWithRepair<T>(json: string): T {
	try {
		return JSON.parse(json) as T;
	} catch (error) {
		const repairedJson = repairJson(json);
		if (repairedJson !== json) {
			return JSON.parse(repairedJson) as T;
		}
		throw error;
	}
}

/**
 * Attempts to parse potentially incomplete JSON during streaming.
 * Always returns a valid object, even if the JSON is incomplete.
 *
 * @param partialJson The partial JSON string from streaming
 * @returns Parsed object or empty object if parsing fails
 */
export function parseStreamingJson<T = Record<string, unknown>>(partialJson: string | undefined): T {
	if (!partialJson || partialJson.trim() === "") {
		return {} as T;
	}

	try {
		return parseJsonWithRepair<T>(partialJson);
	} catch {
		try {
			const result = partialParse(partialJson);
			return (result ?? {}) as T;
		} catch {
			try {
				const result = partialParse(repairJson(partialJson));
				return (result ?? {}) as T;
			} catch {
				return {} as T;
			}
		}
	}
}
