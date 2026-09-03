import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const OPENCODE_MODELS = MODELS["opencode"] as unknown as Record<string, Model<Api>>;
