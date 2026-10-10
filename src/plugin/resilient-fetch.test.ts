import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resilientFetch } from './resilient-fetch';

function suppressConsole() {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { logSpy };
}

describe('resilientFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns response immediately on success', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const response = await resilientFetch('https://api.berget.ai/v1/test');

    expect(response.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('retries on ECONNRESET and succeeds', async () => {
    suppressConsole();
    let callCount = 0;
    const econnreset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(econnreset);
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries on socket hang up and succeeds', async () => {
    suppressConsole();
    let callCount = 0;
    const socketError = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(socketError);
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries on 503 and succeeds', async () => {
    suppressConsole();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Service Unavailable', { status: 503 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries on 502 and succeeds', async () => {
    suppressConsole();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Bad Gateway', { status: 502 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries on 504 and succeeds', async () => {
    suppressConsole();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Gateway Timeout', { status: 504 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries on 408 and succeeds', async () => {
    suppressConsole();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Request Timeout', { status: 408 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('retries on 429 and succeeds', async () => {
    suppressConsole();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response('Too Many Requests', { status: 429 }));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('does not retry on 400 (client error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 })));

    const response = await resilientFetch('https://api.berget.ai/v1/test');

    expect(response.status).toBe(400);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401 (unauthorized)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test');

    expect(response.status).toBe(401);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 404 (not found)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    const response = await resilientFetch('https://api.berget.ai/v1/test');

    expect(response.status).toBe(404);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('does not retry on user-initiated abort (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(resilientFetch('https://api.berget.ai/v1/test')).rejects.toThrow('aborted');
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries on persistent ECONNRESET', async () => {
    suppressConsole();
    const econnreset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(econnreset));

    await expect(
      resilientFetch('https://api.berget.ai/v1/test', undefined, {
        baseDelayMs: 10,
        maxDelayMs: 50,
        maxRetries: 2,
      }),
    ).rejects.toThrow('ECONNRESET');

    // 1 initial + 2 retries = 3 calls
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
  });

  it('gives up after maxRetries on persistent 503', async () => {
    suppressConsole();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Service Unavailable', { status: 503 })),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
      maxRetries: 2,
    });

    expect(response.status).toBe(503);
    // 1 initial + 2 retries = 3 calls
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3);
  });

  it('retries on ETIMEDOUT and succeeds', async () => {
    suppressConsole();
    let callCount = 0;
    const timeoutError = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(timeoutError);
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('does not retry when maxRetries is 0', async () => {
    const econnreset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(econnreset));

    await expect(
      resilientFetch('https://api.berget.ai/v1/test', undefined, { maxRetries: 0 }),
    ).rejects.toThrow('ECONNRESET');

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('passes request options through correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('OK')));

    await resilientFetch('https://api.berget.ai/v1/test', {
      body: JSON.stringify({ prompt: 'hello' }),
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe('https://api.berget.ai/v1/test');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe('{"prompt":"hello"}');
  });

  it('uses default retry config when options are not provided', async () => {
    suppressConsole();
    const econnreset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(econnreset));

    await expect(resilientFetch('https://api.berget.ai/v1/test')).rejects.toThrow('ECONNRESET');

    // Default maxRetries is 3, so 1 initial + 3 retries = 4 calls
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(4);
  });

  it('retries on "fetch failed" TypeError', async () => {
    suppressConsole();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('handles ECONNABORTED error code', async () => {
    suppressConsole();
    let callCount = 0;
    const abortedError = Object.assign(new Error('socket hang up'), {
      code: 'ECONNABORTED',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(abortedError);
        }
        return Promise.resolve(new Response('OK', { status: 200 }));
      }),
    );

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  it('returns 200 response without retrying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('OK', { status: 200 })));

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });

  it('returns 201 response without retrying', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Created', { status: 201 })));

    const response = await resilientFetch('https://api.berget.ai/v1/test', undefined, {
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(response.status).toBe(201);
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
  });
});
