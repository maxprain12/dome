import { createImagesModels, type ImagesProvider, type MutableImagesModels } from "../images-models.js";
import { MODELS } from "../models.generated.js";
import { type CreateModelsOptions, createModels, type MutableModels, type Provider } from "../models.js";
import type { Api, Model } from "../types.js";
import { amazonBedrockProvider } from "./amazon-bedrock.js";
import { antLingProvider } from "./ant-ling.js";
import { anthropicProvider } from "./anthropic.js";
import { azureOpenAIResponsesProvider } from "./azure-openai-responses.js";
import { basetenProvider } from "./baseten.js";
import { cerebrasProvider } from "./cerebras.js";
import { cloudflareAIGatewayProvider } from "./cloudflare-ai-gateway.js";
import { cloudflareWorkersAIProvider } from "./cloudflare-workers-ai.js";
import { deepseekProvider } from "./deepseek.js";
import { fireworksProvider } from "./fireworks.js";
import { githubCopilotProvider } from "./github-copilot.js";
import { googleProvider } from "./google.js";
import { googleVertexProvider } from "./google-vertex.js";
import { groqProvider } from "./groq.js";
import { huggingfaceProvider } from "./huggingface.js";
import { kimiCodingProvider } from "./kimi-coding.js";
import { minimaxProvider } from "./minimax.js";
import { minimaxCnProvider } from "./minimax-cn.js";
import { mistralProvider } from "./mistral.js";
import { moonshotaiProvider } from "./moonshotai.js";
import { moonshotaiCnProvider } from "./moonshotai-cn.js";
import { nvidiaProvider } from "./nvidia.js";
import { openaiProvider } from "./openai.js";
import { openaiCodexProvider } from "./openai-codex.js";
import { opencodeProvider } from "./opencode.js";
import { opencodeGoProvider } from "./opencode-go.js";
import { openrouterProvider } from "./openrouter.js";
import { openrouterImagesProvider } from "./openrouter-images.js";
import { qwenTokenPlanProvider } from "./qwen-token-plan.js";
import { qwenTokenPlanCnProvider } from "./qwen-token-plan-cn.js";
import { qwenTokenPlanIndividualProvider } from "./qwen-token-plan-individual.js";
import { radiusProvider } from "./radius.js";
import { togetherProvider } from "./together.js";
import { vercelAIGatewayProvider } from "./vercel-ai-gateway.js";
import { xaiProvider } from "./xai.js";
import { xiaomiProvider } from "./xiaomi.js";
import { xiaomiTokenPlanAmsProvider } from "./xiaomi-token-plan-ams.js";
import { xiaomiTokenPlanCnProvider } from "./xiaomi-token-plan-cn.js";
import { xiaomiTokenPlanSgpProvider } from "./xiaomi-token-plan-sgp.js";
import { zaiProvider } from "./zai.js";
import { zaiCodingCnProvider } from "./zai-coding-cn.js";

export { radiusProvider };

/** Providers present in the generated catalog. `KnownProvider` additionally
 * includes purely dynamic providers (e.g. "radius") that have no static
 * catalog entry. */
export type BuiltinProvider = keyof typeof MODELS;

type BuiltinModelApi<
	TProvider extends BuiltinProvider,
	TModelId extends keyof (typeof MODELS)[TProvider],
> = (typeof MODELS)[TProvider][TModelId] extends { api: infer TApi } ? (TApi extends Api ? TApi : never) : never;

/** Typed read of the generated built-in catalog. */
export function getBuiltinModel<TProvider extends BuiltinProvider, TModelId extends keyof (typeof MODELS)[TProvider]>(
	provider: TProvider,
	modelId: TModelId,
): Model<BuiltinModelApi<TProvider, TModelId>> {
	const models = MODELS[provider] as Record<string, Model<Api>> | undefined;
	return models?.[modelId as string] as Model<BuiltinModelApi<TProvider, TModelId>>;
}

export function getBuiltinProviders(): BuiltinProvider[] {
	return Object.keys(MODELS) as BuiltinProvider[];
}

/** Generation timestamp shared by all built-in provider catalogs. */
export function getBuiltinModelDataGeneratedAt(): number | undefined {
	return undefined;
}

export function getBuiltinModels<TProvider extends BuiltinProvider>(
	provider: TProvider,
): Model<BuiltinModelApi<TProvider, keyof (typeof MODELS)[TProvider]>>[] {
	const models = MODELS[provider] as Record<string, Model<Api>> | undefined;
	return models
		? (Object.values(models) as Model<BuiltinModelApi<TProvider, keyof (typeof MODELS)[TProvider]>>[])
		: [];
}

/** All built-in providers, freshly constructed. */
export function builtinProviders(): Provider[] {
	return [
		amazonBedrockProvider(),
		antLingProvider(),
		anthropicProvider(),
		azureOpenAIResponsesProvider(),
		basetenProvider(),
		cerebrasProvider(),
		cloudflareAIGatewayProvider(),
		cloudflareWorkersAIProvider(),
		deepseekProvider(),
		fireworksProvider(),
		githubCopilotProvider(),
		googleProvider(),
		googleVertexProvider(),
		groqProvider(),
		huggingfaceProvider(),
		kimiCodingProvider(),
		minimaxProvider(),
		minimaxCnProvider(),
		mistralProvider(),
		moonshotaiProvider(),
		moonshotaiCnProvider(),
		nvidiaProvider(),
		openaiProvider(),
		openaiCodexProvider(),
		opencodeProvider(),
		opencodeGoProvider(),
		openrouterProvider(),
		qwenTokenPlanProvider(),
		qwenTokenPlanCnProvider(),
		qwenTokenPlanIndividualProvider(),
		radiusProvider(),
		togetherProvider(),
		vercelAIGatewayProvider(),
		xaiProvider(),
		xiaomiProvider(),
		xiaomiTokenPlanAmsProvider(),
		xiaomiTokenPlanCnProvider(),
		xiaomiTokenPlanSgpProvider(),
		zaiProvider(),
		zaiCodingCnProvider(),
	];
}

/** A `Models` collection with every built-in provider registered. */
export function builtinModels(options?: CreateModelsOptions): MutableModels {
	const models = createModels(options);
	for (const provider of builtinProviders()) {
		models.setProvider(provider);
	}
	return models;
}

/** All built-in image-generation providers, freshly constructed. */
export function builtinImagesProviders(): ImagesProvider[] {
	return [openrouterImagesProvider()];
}

/** An `ImagesModels` collection with every built-in image-generation provider registered. */
export function builtinImagesModels(options?: CreateModelsOptions): MutableImagesModels {
	const models = createImagesModels(options);
	for (const provider of builtinImagesProviders()) {
		models.setProvider(provider);
	}
	return models;
}
