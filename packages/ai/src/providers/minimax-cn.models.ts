import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const MINIMAX_CN_MODELS = MODELS["minimax-cn"] as unknown as Record<string, Model<Api>>;
