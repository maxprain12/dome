import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const AMAZON_BEDROCK_MODELS = MODELS["amazon-bedrock"] as unknown as Record<string, Model<Api>>;
