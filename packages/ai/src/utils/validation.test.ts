import { describe, expect, it } from "vitest";
import type { Tool, ToolCall } from "../types.js";
import { validateToolArguments, validateToolCall } from "./validation.js";

function plainJsonTool(name: string, parameters: Record<string, unknown>): Tool {
	return {
		name,
		description: `${name} tool`,
		parameters: parameters as Tool["parameters"],
	};
}

function toolCall(name: string, args: Record<string, unknown>): ToolCall {
	return {
		type: "toolCall",
		id: "call-1",
		name,
		arguments: args,
	};
}

describe("validateToolCall", () => {
	it("throws when the tool is missing", () => {
		expect(() => validateToolCall([], toolCall("missing", {}))).toThrow('Tool "missing" not found');
	});
});

describe("validateToolArguments", () => {
	it("coerces plain JSON Schema string numbers to numbers", () => {
		const tool = plainJsonTool("add", {
			type: "object",
			properties: {
				a: { type: "number" },
				b: { type: "number" },
			},
			required: ["a", "b"],
			additionalProperties: false,
		});

		const result = validateToolArguments(tool, toolCall("add", { a: "3", b: "4" }));
		expect(result).toEqual({ a: 3, b: 4 });
	});

	it("coerces nested object and array properties", () => {
		const tool = plainJsonTool("nested", {
			type: "object",
			properties: {
				meta: {
					type: "object",
					properties: {
						count: { type: "integer" },
					},
					additionalProperties: false,
				},
				tags: {
					type: "array",
					items: { type: "string" },
				},
			},
			required: ["meta", "tags"],
			additionalProperties: false,
		});

		const result = validateToolArguments(
			tool,
			toolCall("nested", {
				meta: { count: "2" },
				tags: [1, true],
			}),
		);
		expect(result).toEqual({
			meta: { count: 2 },
			tags: ["1", "true"],
		});
	});

	it("applies allOf composition before validation", () => {
		const tool = plainJsonTool("composed", {
			type: "object",
			allOf: [
				{
					type: "object",
					properties: {
						n: { type: "number" },
					},
				},
			],
			properties: {
				n: { type: "number" },
			},
			required: ["n"],
			additionalProperties: false,
		});

		const result = validateToolArguments(tool, toolCall("composed", { n: "9" }));
		expect(result).toEqual({ n: 9 });
	});

	it("picks a matching anyOf branch after coercion", () => {
		const tool = plainJsonTool("union", {
			type: "object",
			properties: {
				value: {
					anyOf: [{ type: "number" }, { type: "boolean" }],
				},
			},
			required: ["value"],
			additionalProperties: false,
		});

		const result = validateToolArguments(tool, toolCall("union", { value: "true" }));
		expect(result).toEqual({ value: true });
	});

	it("throws a formatted error when validation fails", () => {
		const tool = plainJsonTool("strict", {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
			additionalProperties: false,
		});

		expect(() => validateToolArguments(tool, toolCall("strict", {}))).toThrow(
			/Validation failed for tool "strict"/,
		);
	});
});
