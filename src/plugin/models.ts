/**
 * Dynamic model fetching from Berget API
 */

import { getModelsEndpoint } from "../constants";
import { logDebug, logError } from "./debug";

// Response from /v1/models/chat endpoint
interface ChatModel {
  aliases?: string[];
  contextWindow: number;
  id: string;
  inputPricePerToken: number;
  lifecycleState?: string;
  outputPricePerToken: number;
}

interface ChatModelsResponse {
  models: ChatModel[];
}

// Cache for models to avoid repeated API calls
let cachedModels: null | Record<string, object> = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clears the model cache (useful for testing or forcing refresh)
 */
export function clearModelCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}

/**
 * Fetches available chat models from Berget API
 * Uses /v1/models/chat which only returns text models (no embeddings, rerankers, whisper)
 */
export async function fetchBergetModels(): Promise<Record<string, object>> {
  // Return cached models if still valid
  if (cachedModels && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    logDebug("Returning cached models");
    return cachedModels;
  }

  logDebug("Fetching chat models from Berget API");

  try {
    const response = await fetch(getModelsEndpoint(), {
      headers: {
        "Content-Type": "application/json",
      },
      method: "GET",
    });

    if (!response.ok) {
      logError(`Failed to fetch models: ${response.status}`);
      return getDefaultModels();
    }

    const data = (await response.json()) as ChatModelsResponse;

    const models: Record<string, object> = {};

    for (const model of data.models) {
      models[model.id] = {
        contextWindow: model.contextWindow,
        // OpenCode model config
        name: model.id,
      };
    }

    // Cache the results
    cachedModels = models;
    cacheTimestamp = Date.now();

    logDebug(`Fetched ${Object.keys(models).length} chat models`);

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
    "meta-llama/Llama-3.1-8B-Instruct": {},
    "meta-llama/Llama-3.3-70B-Instruct": {},
    "mistralai/Mistral-Small-3.2-24B-Instruct-2506": {},
    "openai/gpt-oss-120b": {},
  };
}
