import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const ANT_LING_MODELS = MODELS["ant-ling"] as unknown as Record<string, Model<Api>>;
