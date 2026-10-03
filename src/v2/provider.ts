/**
 * OpenCode V2 provider registration for Berget.
 *
 * The CLI already knows `berget` from models.dev (provider definition, model
 * catalog, env-key auth). This module's V2-specific jobs:
 *
 * 1. Bind the integration credential to the provider (`integrationID`) and
 *    keep V1's always-on activation behavior.
 * 2. Honor V1's `BERGET_INFERENCE_URL` environment override (baseURL is left
 *    as the native value otherwise).
 * 3. Fill in models the live `/v1/models/chat` catalog lists that models.dev
 *    does not yet know, without clobbering the richer native definitions.
 *
 * Models are fetched once in `setup` and captured by the synchronous
 * transform (transforms must be cheap and side-effect-free; call
 * `ctx.provider.reload()` if the captured data changes later).
 */

import type { Model, Plugin, Provider } from '@opencode/plugin';

import { BERGET_PROVIDER_ID, getModelsEndpoint } from '../constants';
import { logDebug, logError } from '../plugin/debug';
import { VISION_MODELS } from '../plugin/models';

const PROVIDER_PACKAGE = '@opencode/ai/providers/openai-compatible';
const DEFAULT_OUTPUT_LIMIT = 8192;

interface ChatModel {
  contextWindow?: number;
  id: string;
  inputPricePerToken?: number;
  outputPricePerToken?: number;
}

interface ChatModelsResponse {
  models: ChatModel[];
}

/**
 * Fetches the live chat-model catalog (unauthenticated, like V1). Returns an
 * empty list on failure — the native models.dev catalog remains the baseline.
 */
export async function fetchV2Models(): Promise<Model.Info[]> {
  try {
    const response = await fetch(getModelsEndpoint(), { method: 'GET' });
    if (!response.ok) {
      logError(`Failed to fetch V2 models: ${response.status}`);
      return [];
    }
    const data = (await response.json()) as ChatModelsResponse;
    // limit.context is a required Int in Model.Info — a model without a
    // usable contextWindow is excluded rather than registered with a bogus 0.
    const models = data.models
      .filter(hasContextWindow)
      .map((model) => toModelInfo(BERGET_PROVIDER_ID, model));
    if (models.length !== data.models.length) {
      logDebug(`Skipped ${data.models.length - models.length} chat models without contextWindow`);
    }
    logDebug(`Fetched ${models.length} chat models for V2`);
    return models;
  } catch (error) {
    logError('Error fetching V2 models', error);
    return [];
  }
}

/**
 * Registers the provider. Existing definitions (models.dev) are updated in
 * place — binding + activation + optional env override — and only models
 * missing from the native catalog are added. A missing provider is added from
 * scratch with the full fetched catalog.
 */
export function registerProvider(
  context: Plugin.Context,
  models: readonly Model.Info[],
): Promise<unknown> {
  return context.provider.transform((editor) => {
    const existing = editor.get(BERGET_PROVIDER_ID);
    // Same runtime override V1 supported; absent env keeps the native baseURL.
    const baseURL = process.env.BERGET_INFERENCE_URL;

    if (existing) {
      editor.update(BERGET_PROVIDER_ID, (provider) => {
        provider.integrationID = BERGET_PROVIDER_ID as unknown as typeof provider.integrationID;
        provider.activation = 'enabled';
        if (baseURL) {
          provider.settings = { ...provider.settings, baseURL };
        }
      });

      const known = new Set(existing.models.keys());
      const missing = models.filter((model) => !known.has(model.id));
      if (missing.length > 0) {
        editor.models.set(BERGET_PROVIDER_ID, [...existing.models.values(), ...missing]);
      }
      return;
    }

    editor.add({
      info: {
        activation: 'enabled',
        id: BERGET_PROVIDER_ID,
        integrationID: BERGET_PROVIDER_ID,
        name: 'Berget AI',
        package: PROVIDER_PACKAGE,
        settings: baseURL ? { baseURL } : {},
      } as unknown as Provider.Info,
      models: [...models],
    });
  });
}

function hasContextWindow(model: ChatModel): model is ChatModel & { contextWindow: number } {
  return Number.isFinite(model.contextWindow);
}

function toModelInfo(providerID: string, model: ChatModel & { contextWindow: number }): Model.Info {
  const input = VISION_MODELS.has(model.id) ? ['text', 'image'] : ['text'];

  return {
    // Model.Info ids are branded plain strings at runtime; no SDK executes here.
    capabilities: { input, output: ['text'], tools: true },
    cost: [
      {
        cache: { read: 0, write: 0 },
        // API reports USD per token; Model.Info costs are USD per million.
        input: (model.inputPricePerToken ?? 0) * 1_000_000,
        output: (model.outputPricePerToken ?? 0) * 1_000_000,
      },
    ],
    enabled: true,
    id: model.id,
    limit: { context: model.contextWindow, output: DEFAULT_OUTPUT_LIMIT },
    modelID: model.id,
    name: model.id,
    providerID,
    status: 'active',
    time: { released: 0 },
    variants: [],
  } as unknown as Model.Info;
}
