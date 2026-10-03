import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVICE_METHOD_ID,
  PKCE_METHOD_ID,
  refreshCredentialOAuth,
  toCredentialOAuth,
} from './credential';

vi.mock('../plugin/token', () => ({
  refreshAccessTokenDirect: vi.fn(),
}));

import { refreshAccessTokenDirect } from '../plugin/token';

const mockRefresh = vi.mocked(refreshAccessTokenDirect);

describe('toCredentialOAuth', () => {
  it('maps V1 token fields onto the V2 Credential.OAuth shape', () => {
    const now = Date.now();
    const credential = toCredentialOAuth(
      { access: 'access-token', expires: now + 60_000.7, refresh: 'refresh-token' },
      PKCE_METHOD_ID,
    );

    expect(credential).toEqual({
      access: 'access-token',
      expires: Math.trunc(now + 60_000.7),
      methodID: PKCE_METHOD_ID,
      refresh: 'refresh-token',
      type: 'oauth',
    });
    expect(Number.isInteger(credential.expires)).toBe(true);
  });

  it('echoes the method id it is given (device flow uses its own id)', () => {
    const credential = toCredentialOAuth(
      { access: 'a', expires: 1, refresh: 'r' },
      DEVICE_METHOD_ID,
    );
    expect(credential.methodID).toBe(DEVICE_METHOD_ID);
    expect(credential.methodID).not.toBe(PKCE_METHOD_ID);
  });
});

describe('refreshCredentialOAuth', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
  });

  it('delegates to the shared V1 refresh and preserves the credential method id', async () => {
    mockRefresh.mockResolvedValue({
      auth: { access: 'new-access', expires: 123, refresh: 'new-refresh', type: 'oauth' },
      success: true,
    });

    const credential = {
      access: 'old-access',
      expires: 1,
      methodID: DEVICE_METHOD_ID as never,
      refresh: 'old-refresh',
      type: 'oauth' as const,
    };

    const refreshed = await refreshCredentialOAuth(credential);

    expect(mockRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ access: 'old-access', refresh: 'old-refresh', type: 'oauth' }),
    );
    expect(refreshed).toEqual({
      access: 'new-access',
      expires: 123,
      methodID: DEVICE_METHOD_ID,
      refresh: 'new-refresh',
      type: 'oauth',
    });
  });

  it('rejects when the shared refresh fails (V2 error channel)', async () => {
    mockRefresh.mockResolvedValue({ reason: 'invalid_grant', success: false });

    const credential = {
      access: 'old-access',
      expires: 1,
      methodID: PKCE_METHOD_ID as never,
      refresh: 'old-refresh',
      type: 'oauth' as const,
    };

    await expect(refreshCredentialOAuth(credential)).rejects.toThrow('invalid_grant');
  });
});
