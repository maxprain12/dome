import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const XAI_MODELS = MODELS["xai"] as unknown as Record<string, Model<Api>>;
