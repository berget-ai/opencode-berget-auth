/**
 * OpenCode V2 integration registration for Berget.
 *
 * Registers one integration (`berget`) with three auth methods, mirroring the
 * V1 `auth.methods` list:
 *
 * - PKCE browser login (`mode: 'auto'`; id `oauth` — see credential.ts)
 * - Device-code login with QR (`mode: 'auto'`; the user approves on another
 *   device and never pastes a code into OpenCode)
 * - API key (`type: 'key'`; the framework prompts for the key)
 *
 * The flow logic itself is shared with V1 (`createPkceAuthorizeMethod` /
 * `createDeviceAuthorizeMethod`); this module only adapts the results to the
 * V2 `integration.transform` signatures. The transform is an upsert onto the
 * integration the CLI already knows from models.dev, so it composes with the
 * native `env` (BERGET_API_KEY) method instead of replacing it.
 */

import type { Plugin } from '@opencode/plugin';
import type { IntegrationOAuthAuthorization } from '@opencode/plugin/promise/integration';

import type { AuthOAuthResult, AuthorizeResult } from '../plugin/types';

import { BERGET_PROVIDER_ID } from '../constants';
import { createDeviceAuthorizeMethod } from '../plugin/device-flow';
import { createPkceAuthorizeMethod } from '../plugin/pkce-flow';
import {
  DEVICE_METHOD_ID,
  PKCE_METHOD_ID,
  refreshCredentialOAuth,
  toCredentialOAuth,
} from './credential';

export const BERGET_INTEGRATION_NAME = 'Berget AI';

/**
 * Registers the `berget` integration, its display name, and all three auth
 * methods. `editor.method.update` upserts by method id (oauth methods) or
 * type (key methods), so re-running or replaying the transform never
 * duplicates registrations.
 */
export async function registerIntegration(context: Plugin.Context): Promise<void> {
  await context.integration.transform((editor) => {
    editor.update(BERGET_PROVIDER_ID, (integration) => {
      integration.name = BERGET_INTEGRATION_NAME;
    });

    editor.method.update({
      authorize: () => toV2Authorization(createPkceAuthorizeMethod()(), PKCE_METHOD_ID),
      integrationID: BERGET_PROVIDER_ID,
      method: {
        id: PKCE_METHOD_ID,
        label: 'Berget Code Seat - Login using this device',
        type: 'oauth',
      },
      refresh: (credential) => refreshCredentialOAuth(credential),
    });

    editor.method.update({
      authorize: () => toV2Authorization(createDeviceAuthorizeMethod()(), DEVICE_METHOD_ID),
      integrationID: BERGET_PROVIDER_ID,
      method: {
        id: DEVICE_METHOD_ID,
        label: 'Berget Code Seat - Login using other device with QR',
        type: 'oauth',
      },
      refresh: (credential) => refreshCredentialOAuth(credential),
    });

    editor.method.update({
      integrationID: BERGET_PROVIDER_ID,
      method: { label: 'Berget API Key - Enter API key manually', type: 'key' },
    });
  });
}

/**
 * Adapts a V1 `AuthorizeResult` (`method: 'auto'`, callback resolving to the
 * V1 success/failed union) to a V2 `IntegrationOAuthAuthorization`. V2 errors
 * are promise rejections; a V1 `{type: 'failed'}` result becomes one.
 */
export async function toV2Authorization(
  result: Promise<AuthorizeResult>,
  methodID: string,
): Promise<IntegrationOAuthAuthorization> {
  const { callback, expiresAt, instructions, url } = await result;

  return {
    callback: (async () => {
      const outcome = await (callback as () => Promise<AuthOAuthResult>)();
      if (outcome.type !== 'success' || !('access' in outcome) || !('refresh' in outcome)) {
        const reason = outcome.type === 'failed' ? outcome.error : 'unexpected token result';
        throw new Error(reason ?? 'Berget authentication failed');
      }
      return toCredentialOAuth(outcome, methodID);
    })(),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    instructions,
    mode: 'auto',
    url,
  };
}
