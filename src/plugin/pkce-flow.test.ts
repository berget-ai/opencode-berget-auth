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
