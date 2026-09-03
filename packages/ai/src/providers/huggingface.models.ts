import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const HUGGINGFACE_MODELS = MODELS["huggingface"] as unknown as Record<string, Model<Api>>;
