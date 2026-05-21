import type { AuthOAuthResult } from './types';
import * as http from 'node:http';
import * as url from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../constants', () => ({
  ACCESS_TOKEN_EXPIRY_BUFFER_MS: 60_000,
  getKeycloakRealm: () => 'berget',
  getKeycloakUrl: () => 'https://keycloak.berget.ai',
  KEYCLOAK_CLIENT_ID: 'berget-code',
  PKCE_CALLBACK_PORT: 8787,
}));

vi.mock('./debug', () => ({
  logDebug: vi.fn(),
}));

// Capture what arguments are passed to server.listen()
let capturedListenArgs: unknown[] | undefined;

vi.mock('node:http', async () => {
  const actual = await vi.importActual<typeof import('node:http')>('node:http');

  return {
    ...actual,
    createServer: (...args: Parameters<typeof actual.createServer>) => {
      const server = actual.createServer(...args);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.listen = (...listenArgs: any[]) => {
        capturedListenArgs = listenArgs;
        return server;
      };

      return server;
    },
  };
});

// Dynamic import so the mocks apply before the subject module is loaded
async function loadSubject() {
  const mod = await import('./pkce-flow');
  return mod.createPkceAuthorizeMethod;
}

async function loadHandleCallbackRequest() {
  const mod = await import('./pkce-flow');
  return mod.handleCallbackRequest;
}

async function loadExchangeCodeForTokens() {
  const mod = await import('./pkce-flow');
  return mod.exchangeCodeForTokens;
}

describe('handleCallbackRequest - Issue #4', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('includes error_description in the error message when present', async () => {
    const handleCallbackRequest = await loadHandleCallbackRequest();

    const mockResponse = {
      end: vi.fn(),
      writeHead: vi.fn(),
    } as unknown as http.ServerResponse;

    const mockServer = {
      close: vi.fn(),
    } as unknown as http.Server;

    const parsedUrl = url.parse(
      '/callback?error=access_denied&error_description=User+denied+consent',
      true,
    );

    let resolvedResult: AuthOAuthResult | undefined;

    await handleCallbackRequest(
      mockResponse,
      mockServer,
      parsedUrl,
      'valid-state',
      'verifier',
      'http://localhost:8787/callback',
      (value) => {
        resolvedResult = value as unknown as AuthOAuthResult;
      },
    );

    expect(resolvedResult).toBeDefined();
    if (typeof resolvedResult !== 'object' || resolvedResult === null) throw new Error('expected object');
    expect((resolvedResult as { type: string }).type).toBe('failed');
    if ((resolvedResult as { type: string }).type !== 'failed') throw new Error('expected failed');
    expect((resolvedResult as { error?: string }).error).toContain('access_denied');
    expect((resolvedResult as { error?: string }).error).toContain('User denied consent');
  });

  it('falls back to error code alone when error_description is absent', async () => {
    const handleCallbackRequest = await loadHandleCallbackRequest();

    const mockResponse = {
      end: vi.fn(),
      writeHead: vi.fn(),
    } as unknown as http.ServerResponse;

    const mockServer = {
      close: vi.fn(),
    } as unknown as http.Server;

    const parsedUrl = url.parse('/callback?error=invalid_scope', true);

    let resolvedResult: AuthOAuthResult | undefined;

    await handleCallbackRequest(
      mockResponse,
      mockServer,
      parsedUrl,
      'valid-state',
      'verifier',
      'http://localhost:8787/callback',
      (value) => {
        resolvedResult = value as unknown as AuthOAuthResult;
      },
    );

    expect(resolvedResult).toBeDefined();
    if (typeof resolvedResult !== 'object' || resolvedResult === null) throw new Error('expected object');
    expect((resolvedResult as { type: string }).type).toBe('failed');
    if ((resolvedResult as { type: string }).type !== 'failed') throw new Error('expected failed');
    expect((resolvedResult as { error?: string }).error).toBe('Authentication failed: invalid_scope');
  });
});


describe('createPkceAuthorizeMethod - Issue #1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedListenArgs = undefined;
    delete process.env.CI;
    delete process.env.SSH_CONNECTION;
  });

  it('binds the callback server to 127.0.0.1 to avoid exposing on all interfaces', async () => {
    process.env.CI = 'true';

    const createPkceAuthorizeMethod = await loadSubject();
    const authorize = createPkceAuthorizeMethod();
    const result = await authorize();

    // Trigger server creation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callbackPromise = (result.callback as any)();
    callbackPromise.catch(() => {}); // ignore — we only care about listen args

    expect(capturedListenArgs).toBeDefined();
    expect(capturedListenArgs).toHaveLength(3); // port, hostname, callback
    if (!capturedListenArgs) throw new Error('capturedListenArgs should be defined');
    expect(capturedListenArgs[0]).toBe(8787);
    expect(capturedListenArgs[1]).toBe('127.0.0.1');
    expect(typeof capturedListenArgs[2]).toBe('function');
  });
});

describe('exchangeCodeForTokens - Issue #3', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns success for a valid token response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          access_token: 'access-123',
          expires_in: 300,
          refresh_token: 'refresh-456',
        }),
        ok: true,
      } as Response),
    );

    const exchangeCodeForTokens = await loadExchangeCodeForTokens();
    const result = await exchangeCodeForTokens('code', 'verifier', 'http://localhost:8787/callback');

    expect(result.type).toBe('success');
    if (result.type !== 'success' || !('access' in result)) {
      throw new Error('expected success with access token');
    }
    expect(result.access).toBe('access-123');
    expect(typeof result.expires).toBe('number');
    expect(result.refresh).toBe('refresh-456');
  });

  it('returns failure when access_token is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ expires_in: 300, refresh_token: 'refresh-456' }),
        ok: true,
      } as Response),
    );

    const exchangeCodeForTokens = await loadExchangeCodeForTokens();
    const result = await exchangeCodeForTokens('code', 'verifier', 'http://localhost:8787/callback');

    expect(result.type).toBe('failed');
    if (result.type !== 'failed') throw new Error('expected failed');
    expect(result.error).toBe('Invalid token response from authorization server');
  });

  it('returns failure when expires_in is not a number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          access_token: 'access-123',
          expires_in: 'not-a-number',
          refresh_token: 'refresh-456',
        }),
        ok: true,
      } as Response),
    );

    const exchangeCodeForTokens = await loadExchangeCodeForTokens();
    const result = await exchangeCodeForTokens('code', 'verifier', 'http://localhost:8787/callback');

    expect(result.type).toBe('failed');
    if (result.type !== 'failed') throw new Error('expected failed');
  });

  it('returns failure when refresh_token is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ access_token: 'access-123', expires_in: 300 }),
        ok: true,
      } as Response),
    );

    const exchangeCodeForTokens = await loadExchangeCodeForTokens();
    const result = await exchangeCodeForTokens('code', 'verifier', 'http://localhost:8787/callback');

    expect(result.type).toBe('failed');
    if (result.type !== 'failed') throw new Error('expected failed');
  });

  it('returns failure for a proxy error wrapped in 200 OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ error: 'rate_limited' }),
        ok: true,
      } as Response),
    );

    const exchangeCodeForTokens = await loadExchangeCodeForTokens();
    const result = await exchangeCodeForTokens('code', 'verifier', 'http://localhost:8787/callback');

    expect(result.type).toBe('failed');
    if (result.type !== 'failed') throw new Error('expected failed');
  });
});
