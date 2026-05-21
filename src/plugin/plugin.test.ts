import type { Auth, Provider } from '@opencode-ai/sdk';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OAuthAuthDetails, PluginInput } from '../plugin/types';

import { BergetAuthPlugin } from '../plugin';

vi.mock('../constants', () => ({
  ACCESS_TOKEN_EXPIRY_BUFFER_MS: 60_000,
  BERGET_PROVIDER_ID: 'berget',
  getInferenceUrl: () => 'https://api.berget.ai/v1',
  getModelsEndpoint: () => 'https://api.berget.ai/v1/models/chat',
  getTokenRefreshEndpoint: () => 'https://api.berget.ai/v1/auth/refresh',
}));

vi.mock('../plugin/models', () => ({
  fetchBergetModels: vi.fn().mockResolvedValue({}),
}));

type FetchArgument = Request | string | URL;

type FetchLike = (input: FetchArgument, init?: RequestInit) => Promise<Response>;

function createMockClient(): PluginInput['client'] {
  return {
    auth: {
      // eslint-disable-next-line unicorn/no-useless-undefined
      set: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as PluginInput['client'];
}

describe('BergetAuthPlugin loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns custom fetch for API key auth that injects Bearer header', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const getAuth = vi.fn().mockResolvedValue({
      key: 'sk-berget-test-key',
      type: 'api',
    }) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    expect(result.apiKey).toBe('sk-berget-test-key');
    expect(result.fetch).toBeDefined();

    // Simulate a fetch request
    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const response = await (result.fetch as FetchLike)('https://api.berget.ai/v1/chat', {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer sk-berget-test-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(response.status).toBe(200);
  });

  // Issue #2 regression: Request object headers must NOT be dropped
  it('preserves Request object headers in API key auth fetch', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const getAuth = vi.fn().mockResolvedValue({
      key: 'sk-berget-test-key',
      type: 'api',
    }) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    // Pass a Request object carrying headers but no init argument
    const request = new Request('https://api.berget.ai/v1/chat', {
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'abc-123' },
    });

    await (result.fetch as FetchLike)(request);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer sk-berget-test-key');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request-ID')).toBe('abc-123');
  });

  it('returns empty object when auth is not OAuth and has no key', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const getAuth = vi.fn().mockResolvedValue({ type: 'api' }) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    expect(result).toEqual({});
  });

  it('makes request normally when OAuth token is not expired', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const auth: OAuthAuthDetails = {
      access: 'valid-token',
      expires: Date.now() + 3600 * 1000, // Far in the future
      refresh: 'refresh-token',
      type: 'oauth',
    };

    const getAuth = vi.fn().mockResolvedValue(auth) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    const response = await (result.fetch as FetchLike)('https://api.berget.ai/v1/chat');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer valid-token');
    expect(response.status).toBe(200);
  });

  // Issue #2 regression: Request object headers must NOT be dropped in OAuth path
  it('preserves Request object headers in OAuth auth fetch', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const auth: OAuthAuthDetails = {
      access: 'valid-token',
      expires: Date.now() + 3600 * 1000, // Far in the future
      refresh: 'refresh-token',
      type: 'oauth',
    };

    const getAuth = vi.fn().mockResolvedValue(auth) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', mockFetch);

    // Pass a Request object carrying headers but no init argument
    const request = new Request('https://api.berget.ai/v1/chat', {
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'abc-456' },
    });

    await (result.fetch as FetchLike)(request);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer valid-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request-ID')).toBe('abc-456');
  });

  it('refreshes expired token and proceeds with new token on success', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const auth: OAuthAuthDetails = {
      access: 'expired-token',
      expires: Date.now() - 1000, // Expired
      refresh: 'valid-refresh-token',
      type: 'oauth',
    };

    const getAuth = vi.fn().mockResolvedValue(auth) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    // Mock the token refresh endpoint
    const refreshFetch = vi.fn().mockResolvedValue({
      json: async () => ({ expires_in: 3600, token: 'new-token' }),
      ok: true,
    } as Response);

    const mockFetch = vi.fn().mockResolvedValue(new Response('OK'));
    vi.stubGlobal('fetch', (...arguments_: [FetchArgument, init?: RequestInit]) => {
      const url = arguments_[0];
      if (typeof url === 'string' && url.includes('/v1/auth/refresh')) {
        return refreshFetch(...arguments_);
      }
      return mockFetch(...arguments_);
    });

    const response = await (result.fetch as FetchLike)('https://api.berget.ai/v1/chat');

    expect(refreshFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, requestInit] = mockFetch.mock.calls[0];
    const headers = new Headers((requestInit as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer new-token');
    expect(response.status).toBe(200);
  });

  it('throws clear error when token refresh fails', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const auth: OAuthAuthDetails = {
      access: 'expired-token',
      expires: Date.now() - 1000, // Expired
      refresh: 'invalid-refresh-token',
      type: 'oauth',
    };

    const getAuth = vi.fn().mockResolvedValue(auth) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    // Mock token refresh to fail with 400 invalid_grant
    const refreshFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
    } as Response);

    vi.stubGlobal('fetch', (...arguments_: [FetchArgument, init?: RequestInit]) => {
      const url = arguments_[0];
      if (typeof url === 'string' && url.includes('/v1/auth/refresh')) {
        return refreshFetch(...arguments_);
      }
      return Promise.resolve(new Response('OK'));
    });

    await expect((result.fetch as FetchLike)('https://api.berget.ai/v1/chat')).rejects.toThrow(
      'Token refresh failed: Refresh token is invalid or revoked',
    );
  });

  it('throws clear error on network failure during token refresh', async () => {
    const client = createMockClient();
    const plugin = await BergetAuthPlugin({ client } as PluginInput);
    const loader = plugin.auth && plugin.auth.loader;

    expect(loader).toBeDefined();

    const auth: OAuthAuthDetails = {
      access: 'expired-token',
      expires: Date.now() - 1000, // Expired
      refresh: 'valid-refresh-token',
      type: 'oauth',
    };

    const getAuth = vi.fn().mockResolvedValue(auth) as unknown as () => Promise<Auth>;

    const result = await (loader as NonNullable<typeof loader>)(getAuth, {
      id: 'berget',
    } as unknown as Provider);

    // Mock token refresh to throw network error
    const refreshFetch = vi.fn().mockRejectedValue(new Error('DNS lookup failed'));

    vi.stubGlobal('fetch', (...arguments_: [FetchArgument, init?: RequestInit]) => {
      const url = arguments_[0];
      if (typeof url === 'string' && url.includes('/v1/auth/refresh')) {
        return refreshFetch(...arguments_);
      }
      return Promise.resolve(new Response('OK'));
    });

    await expect((result.fetch as FetchLike)('https://api.berget.ai/v1/chat')).rejects.toThrow(
      'Token refresh failed: Network error: DNS lookup failed',
    );
  });
});
