import type { Model, Plugin } from '@opencode/plugin';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchV2Models, registerProvider } from './provider';

vi.mock('../constants', () => ({
  BERGET_PROVIDER_ID: 'berget',
  getModelsEndpoint: () => 'https://api.berget.ai.test/v1/models/chat',
}));

import { VISION_MODELS } from '../plugin/models';

const MODELS_RESPONSE = {
  models: [
    {
      contextWindow: 262_144,
      id: 'qwen/qwen-model',
      inputPricePerToken: 0.000_001,
      outputPricePerToken: 0.000_002,
    },
    { contextWindow: 32_768, id: 'moonshotai/Kimi-K3' },
  ],
};

function mockFetchModelsResponse(payload: { data?: unknown; ok: boolean; status?: number }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      payload.ok
        ? Response.json(payload.data, { status: 200 })
        : new Response('error', { status: payload.status ?? 500 }),
    ),
  );
}

describe('fetchV2Models', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the chat catalog to Model.Info with per-million cost and context limit', async () => {
    mockFetchModelsResponse({ data: MODELS_RESPONSE, ok: true });

    const models = await fetchV2Models();

    expect(models).toHaveLength(2);
    const [first] = models;
    expect(first).toMatchObject({
      cost: [{ cache: { read: 0, write: 0 }, input: 1, output: 2 }],
      id: 'qwen/qwen-model',
      limit: { context: 262_144, output: 8192 },
      modelID: 'qwen/qwen-model',
      name: 'qwen/qwen-model',
      providerID: 'berget',
      status: 'active',
    });
  });

  it('marks known vision models with image input', async () => {
    expect(VISION_MODELS.has('moonshotai/Kimi-K3')).toBe(true);
    mockFetchModelsResponse({ data: MODELS_RESPONSE, ok: true });

    const models = await fetchV2Models();
    const kimi = models.find((model) => model.id === 'moonshotai/Kimi-K3');

    expect(kimi?.capabilities.input).toEqual(['text', 'image']);
  });

  it('returns an empty list when the catalog endpoint fails', async () => {
    mockFetchModelsResponse({ ok: false, status: 500 });

    await expect(fetchV2Models()).resolves.toEqual([]);
  });

  it('returns an empty list when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );

    await expect(fetchV2Models()).resolves.toEqual([]);
  });
});

describe('registerProvider', () => {
  interface CapturedEditor {
    added: unknown[];
    modelSets: Array<{ models: readonly Model.Info[]; providerID: string }>;
    updates: Array<[string, (provider: Record<string, unknown>) => void]>;
  }

  function createMockContext(existing?: {
    info: Record<string, unknown>;
    models: ReadonlyMap<string, Model.Info>;
  }): { context: Plugin.Context; editor: CapturedEditor } {
    const editor: CapturedEditor = { added: [], modelSets: [], updates: [] };
    const context = {
      provider: {
        transform: async (transformCallback: (editorArgument: unknown) => void) => {
          transformCallback({
            add: (input: unknown) => editor.added.push(input),
            get: (providerID: string) =>
              existing
                ? { models: existing.models, provider: existing.info, providerID }
                : undefined,
            models: {
              remove: () => {},
              set: (providerID: string, models: readonly Model.Info[]) =>
                editor.modelSets.push({ models, providerID }),
              update: () => {},
            },
            remove: () => {},
            update: (providerID: string, update: (provider: Record<string, unknown>) => void) =>
              editor.updates.push([providerID, update]),
          });
          return { dispose: async () => {} };
        },
      },
    } as unknown as Plugin.Context;

    return { context, editor };
  }

  function makeModel(id: string, providerID = 'berget'): Model.Info {
    return {
      capabilities: { input: ['text'], output: ['text'], tools: true },
      cost: [{ cache: { read: 0, write: 0 }, input: 1, output: 2 }],
      enabled: true,
      id,
      limit: { context: 1000, output: 8192 },
      modelID: id,
      name: id,
      providerID,
      status: 'active',
      time: { released: 0 },
      variants: [],
    } as unknown as Model.Info;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('updates the existing native provider in place and fills only missing models', async () => {
    const native = makeModel('native-model');
    const captured = createMockContext({
      info: { activation: 'auto', baseURL: 'https://native.test/v1' },
      models: new Map([['native-model', native]]),
    });

    const fetched = [makeModel('native-model'), makeModel('brand-new-model')];
    await registerProvider(captured.context, fetched);

    // No editor.add, no model inventory replace-and-lose.
    expect(captured.editor.added).toHaveLength(0);

    expect(captured.editor.updates).toHaveLength(1);
    const [providerID, update] = captured.editor.updates[0];
    expect(providerID).toBe('berget');

    const provider: Record<string, unknown> = { settings: { baseURL: 'https://native.test/v1' } };
    update(provider);
    expect(provider).toMatchObject({ activation: 'enabled', integrationID: 'berget' });
    expect((provider.settings as Record<string, string>).baseURL).toBe('https://native.test/v1');

    expect(captured.editor.modelSets).toHaveLength(1);
    const set = captured.editor.modelSets[0];
    expect(set.providerID).toBe('berget');
    expect(set.models.map((model) => model.id)).toEqual(['native-model', 'brand-new-model']);
  });

  it('adds the provider from scratch when the registry has none', async () => {
    const captured = createMockContext();

    const fetched = [makeModel('model-a')];
    await registerProvider(captured.context, fetched);

    expect(captured.editor.added).toEqual([
      {
        info: {
          activation: 'enabled',
          id: 'berget',
          integrationID: 'berget',
          name: 'Berget AI',
          package: '@opencode/ai/providers/openai-compatible',
          settings: {},
        },
        models: [fetched[0]],
      },
    ]);
    expect(captured.editor.modelSets).toHaveLength(0);
  });

  it('applies BERGET_INFERENCE_URL as baseURL override on the existing provider', async () => {
    vi.stubEnv('BERGET_INFERENCE_URL', 'https://stage.test/v1');
    const captured = createMockContext({
      info: {},
      models: new Map(),
    });

    await registerProvider(captured.context, []);

    const [, update] = captured.editor.updates[0];
    const provider: Record<string, unknown> = { settings: {} };
    update(provider);
    expect((provider.settings as Record<string, string>).baseURL).toBe('https://stage.test/v1');
  });

  it('does not re-set models the native catalog already defines', async () => {
    const known = new Map([
      ['moonshotai/Kimi-K3', makeModel('moonshotai/Kimi-K3')],
      ['qwen/qwen-model', makeModel('qwen/qwen-model')],
    ]);
    const captured = createMockContext({ info: {}, models: known });

    const models = await fetchV2Models();
    await registerProvider(captured.context, models);

    expect(captured.editor.updates).toHaveLength(1);
    expect(captured.editor.modelSets).toHaveLength(0);
  });
});
