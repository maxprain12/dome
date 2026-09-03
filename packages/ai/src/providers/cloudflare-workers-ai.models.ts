import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const CLOUDFLARE_WORKERS_AI_MODELS = MODELS["cloudflare-workers-ai"] as unknown as Record<string, Model<Api>>;
