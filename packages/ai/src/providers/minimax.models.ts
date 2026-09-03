import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const MINIMAX_MODELS = MODELS["minimax"] as unknown as Record<string, Model<Api>>;
