/**
 * Dynamic model fetching from Berget API
 */

import { BERGET_INFERENCE_URL } from "../constants";
import { logDebug, logError } from "./debug";

interface BergetModel {
  id: string;
  name: string;
  object: string;
  model_type: string;
  owned_by: string;
  capabilities: {
    vision: boolean;
    function_calling: boolean;
    json_mode: boolean;
    streaming: boolean;
  };
  pricing: {
    input: number;
    output: number;
    unit: string;
    currency: string;
  };
  status: {
    up: boolean;
  };
}

interface ModelsResponse {
  object: string;
  data: BergetModel[];
}

// Cache for models to avoid repeated API calls
let cachedModels: Record<string, object> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches available models from Berget API
 * Only returns text/chat models that are currently up
 */
export async function fetchBergetModels(): Promise<Record<string, object>> {
  // Return cached models if still valid
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    logDebug("Returning cached models");
    return cachedModels;
  }

  logDebug("Fetching models from Berget API");

  try {
    const response = await fetch(`${BERGET_INFERENCE_URL}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      logError(`Failed to fetch models: ${response.status}`);
      return getDefaultModels();
    }

    const data = (await response.json()) as ModelsResponse;

    // Filter to only text models that are up and suitable for chat
    const models: Record<string, object> = {};

    for (const model of data.data) {
      // Only include text models that are currently available
      if (model.model_type === "text" && model.status.up) {
        models[model.id] = {
          // OpenCode model config
          name: model.name,
          capabilities: {
            functionCalling: model.capabilities.function_calling,
            jsonMode: model.capabilities.json_mode,
            streaming: model.capabilities.streaming,
            vision: model.capabilities.vision,
          },
        };
      }
    }

    // Cache the results
    cachedModels = models;
    cacheTimestamp = Date.now();

    logDebug(`Fetched ${Object.keys(models).length} text models`);

    return models;
  } catch (error) {
    logError("Error fetching models", error);
    return getDefaultModels();
  }
}

/**
 * Fallback models if API is unreachable
 */
function getDefaultModels(): Record<string, object> {
  return {
    "meta-llama/Llama-3.3-70B-Instruct": {},
    "meta-llama/Llama-3.1-8B-Instruct": {},
    "mistralai/Mistral-Small-3.2-24B-Instruct-2506": {},
    "openai/gpt-oss-120b": {},
  };
}

/**
 * Clears the model cache (useful for testing or forcing refresh)
 */
export function clearModelCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}
