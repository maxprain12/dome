import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const CLOUDFLARE_AI_GATEWAY_MODELS = MODELS["cloudflare-ai-gateway"] as unknown as Record<string, Model<Api>>;
