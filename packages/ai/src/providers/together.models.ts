import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const TOGETHER_MODELS = MODELS["together"] as unknown as Record<string, Model<Api>>;
