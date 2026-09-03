import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const KIMI_CODING_MODELS = MODELS["kimi-coding"] as unknown as Record<string, Model<Api>>;
