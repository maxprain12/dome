import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const NVIDIA_MODELS = MODELS["nvidia"] as unknown as Record<string, Model<Api>>;
