import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const OPENAI_CODEX_MODELS = MODELS["openai-codex"] as unknown as Record<string, Model<Api>>;
