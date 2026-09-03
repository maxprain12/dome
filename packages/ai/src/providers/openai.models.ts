import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const OPENAI_MODELS = MODELS["openai"] as unknown as Record<string, Model<Api>>;
