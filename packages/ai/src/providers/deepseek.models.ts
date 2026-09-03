import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const DEEPSEEK_MODELS = MODELS["deepseek"] as unknown as Record<string, Model<Api>>;
