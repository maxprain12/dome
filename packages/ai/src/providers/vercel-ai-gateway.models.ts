import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const VERCEL_AI_GATEWAY_MODELS = MODELS["vercel-ai-gateway"] as unknown as Record<string, Model<Api>>;
