import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const GROQ_MODELS = MODELS["groq"] as unknown as Record<string, Model<Api>>;
