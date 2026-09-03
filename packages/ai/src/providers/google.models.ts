import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const GOOGLE_MODELS = MODELS["google"] as unknown as Record<string, Model<Api>>;
