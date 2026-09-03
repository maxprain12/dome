import { describe, expect, it } from "vitest";
import {
	encodeV4Header,
	encodeV4Mutation,
	isV3HeaderLine,
	isV4HeaderLine,
	parseV4SessionText,
	upgradeV3TextToV4,
} from "../src/harness/session/jsonl-v4.js";

describe("JSONL v4 codec", () => {
	it("detects v3 and v4 headers", () => {
		expect(isV3HeaderLine('{"type":"session","version":3,"id":"a","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/"}')).toBe(
			true,
		);
		expect(isV4HeaderLine('{"kind":"header","version":4,"id":"a","createdAt":1,"cwd":"/"}')).toBe(true);
		expect(isV4HeaderLine('{"type":"session","version":3}')).toBe(false);
	});

	it("upgrades a v3 session with a user message and custom_message pins", () => {
		const v3 = [
			JSON.stringify({
				type: "session",
				version: 3,
				id: "sess-1",
				timestamp: "2026-01-01T00:00:00.000Z",
				cwd: "/tmp",
			}),
			JSON.stringify({
				type: "message",
				id: "m1",
				parentId: null,
				timestamp: "2026-01-01T00:00:01.000Z",
				message: { role: "user", content: [{ type: "text", text: "hola" }], timestamp: 1 },
			}),
			JSON.stringify({
				type: "custom_message",
				id: "p1",
				parentId: "m1",
				timestamp: "2026-01-01T00:00:01.100Z",
				customType: "dome.pins",
				content: "",
				display: false,
				details: { messageTimestamp: 1, pinnedResources: [{ id: "sp-1", title: "mery", type: "person" }] },
			}),
		].join("\n");

		const upgraded = upgradeV3TextToV4(`${v3}\n`);
		expect(isV4HeaderLine(upgraded.split("\n")[0]!)).toBe(true);
		const snapshot = parseV4SessionText(upgraded);
		expect(snapshot.header.id).toBe("sess-1");
		expect(snapshot.entries).toHaveLength(2);
		expect(snapshot.entries[0]?.type).toBe("message");
		expect(snapshot.entries[1]).toMatchObject({
			type: "custom_message",
			customType: "dome.pins",
		});
	});

	it("round-trips a native v4 header and custom entry", () => {
		const header = encodeV4Header({
			kind: "header",
			version: 4,
			id: "s2",
			createdAt: 1_700_000_000_000,
			cwd: "/tmp",
		});
		const mutation = encodeV4Mutation({
			kind: "entry",
			entry: {
				type: "custom",
				id: "c1",
				seq: 1,
				parentId: null,
				timestamp: 1_700_000_000_100,
				customType: "dome.pins",
				data: { messageTimestamp: 10, pinnedResources: [{ id: "x", title: "n", type: "person" }] },
			},
		});
		const snapshot = parseV4SessionText(`${header}${mutation}`);
		expect(snapshot.entries[0]).toMatchObject({ type: "custom", customType: "dome.pins" });
	});
});
