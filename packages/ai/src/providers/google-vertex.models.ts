import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const GOOGLE_VERTEX_MODELS = MODELS["google-vertex"] as unknown as Record<string, Model<Api>>;
