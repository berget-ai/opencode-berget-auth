import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDeviceAuthorizeMethod,
  extractTokenResult,
  handleTokenPollError,
} from './device-flow';

vi.mock('../constants', () => ({
  getKeycloakRealm: () => 'berget',
  getKeycloakUrl: () => 'https://auth.berget.ai',
  KEYCLOAK_CLIENT_ID: 'berget-code',
}));

describe('extractTokenResult', () => {
  it('returns undefined when the body is not a token response', () => {
    expect(extractTokenResult({ error: 'authorization_pending' })).toBeUndefined();
    expect(extractTokenResult({ access_token: 'a' })).toBeUndefined();
    expect(extractTokenResult({ access_token: 'a', expires_in: '300' })).toBeUndefined();
  });

  it('fails when refresh_token is missing from a token response', () => {
    const result = extractTokenResult({ access_token: 'a', expires_in: 300 });
    expect(result).toEqual({
      error: 'Invalid token response from authorization server',
      type: 'failed',
    });
  });

  it('maps a valid token response to a success result', () => {
    const before = Date.now();
    const result = extractTokenResult({
      access_token: 'access',
      expires_in: 300,
      refresh_token: 'refresh',
    });

    expect(result).toMatchObject({
      access: 'access',
      refresh: 'refresh',
      type: 'success',
    });
    if (result?.type !== 'success' || !('expires' in result)) {
      throw new Error('expected success result');
    }
    expect(result.expires).toBeGreaterThanOrEqual(before + 300_000);
    expect(result.expires).toBeLessThanOrEqual(Date.now() + 300_000);
  });
});

function stubDeviceAuthorizationResponse(body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status: 200 })),
  );
}

describe('createDeviceAuthorizeMethod expiresAt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets expiresAt from expires_in on a well-formed response', async () => {
    stubDeviceAuthorizationResponse({
      device_code: 'dc',
      expires_in: 300,
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://auth.berget.ai/device',
    });

    const before = Date.now();
    const result = await createDeviceAuthorizeMethod()();

    expect(result.expiresAt).toBeGreaterThanOrEqual(before + 300_000);
    expect(result.expiresAt).toBeLessThanOrEqual(Date.now() + 300_000);
  });

  it('omits expiresAt when the response lacks a numeric expires_in', async () => {
    stubDeviceAuthorizationResponse({
      device_code: 'dc',
      user_code: 'ABCD-EFGH',
      verification_uri: 'https://auth.berget.ai/device',
    });

    const result = await createDeviceAuthorizeMethod()();

    expect(result.expiresAt).toBeUndefined();
  });
});

describe('handleTokenPollError', () => {
  it('keeps polling on authorization_pending', () => {
    expect(handleTokenPollError({ error: 'authorization_pending' }, 5)).toEqual({});
  });

  it('increases the interval on slow_down, capped at 30s', () => {
    expect(handleTokenPollError({ error: 'slow_down' }, 5)).toEqual({ interval: 10 });
    expect(handleTokenPollError({ error: 'slow_down' }, 28)).toEqual({ interval: 30 });
  });

  it('fails with a retry hint on expired_token', () => {
    expect(handleTokenPollError({ error: 'expired_token' }, 5)).toEqual({
      result: { error: 'Device code expired. Please try signing in again.', type: 'failed' },
    });
  });

  it('fails on access_denied', () => {
    expect(handleTokenPollError({ error: 'access_denied' }, 5)).toEqual({
      result: { error: 'Sign-in was denied in the browser.', type: 'failed' },
    });
  });

  it('includes error_description for unknown errors when present', () => {
    expect(handleTokenPollError({ error: 'server_error' }, 5)).toEqual({
      result: { error: 'Device flow failed: server_error', type: 'failed' },
    });
    expect(handleTokenPollError({ error: 'server_error', error_description: 'boom' }, 5)).toEqual({
      result: { error: 'Device flow failed: server_error — boom', type: 'failed' },
    });
  });
});
