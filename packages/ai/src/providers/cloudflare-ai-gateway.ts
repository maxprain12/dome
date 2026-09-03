import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.js";
import { openAICompletionsApi } from "../api/openai-completions.lazy.js";
import { openAIResponsesApi } from "../api/openai-responses.lazy.js";
import { createProvider, type Provider } from "../models.js";
import type { Model } from "../types.js";
import { CLOUDFLARE_AI_GATEWAY_MODELS } from "./cloudflare-ai-gateway.models.js";
import { cloudflareAIGatewayAuth } from "./cloudflare-auth.js";
import { cloudflareStreams } from "./cloudflare-stream.js";

type CloudflareAIGatewayApi = "anthropic-messages" | "openai-completions" | "openai-responses";

export function cloudflareAIGatewayProvider(): Provider<CloudflareAIGatewayApi> {
	return createProvider<CloudflareAIGatewayApi>({
		id: "cloudflare-ai-gateway",
		name: "Cloudflare AI Gateway",
		auth: { apiKey: cloudflareAIGatewayAuth() },
		models: Object.values(CLOUDFLARE_AI_GATEWAY_MODELS) as Model<CloudflareAIGatewayApi>[],
		api: {
			"anthropic-messages": cloudflareStreams(anthropicMessagesApi()),
			"openai-completions": cloudflareStreams(openAICompletionsApi()),
			"openai-responses": cloudflareStreams(openAIResponsesApi()),
		},
	});
}
