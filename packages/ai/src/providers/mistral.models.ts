import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const MISTRAL_MODELS = MODELS["mistral"] as unknown as Record<string, Model<Api>>;
