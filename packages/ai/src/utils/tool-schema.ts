/**
 * Coerce a tool's JSON Schema into a valid, non-empty object shape.
 * Strict OpenAI-compatible providers (notably MiniMax) reject empty/missing
 * `parameters` / `input_schema` with error 2013.
 */
export function normalizeToolSchema(raw: unknown): {
	type: "object";
	properties: Record<string, unknown>;
	required: string[];
} {
	const obj =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? { ...(raw as Record<string, unknown>) }
			: {};
	const type = typeof obj.type === "string" ? obj.type : "object";
	const properties =
		type === "object" && obj.properties != null && typeof obj.properties === "object" && !Array.isArray(obj.properties)
			? (obj.properties as Record<string, unknown>)
			: {};
	const required = Array.isArray(obj.required)
		? obj.required.filter((item): item is string => typeof item === "string")
		: [];
	return { type: "object", properties, required };
}
