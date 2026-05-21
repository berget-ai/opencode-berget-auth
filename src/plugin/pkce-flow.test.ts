import * as http from 'node:http';
import * as url from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthOAuthResult } from './types';

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
let capturedListenArguments: undefined | unknown[];
let shouldEmitEADDRINUSE = false;

vi.mock('node:http', async () => {
  const actual = await vi.importActual<typeof import('node:http')>('node:http');

  return {
    ...actual,
    createServer: (...arguments_: Parameters<typeof actual.createServer>) => {
      const server = actual.createServer(...arguments_);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.listen = (...listenArguments: any[]) => {
        capturedListenArguments = listenArguments;
        if (shouldEmitEADDRINUSE) {
          setImmediate(() => {
            const error = Object.assign(
              new Error('address already in use') as NodeJS.ErrnoException,
              {
                code: 'EADDRINUSE',
              },
            );
            server.emit('error', error);
          });
        }
        return server;
      };

      return server;
    },
  };
});

async function loadExchangeCodeForTokens() {
  const module_ = await import('./pkce-flow');
  return module_.exchangeCodeForTokens;
}

async function loadHandleCallbackRequest() {
  const module_ = await import('./pkce-flow');
  return module_.handleCallbackRequest;
}

// Dynamic import so the mocks apply before the subject module is loaded
async function loadSubject() {
  const module_ = await import('./pkce-flow');
  return module_.createPkceAuthorizeMethod;
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
      writeHead: vi.fn() as unknown as http.ServerResponse['writeHead'],
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
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (typeof resolvedResult !== 'object' || resolvedResult === null)
      throw new Error('expected object');
    expect((resolvedResult as { type: string }).type).toBe('failed');
    if ((resolvedResult as { type: string }).type !== 'failed') throw new Error('expected failed');
    expect((resolvedResult as { error?: string }).error).toContain('access_denied');
    expect((resolvedResult as { error?: string }).error).toContain('User denied consent');
  });

  it('falls back to error code alone when error_description is absent', async () => {
    const handleCallbackRequest = await loadHandleCallbackRequest();

    const mockResponse = {
      end: vi.fn(),
      writeHead: vi.fn() as unknown as http.ServerResponse['writeHead'],
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
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (typeof resolvedResult !== 'object' || resolvedResult === null)
      throw new Error('expected object');
    expect((resolvedResult as { type: string }).type).toBe('failed');
    if ((resolvedResult as { type: string }).type !== 'failed') throw new Error('expected failed');
    expect((resolvedResult as { error?: string }).error).toBe(
      'Authentication failed: invalid_scope',
    );
  });

  it('sets Cache-Control: no-store on error callback response', async () => {
    const handleCallbackRequest = await loadHandleCallbackRequest();

    const mockResponse = {
      end: vi.fn(),
      writeHead: vi.fn() as unknown as http.ServerResponse['writeHead'],
    } as unknown as http.ServerResponse;

    const mockServer = {
      close: vi.fn(),
    } as unknown as http.Server;

    const parsedUrl = url.parse('/callback?error=access_denied', true);

    await handleCallbackRequest(
      mockResponse,
      mockServer,
      parsedUrl,
      'valid-state',
      'verifier',
      'http://localhost:8787/callback',
      () => {},
    );

    expect(mockResponse.writeHead).toHaveBeenCalledTimes(1);
    const [, headers] = (mockResponse.writeHead as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(headers['Cache-Control']).toBe('no-store, no-cache, must-revalidate, proxy-revalidate');
    expect(headers['Pragma']).toBe('no-cache');
    expect(headers['Expires']).toBe('0');
  });
});

describe('createPkceAuthorizeMethod - Issue #1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedListenArguments = undefined;
    shouldEmitEADDRINUSE = false;
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

    expect(capturedListenArguments).toBeDefined();
    expect(capturedListenArguments).toHaveLength(3); // port, hostname, callback
    if (!capturedListenArguments) throw new Error('capturedListenArgs should be defined');
    expect(capturedListenArguments[0]).toBe(8787);
    expect(capturedListenArguments[1]).toBe('127.0.0.1');
    expect(typeof capturedListenArguments[2]).toBe('function');
  });

  it('returns clear EADDRINUSE error when another login is in progress', async () => {
    process.env.CI = 'true';
    shouldEmitEADDRINUSE = true;

    const createPkceAuthorizeMethod = await loadSubject();
    const authorize = createPkceAuthorizeMethod();
    const result = await authorize();

    // Trigger server creation — it will emit EADDRINUSE synchronously in listen()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callbackResult = await (result.callback as any)();

    expect(callbackResult.type).toBe('failed');
    if (callbackResult.type !== 'failed') throw new Error('expected failed');
    expect(callbackResult.error).toBe(
      'Port 8787 is already in use. Another OpenCode login may be in progress. Please wait and try again, or close other OpenCode sessions.',
    );
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
    const result = await exchangeCodeForTokens(
      'code',
      'verifier',
      'http://localhost:8787/callback',
    );

    expect(result.type).toBe('success');
    if (result.type !== 'success' || !('access' in result)) {
      throw new Error('expected success with access token');
    }
    expect(result.access).toBe('access-123');
    // Issue #5: stored expiry must be the raw timestamp, NOT pre-reduced by buffer
    expect(result.expires).toBeGreaterThanOrEqual(Date.now() + 300_000 - 2000);
    expect(result.expires).toBeLessThanOrEqual(Date.now() + 300_000 + 2000);
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
    const result = await exchangeCodeForTokens(
      'code',
      'verifier',
      'http://localhost:8787/callback',
    );

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
    const result = await exchangeCodeForTokens(
      'code',
      'verifier',
      'http://localhost:8787/callback',
    );

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
    const result = await exchangeCodeForTokens(
      'code',
      'verifier',
      'http://localhost:8787/callback',
    );

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
    const result = await exchangeCodeForTokens(
      'code',
      'verifier',
      'http://localhost:8787/callback',
    );

    expect(result.type).toBe('failed');
    if (result.type !== 'failed') throw new Error('expected failed');
  });
});

describe('generateCodeVerifier - Issue #10', () => {
  it('produces a base64url string of the correct length (32 bytes => 43 chars)', async () => {
    const module_ = await import('./pkce-flow');
    const verifier = module_.generateCodeVerifier();

    expect(typeof verifier).toBe('string');
    expect(verifier.length).toBe(43); // ceil(32 / 3) * 4 = 43 with base64url padding stripped
    // base64url characters only
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
