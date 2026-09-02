import { describe, expect, it } from 'vitest';

import type { OAuthAuthDetails } from './types';

import { ACCESS_TOKEN_EXPIRY_BUFFER_MS } from '../constants';
import { accessTokenExpired } from './auth';

describe('accessTokenExpired - Issue #5', () => {
  // With raw expiry storage, the buffer lives ONLY in the check.
  // A token with expires_in=300 (raw expiry = now + 300_000) should be
  // considered expired at: now + 300_000 - 60_000 = now + 240_000.
  it('returns false when token lifetime minus buffer remains', () => {
    const auth: OAuthAuthDetails = {
      access: 'token',
      expires: Date.now() + 300_000, // raw 5-minute expiry
      refresh: 'refresh',
      type: 'oauth',
    };

    expect(accessTokenExpired(auth)).toBe(false);
  });

  it('returns true when only the buffer remains', () => {
    const auth: OAuthAuthDetails = {
      access: 'token',
      expires: Date.now() + ACCESS_TOKEN_EXPIRY_BUFFER_MS - 1, // raw expiry < now + buffer
      refresh: 'refresh',
      type: 'oauth',
    };

    expect(accessTokenExpired(auth)).toBe(true);
  });

  it('returns true when the raw expiry has passed', () => {
    const auth: OAuthAuthDetails = {
      access: 'token',
      expires: Date.now() - 1,
      refresh: 'refresh',
      type: 'oauth',
    };

    expect(accessTokenExpired(auth)).toBe(true);
  });

  it('returns true when access token is missing', () => {
    const auth: OAuthAuthDetails = {
      access: undefined,
      expires: Date.now() + 300_000,
      refresh: 'refresh',
      type: 'oauth',
    };

    expect(accessTokenExpired(auth)).toBe(true);
  });

  it('returns true when expires is not a number', () => {
    const auth = {
      access: 'token',
      expires: 'not-a-number',
      refresh: 'refresh',
      type: 'oauth',
    } as unknown as OAuthAuthDetails;

    expect(accessTokenExpired(auth)).toBe(true);
  });
});
