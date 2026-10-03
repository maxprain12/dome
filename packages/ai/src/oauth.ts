/** Runtime helpers used by Electron (`import('@dome/ai/oauth')`). */
export {
	loginAnthropic,
	refreshAnthropicToken,
	loginOpenAICodex,
	loginOpenAICodexDeviceCode,
	refreshOpenAICodexToken,
} from "./utils/oauth/index.js";

/** Type-only compatibility entry point for coding-agent extension OAuth declarations. */
export type {
	OAuthAuthInfo,
	OAuthCredentials,
	OAuthDeviceCodeInfo,
	OAuthLoginCallbacks,
	OAuthPrompt,
	OAuthSelectOption,
	OAuthSelectPrompt,
} from "./compat/extension-oauth-types.js";
