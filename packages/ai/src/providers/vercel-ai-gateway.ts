import { anthropicMessagesApi } from "../api/anthropic-messages.lazy.js";
import { envApiKeyAuth } from "../auth/helpers.js";
import { createProvider, type Provider } from "../models.js";
import { VERCEL_AI_GATEWAY_MODELS } from "./vercel-ai-gateway.models.js";

export function vercelAIGatewayProvider(): Provider<"anthropic-messages"> {
	return createProvider({
		id: "vercel-ai-gateway",
		name: "Vercel AI Gateway",
		baseUrl: "https://ai-gateway.vercel.sh",
		auth: { apiKey: envApiKeyAuth("Vercel AI Gateway API key", ["AI_GATEWAY_API_KEY"]) },
		models: Object.values(VERCEL_AI_GATEWAY_MODELS),
		api: anthropicMessagesApi(),
	}) as Provider<"anthropic-messages">;
}
