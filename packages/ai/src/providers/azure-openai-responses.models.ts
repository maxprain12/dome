import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const AZURE_OPENAI_RESPONSES_MODELS = MODELS["azure-openai-responses"] as unknown as Record<string, Model<Api>>;
