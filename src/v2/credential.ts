/**
 * V2 credential adapter.
 *
 * Bridges the V1 token shapes (accepted by the shared flow/refresh code in
 * `src/plugin/`) to the OpenCode V2 `Credential.OAuth` shape. V2 credentials
 * are plain objects at runtime (the CLI decodes them itself), so no V2 SDK
 * code executes here — the SDK types are type-only.
 *
 * Method ids are a compatibility decision, not a naming preference: V2's
 * legacy-import migration assigns `methodID: "oauth"` to any V1 `auth.json`
 * entry it imports under an unknown integration id (e.g. `berget`), so the
 * PKCE method must register with that exact id for imported credentials to
 * keep refreshing. The device flow gets a distinct id.
 */

import type { Credential } from '@opencode/plugin';

import type { OAuthAuthDetails } from '../plugin/types';

import { refreshAccessTokenDirect } from '../plugin/token';

/** OAuth method id for the PKCE (browser) flow — matches the V2 legacy-import fallback. */
export const PKCE_METHOD_ID = 'oauth';

/** OAuth method id for the device (QR) flow — distinct from PKCE by design. */
export const DEVICE_METHOD_ID = 'device';

/**
 * Shared V2 refresh callback. Delegates to `refreshAccessTokenDirect` (the
 * same Keycloak-backed endpoint the V1 loader uses, endpoint and retry
 * behavior shared across both majors) and re-shapes the result for V2,
 * echoing the refresh implementation's own method id. Rejections surface to
 * the framework as `AuthorizationError`.
 */
export async function refreshCredentialOAuth(
  credential: Credential.OAuth,
): Promise<Credential.OAuth> {
  const result = await refreshAccessTokenDirect(credential as OAuthAuthDetails);

  if (!result.success) {
    throw new Error(`Berget token refresh failed: ${result.reason}`);
  }

  const { access, expires, refresh } = result.auth;

  if (typeof access !== 'string' || typeof expires !== 'number') {
    throw new TypeError('Berget token refresh returned no usable access token');
  }

  return toCredentialOAuth({ access, expires, refresh }, String(credential.methodID));
}

/**
 * Maps V1 token fields onto the V2 `Credential.OAuth` shape.
 * `expires` must be an integer in epoch milliseconds — the same unit the V1
 * code already uses (`Date.now() + expires_in * 1000`).
 */
export function toCredentialOAuth(
  auth: { access: string; expires: number; refresh: string },
  methodID: string,
): Credential.OAuth {
  return {
    access: auth.access,
    expires: Math.trunc(auth.expires),
    methodID: toMethodID(methodID),
    refresh: auth.refresh,
    type: 'oauth',
  };
}

/**
 * The SDK types `methodID` as an opaque branded `Integration.MethodID`;
 * branded values are plain strings at runtime, so ids are shared as strings
 * and asserted here once.
 */
export function toMethodID(id: string): Credential.OAuth['methodID'] {
  return id as Credential.OAuth['methodID'];
}
