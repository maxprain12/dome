import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const OPENROUTER_MODELS = MODELS["openrouter"] as unknown as Record<string, Model<Api>>;
