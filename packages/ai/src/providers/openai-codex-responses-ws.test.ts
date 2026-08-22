import { describe, expect, it } from "vitest";
import {
	recordWebSocketStreamRequestStats,
	type OpenAICodexWebSocketDebugStats,
} from "./openai-codex-responses.js";

function emptyStats(): OpenAICodexWebSocketDebugStats {
	return {
		requests: 0,
		connectionsCreated: 0,
		connectionsReused: 0,
		cachedContextRequests: 0,
		storeTrueRequests: 0,
		fullContextRequests: 0,
		deltaRequests: 0,
		lastInputItems: 0,
		websocketFailures: 0,
		sseFallbacks: 0,
	};
}

describe("recordWebSocketStreamRequestStats", () => {
	it("no-ops when stats are undefined", () => {
		expect(() =>
			recordWebSocketStreamRequestStats(undefined, false, true, { input: [{}, {}] }),
		).not.toThrow();
	});

	it("records a full-context request on a new connection", () => {
		const stats = emptyStats();
		recordWebSocketStreamRequestStats(stats, false, true, {
			store: false,
			input: [{ type: "message" }, { type: "message" }, { type: "message" }],
		});

		expect(stats.requests).toBe(1);
		expect(stats.connectionsCreated).toBe(1);
		expect(stats.connectionsReused).toBe(0);
		expect(stats.cachedContextRequests).toBe(1);
		expect(stats.storeTrueRequests).toBe(0);
		expect(stats.fullContextRequests).toBe(1);
		expect(stats.deltaRequests).toBe(0);
		expect(stats.lastInputItems).toBe(3);
		expect(stats.lastDeltaInputItems).toBeUndefined();
		expect(stats.lastPreviousResponseId).toBeUndefined();
	});

	it("records a delta request on a reused connection with store:true", () => {
		const stats = emptyStats();
		recordWebSocketStreamRequestStats(stats, true, false, {
			store: true,
			previous_response_id: "resp_abc",
			input: [{ type: "message" }],
		});

		expect(stats.requests).toBe(1);
		expect(stats.connectionsCreated).toBe(0);
		expect(stats.connectionsReused).toBe(1);
		expect(stats.cachedContextRequests).toBe(0);
		expect(stats.storeTrueRequests).toBe(1);
		expect(stats.fullContextRequests).toBe(0);
		expect(stats.deltaRequests).toBe(1);
		expect(stats.lastInputItems).toBe(1);
		expect(stats.lastDeltaInputItems).toBe(1);
		expect(stats.lastPreviousResponseId).toBe("resp_abc");
	});
});
