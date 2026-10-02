export type { Static, TSchema } from 'typebox';
export { Type } from 'typebox';

export * from './core.js';
export {
	complete,
	completeSimple,
	getApiProvider,
	getApiProviders,
	getModel,
	getModels,
	getProviders,
	registerApiProvider,
	resetApiProviders,
	stream,
	streamSimple,
} from './compat.js';
export type { BuiltinProvider } from './providers/all.js';

export * from './tool-schema.js';
export { legacyMessagesToContext, mapThinkingLevel } from './legacy-bridge.js';
export { resolveProviderAuth } from './auth/resolve.js';
export { builtinProviders } from './providers/all.js';
export {
	domeUsageToLegacy,
	extractTextFromAssistantMessage,
	legacyUsageToDome,
	resolveDomeModel,
} from './dome-bridge.js';
export type { DomeLegacyProvider, ResolveDomeModelOptions } from './dome-bridge.js';
export {
	OLLAMA_LOCAL_PLACEHOLDER_KEY,
	ollamaRequiresApiKey,
	resolveOllamaMode,
} from './ollama-mode.js';
export type { OllamaMode } from './ollama-mode.js';

export * from "./images-models.js";
export type { ImageApi as ImagesApi, ImageModel as ImagesModel } from "./types.js";
