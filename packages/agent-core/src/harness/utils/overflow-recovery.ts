import {
	type AssistantMessage,
	type AssistantMessageEvent,
	type AssistantMessageEventStream,
	createAssistantMessageEventStream,
	isContextOverflow,
} from "@dome/ai";

/**
 * Wrap a provider stream so that a request the provider rejects for being too large is retried once on a
 * stream produced by `recover` (the harness compacts the session first). The rejection arrives right after
 * `start`, so `start` is held back until the second event: nothing the loop has seen has to be undone, and a
 * normal response still streams live. When `recover` yields nothing the original error is passed through.
 */
export function withOverflowRecovery(
	first: AssistantMessageEventStream,
	contextWindow: number | undefined,
	recover: () => Promise<AssistantMessageEventStream | undefined>,
): AssistantMessageEventStream {
	const out = createAssistantMessageEventStream();
	void (async () => {
		let held: AssistantMessageEvent | undefined;
		let forwarded = false;
		let retry: AssistantMessage | undefined;
		try {
			for await (const event of first) {
				if (!forwarded && event.type === "start") {
					held = event;
					continue;
				}
				if (!forwarded && event.type === "error" && isContextOverflow(event.error, contextWindow)) {
					retry = event.error;
					break;
				}
				if (!forwarded) {
					forwarded = true;
					if (held) out.push(held);
				}
				out.push(event);
			}
		} catch (error) {
			if (!forwarded && !retry) throw error;
		}
		if (retry) {
			const next = await recover().catch(() => undefined);
			if (!next) {
				if (held) out.push(held);
				out.push({ type: "error", reason: "error", error: retry });
				return;
			}
			for await (const event of next) out.push(event);
		}
	})().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		out.push({
			type: "error",
			reason: "error",
			error: { role: "assistant", content: [], stopReason: "error", errorMessage: message, timestamp: Date.now() } as unknown as AssistantMessage,
		});
	});
	return out;
}
