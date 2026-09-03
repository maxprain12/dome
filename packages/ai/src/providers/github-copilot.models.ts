import type { Api, Model } from "../types.js";
import { MODELS } from "../models.legacy-catalog.js";

export const GITHUB_COPILOT_MODELS = MODELS["github-copilot"] as unknown as Record<string, Model<Api>>;
