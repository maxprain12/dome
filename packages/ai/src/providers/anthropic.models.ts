import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const ANTHROPIC_MODELS = MODELS["anthropic"] as unknown as Record<string, Model<Api>>;
