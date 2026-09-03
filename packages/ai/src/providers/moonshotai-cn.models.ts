import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const MOONSHOTAI_CN_MODELS = MODELS["moonshotai-cn"] as unknown as Record<string, Model<Api>>;
