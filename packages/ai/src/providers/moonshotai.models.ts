import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const MOONSHOTAI_MODELS = MODELS["moonshotai"] as unknown as Record<string, Model<Api>>;
