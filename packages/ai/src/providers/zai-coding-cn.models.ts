import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const ZAI_CODING_CN_MODELS = MODELS["zai-coding-cn"] as unknown as Record<string, Model<Api>>;
