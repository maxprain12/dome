import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const OPENCODE_GO_MODELS = MODELS["opencode-go"] as unknown as Record<string, Model<Api>>;
