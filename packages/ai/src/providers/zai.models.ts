import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const ZAI_MODELS = MODELS["zai"] as unknown as Record<string, Model<Api>>;
