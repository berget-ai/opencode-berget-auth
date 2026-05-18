import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OAuthAuthDetails, PluginInput } from './types';

import { refreshAccessTokenDirect } from './token';

vi.mock('../constants', () => ({
  ACCESS_TOKEN_EXPIRY_BUFFER_MS: 60_000,
  getTokenRefreshEndpoint: () => 'https://api.berget.ai/v1/auth/refresh',
}));

type MockClient = {
  auth: {
    set: ReturnType<typeof vi.fn>;
  };
};

function createMockClient(): MockClient {
  return {
    auth: {
      // eslint-disable-next-line unicorn/no-useless-undefined
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function suppressConsole() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  return { errorSpy, warnSpy };
}

describe('refreshAccessTokenDirect', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns failure when no refresh token is available', async () => {
    const auth: OAuthAuthDetails = { refresh: '', type: 'oauth' };

    const result = await refreshAccessTokenDirect(auth);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('result should be failure');
    expect(result.reason).toBe('No refresh token available');
  });

  it('successfully refreshes access token and persists to OpenCode', async () => {
    const newToken = 'new-access-token';
    const expiresIn = 3600;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ expires_in: expiresIn, token: newToken }),
        ok: true,
      } as Response),
    );

    const client = createMockClient();
    const auth: OAuthAuthDetails = {
      access: 'old-access',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-1',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('result should be success');
    expect(result.auth.access).toBe(newToken);
    expect(result.auth.refresh).toBe('refresh-token-1');
    expect(result.auth.expires).toBeGreaterThan(Date.now());

    expect(client.auth.set).toHaveBeenCalledTimes(1);
    expect(client.auth.set).toHaveBeenCalledWith({
      body: {
        access: newToken,
        expires: expect.any(Number),
        refresh: 'refresh-token-1',
        type: 'oauth',
      },
      path: { id: 'berget' },
    });
  });

  it('persists rotated refresh token when server returns a new one', async () => {
    const newToken = 'rotated-access';
    const newRefresh = 'rotated-refresh';
    const expiresIn = 3600;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          expires_in: expiresIn,
          refresh_token: newRefresh,
          token: newToken,
        }),
        ok: true,
      } as Response),
    );

    const client = createMockClient();
    const auth: OAuthAuthDetails = {
      access: 'old-access',
      expires: Date.now() - 1000,
      refresh: 'old-refresh-2',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('result should be success');
    expect(result.auth.refresh).toBe(newRefresh);
    expect(client.auth.set).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          access: newToken,
          refresh: newRefresh,
        }),
      }),
    );
  });

  it('does not persist when client is not provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ expires_in: 3600, token: 'token' }),
        ok: true,
      } as Response),
    );

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-3',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth);

    expect(result.success).toBe(true);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    // client.auth.set was never called because no client was passed
  });

  it('survives persistence failure and still returns refreshed tokens', async () => {
    const { warnSpy } = suppressConsole();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ expires_in: 3600, token: 'token' }),
        ok: true,
      } as Response),
    );

    const client = createMockClient();

    client.auth.set.mockRejectedValue(new Error('Disk full'));

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-4',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('result should be success');
    expect(result.auth.access).toBe('token');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Berget Auth] Failed to persist token refresh:',
      expect.any(Error),
    );
  });

  it('does not persist when refreshed token lacks access or expires', async () => {
    const client = createMockClient();

    // This scenario is defensive—API contract says token is always present,
    // but we guard against it. Simulate by returning empty token.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ expires_in: 3600, token: '' }),
        ok: true,
      } as Response),
    );

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-5',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);

    expect(result.success).toBe(true);
    // Because access is empty string (falsy), persistence is skipped
    expect(client.auth.set).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent refresh requests with the same refresh token', async () => {
    let capturedResolve: ((value: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      capturedResolve = resolve;
    });

    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise));

    const client = createMockClient();
    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-6',
      type: 'oauth',
    };

    const promise1 = refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);
    const promise2 = refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);

    // Only one fetch should have been initiated
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);

    // Resolve the pending fetch
    capturedResolve?.({
      json: async () => ({ expires_in: 3600, token: 'token' }),
      ok: true,
    } as Response);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toEqual(result2);
    expect(client.auth.set).toHaveBeenCalledTimes(1);
  });

  it('handles 400 invalid_grant error gracefully', async () => {
    const { warnSpy } = suppressConsole();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'invalid_grant' }),
      } as Response),
    );

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-7',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('result should be failure');
    expect(result.reason).toBe('Refresh token is invalid or revoked');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Berget Auth] Refresh token is invalid or revoked. Please run `opencode auth login` to reauthenticate.',
    );
  });

  it('handles 401 invalid_token error gracefully', async () => {
    const { warnSpy } = suppressConsole();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: 'invalid_token' }),
      } as Response),
    );

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-8',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('result should be failure');
    expect(result.reason).toBe('Refresh token is invalid or revoked');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Berget Auth] Refresh token is invalid or revoked. Please run `opencode auth login` to reauthenticate.',
    );
  });

  it('handles generic 4xx/5xx errors gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      } as Response),
    );

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-9',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('result should be failure');
    expect(result.reason).toBe('Token refresh failed: HTTP 503');
  });

  it('handles network errors gracefully', async () => {
    const { errorSpy } = suppressConsole();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

    const auth: OAuthAuthDetails = {
      access: 'old',
      expires: Date.now() - 1000,
      refresh: 'refresh-token-10',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth);

    expect(result.success).toBe(false);
    if (result.success) throw new Error('result should be failure');
    expect(result.reason).toBe('Network error: Network failure');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to refresh Berget access token:',
      expect.any(Error),
    );
  });

  /**
   * Regression test for token persistence.
   *
   * Bug: Tokens were refreshed in-memory by `refreshAccessTokenDirect()` but
   * never persisted.  On the next OpenCode startup `getAuth()` returned the
   * old (stale) tokens, forcing users to re-authenticate every time the
   * access token expired.
   *
   * Fix: `refreshAccessTokenDirect()` now accepts an optional `client`
   * parameter and calls `client.auth.set()` after a successful refresh.
   *
   * If this test fails it means the persistence step has been removed or
   * broken.
   */
  it('regression: persisted refreshed tokens must survive restarts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ expires_in: 3600, token: 'new-access-token' }),
        ok: true,
      } as Response),
    );

    const client = createMockClient();
    const auth: OAuthAuthDetails = {
      access: 'old-access',
      expires: Date.now() - 1000,
      refresh: 'regression-refresh',
      type: 'oauth',
    };

    const result = await refreshAccessTokenDirect(auth, client as unknown as PluginInput['client']);

    // Token must still be usable in-memory for the current session.
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('result should be success');
    expect(result.auth.access).toBe('new-access-token');

    // Token must be persisted so that the next OpenCode restart can load it.
    expect(client.auth.set).toHaveBeenCalledTimes(1);
    expect(client.auth.set).toHaveBeenCalledWith({
      body: {
        access: 'new-access-token',
        expires: expect.any(Number),
        refresh: 'regression-refresh',
        type: 'oauth',
      },
      path: { id: 'berget' },
    });
  });
});
