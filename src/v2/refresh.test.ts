import type { Model, Plugin } from '@opencode/plugin';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mergeModels, refreshModels } from './provider';

vi.mock('../constants', () => ({
  BERGET_PROVIDER_ID: 'berget',
  getModelsEndpoint: () => 'https://api.berget.ai.test/v1/models/chat',
}));

interface MockContext {
  context: Plugin.Context;
  finalProviderModels: readonly Model.Info[];
  reloads: number;
}

/**
 * Emulates the real registry contract: a transform edit is applied to a copy
 * immediately, and a reload marks the captured input changed so the next read
 * rebuilds. `finalProviderModels` simulates that latest state.
 */
function createMockContext(existingModels: readonly Model.Info[]): MockContext {
  const state = {
    models: [...existingModels],
    reloads: 0,
  };
  const context = {
    provider: {
      reload: async () => {
        state.reloads += 1;
      },
      transform: async (transformCallback: (editorArgument: unknown) => void) => {
        transformCallback({
          get: (providerID: string) =>
            providerID === 'berget'
              ? { models: new Map(state.models.map((m) => [m.id, m])), providerID }
              : undefined,
          models: {
            set: (_providerID: string, models: readonly Model.Info[]) => {
              state.models = [...models];
            },
          },
          update: () => {},
        });
        return { dispose: async () => {} };
      },
    },
  } as unknown as Plugin.Context;
  return {
    context,
    get finalProviderModels() {
      return state.models;
    },
    reloads: 0,
  };
}

function makeModel(id: string): Model.Info {
  return {
    capabilities: { input: ['text'], output: ['text'], tools: true },
    cost: [{ cache: { read: 0, write: 0 }, input: 0, output: 0 }],
    enabled: true,
    id,
    limit: { context: 1000, output: 8192 },
    modelID: id,
    name: id,
    providerID: 'berget',
    status: 'active',
    time: { released: 0 },
    variants: [],
  } as unknown as Model.Info;
}

describe('mergeModels', () => {
  it('lets fetched models win on id collision and keeps unknown existing entries', () => {
    const existing = [makeModel('native/old'), makeModel('api/same')];
    const fresh = [makeModel('api/same'), makeModel('brand/new')];

    const merged = mergeModels(existing, fresh);

    expect(merged.map((m) => m.id)).toEqual(['native/old', 'api/same', 'brand/new']);
  });

  it('preserves native reasoning controls and variants when the live model wins', () => {
    // models.dev knows Kimi-K3.1-Pro supports thinking; /chat has no such
    // field. After a merge the model must still offer /thinking + /variants.
    const native = {
      ...makeModel('moonshotai/Kimi-K3.1-Pro'),
      capabilities: {
        input: ['text'],
        output: ['text'],
        reasoning: { effort: ['low', 'high'], supported: true, toggle: true },
        tools: true,
      },
      name: 'Kimi K3.1 Pro',
      variants: [
        { id: 'high', settings: {} },
        { id: 'low', settings: {} },
      ],
    } as unknown as Model.Info;
    const fresh = {
      ...makeModel('moonshotai/Kimi-K3.1-Pro'),
      capabilities: { input: ['text', 'image'], output: ['text'], tools: true },
      name: 'moonshotai/Kimi-K3.1-Pro',
      variants: [],
    } as unknown as Model.Info;

    const [merged] = mergeModels([native], [fresh]);

    expect(merged?.capabilities.input).toEqual(['text', 'image']);
    expect((merged?.capabilities as Record<string, unknown>).reasoning).toEqual({
      effort: ['low', 'high'],
      supported: true,
      toggle: true,
    });
    expect(merged?.variants.map((v) => v.id)).toEqual(['high', 'low']);
    expect(merged?.name).toBe('Kimi K3.1 Pro');
  });

  it('marks models.dev-only entries disabled when the live catalog drops them', () => {
    // e.g. moonshotai/Kimi-K3: removed upstream but still present in models.dev
    const existing = [makeModel('moonshotai/Kimi-K3')];
    const fresh = [makeModel('moonshotai/Kimi-K3.1-Pro')];

    const merged = mergeModels(existing, fresh);

    const retired = merged.find((m) => m.id === 'moonshotai/Kimi-K3');
    expect(retired?.enabled).toBe(false);
    const current = merged.find((m) => m.id === 'moonshotai/Kimi-K3.1-Pro');
    expect(current?.enabled).toBe(true);
  });
});

