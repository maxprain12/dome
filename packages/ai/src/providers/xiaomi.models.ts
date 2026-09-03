import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const XIAOMI_MODELS = MODELS["xiaomi"] as unknown as Record<string, Model<Api>>;
