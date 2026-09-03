import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const FIREWORKS_MODELS = MODELS["fireworks"] as unknown as Record<string, Model<Api>>;