describe('refreshModels', () => {
  it('merges fetched models into the provider and marks the registry for rebuild', async () => {
    const existing = [makeModel('model/a')];
    const captured = createMockContext(existing);

    await refreshModels(captured.context, [makeModel('model/b')]);

    expect(captured.finalProviderModels.map((m) => m.id)).toEqual(['model/a', 'model/b']);
  });
});

describe('setupBergetAuth periodic refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // vi.doMock only affects fresh module evaluations — clear the cache so
    // each test imports its own setup with its own mocks.
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('refreshes on the interval with the configured default and stops on cleanup', async () => {
    const catalog = [makeModel('model/a')];
    const fetchV2Models = vi.fn(async () => {
      return catalog;
    });
    const refreshModels = vi.fn(async () => {});
    const registerIntegration = vi.fn(async () => {});
    const importV1Credential = vi.fn(async () => {});
    const registerProvider = vi.fn(async () => {});

    vi.doMock('./provider', () => ({ fetchV2Models, refreshModels, registerProvider }));
    vi.doMock('./integration', () => ({ registerIntegration }));
    vi.doMock('./migrate', () => ({ importV1Credential }));

    const { setupBergetAuth } = await import('./setup');
    const cleanup = await setupBergetAuth(createMockContext([]).context);

    expect(registerProvider).toHaveBeenCalledTimes(1);
    expect(fetchV2Models).toHaveBeenCalledTimes(1); // the setup-time fetch

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    expect(refreshModels).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(refreshModels).toHaveBeenCalledTimes(2);

    cleanup?.();
    await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    // no further refreshes after cleanup
    expect(refreshModels).toHaveBeenCalledTimes(2);
  });

  it('skips the refresh when the fetch fails (empty catalog), keeping models enabled', async () => {
    const refreshModels = vi.fn(async () => {});
    vi.doMock('./provider', () => ({
      // fetchV2Models returns [] on network failure / non-200
      fetchV2Models: vi.fn(async () => []),
      refreshModels,
      registerProvider: vi.fn(async () => {}),
    }));
    vi.doMock('./integration', () => ({ registerIntegration: vi.fn(async () => {}) }));
    vi.doMock('./migrate', () => ({ importV1Credential: vi.fn(async () => {}) }));

    const { setupBergetAuth } = await import('./setup');
    const cleanup = await setupBergetAuth(createMockContext([]).context);

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    // The refresh must NOT run with an empty catalog: mergeModels would
    // otherwise disable every known model on a transient API failure.
    expect(refreshModels).not.toHaveBeenCalled();
    cleanup?.();
  });

  it('honors BERGET_MODELS_REFRESH_MS so tests and staging can shorten the interval', async () => {
    process.env['BERGET_MODELS_REFRESH_MS'] = '100';
    const refreshModels = vi.fn(async () => {});
    vi.doMock('./provider', () => ({
      fetchV2Models: vi.fn(async () => [makeModel('model/a')]),
      refreshModels,
      registerProvider: vi.fn(async () => {}),
    }));
    vi.doMock('./integration', () => ({ registerIntegration: vi.fn(async () => {}) }));
    vi.doMock('./migrate', () => ({ importV1Credential: vi.fn(async () => {}) }));

    const { setupBergetAuth } = await import('./setup');
    const cleanup = await setupBergetAuth(createMockContext([]).context);

    await vi.advanceTimersByTimeAsync(350);
    expect(refreshModels).toHaveBeenCalledTimes(3);
    cleanup?.();
  });
});
