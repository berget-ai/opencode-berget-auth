import type { Plugin } from '@opencode/plugin';
import type {
  IntegrationMethodRegistration,
  IntegrationOAuthMethodRegistration,
} from '@opencode/plugin/promise/integration';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorizeResult } from '../plugin/types';

import { DEVICE_METHOD_ID, PKCE_METHOD_ID } from './credential';
import { BERGET_INTEGRATION_NAME, registerIntegration } from './integration';

vi.mock('../plugin/pkce-flow', () => ({
  createPkceAuthorizeMethod: vi.fn(),
}));

vi.mock('../plugin/device-flow', () => ({
  createDeviceAuthorizeMethod: vi.fn(),
}));

import { createDeviceAuthorizeMethod } from '../plugin/device-flow';
import { createPkceAuthorizeMethod } from '../plugin/pkce-flow';

const mockCreatePkce = vi.mocked(createPkceAuthorizeMethod);
const mockCreateDevice = vi.mocked(createDeviceAuthorizeMethod);

interface CapturedEditor {
  methods: IntegrationMethodRegistration[];
  updates: Array<[string, (integration: { name?: string }) => void]>;
}

function createMockContext(): { context: Plugin.Context; editor: CapturedEditor } {
  const editor: CapturedEditor = { methods: [], updates: [] };
  const context = {
    integration: {
      transform: async (transformCallback: (editorArgument: unknown) => void) => {
        transformCallback({
          get: () => {},
          list: () => [],
          method: {
            list: () => [],
            remove: () => {},
            update: (input: IntegrationMethodRegistration) => editor.methods.push(input),
          },
          remove: () => {},
          update: (id: string, update: (integration: { name?: string }) => void) =>
            editor.updates.push([id, update]),
        });
        return { dispose: async () => {} };
      },
    },
  } as unknown as Plugin.Context;

  return { context, editor };
}

describe('registerIntegration', () => {
  beforeEach(() => {
    mockCreatePkce.mockReset();
    mockCreateDevice.mockReset();
  });

  it('sets the integration display name', async () => {
    const { context, editor } = createMockContext();
    await registerIntegration(context);

    expect(editor.updates).toHaveLength(1);
    const [id, update] = editor.updates[0];
    expect(id).toBe('berget');

    const integration: { name?: string } = {};
    update(integration);
    expect(integration.name).toBe(BERGET_INTEGRATION_NAME);
  });

  it('registers exactly three methods: PKCE (id "oauth"), device (id "device"), key', async () => {
    const { context, editor } = createMockContext();
    await registerIntegration(context);

    expect(editor.methods).toHaveLength(3);

    const pkce = editor.methods[0] as IntegrationOAuthMethodRegistration;
    expect(pkce.integrationID).toBe('berget');
    expect(pkce.method).toEqual({
      id: PKCE_METHOD_ID,
      label: 'Berget Code Seat - Login using this device',
      type: 'oauth',
    });

    const device = editor.methods[1] as IntegrationOAuthMethodRegistration;
    expect(device.integrationID).toBe('berget');
    expect(device.method).toEqual({
      id: DEVICE_METHOD_ID,
      label: 'Berget Code Seat - Login using other device with QR',
      type: 'oauth',
    });

    const key = editor.methods[2] as IntegrationMethodRegistration & {
      method: { label: string; type: string };
    };
    expect(key.method).toEqual({
      label: 'Berget API Key - Enter API key manually',
      type: 'key',
    });
  });

  it('uses the same method-id constants for registration and returned credentials', async () => {
    mockCreatePkce.mockReturnValue(() =>
      Promise.resolve({
        callback: async () => ({
          access: 'access-token',
          expires: Date.now() + 60_000,
          refresh: 'refresh-token',
          type: 'success' as const,
        }),
        instructions: 'Complete login in your browser.',
        method: 'auto' as const,
        url: 'https://auth.example.test/authorize',
      } satisfies AuthorizeResult),
    );

    const { context, editor } = createMockContext();
    await registerIntegration(context);

    const pkce = editor.methods[0] as IntegrationOAuthMethodRegistration;
    const authorization = await pkce.authorize({} as never);

    expect(authorization.mode).toBe('auto');
    // The registered id and the credential's methodID are the same constant —
    // a mismatch surfaces as "OAuth method not found" or silent no-refresh.
    expect(pkce.method.id).toBe(PKCE_METHOD_ID);
    await expect(authorization.callback).resolves.toMatchObject({
      access: 'access-token',
      methodID: PKCE_METHOD_ID,
      refresh: 'refresh-token',
      type: 'oauth',
    });
  });

  it('maps V1 failed results to rejected authorization callbacks', async () => {
    mockCreatePkce.mockReturnValue(() =>
      Promise.resolve({
        callback: async () => ({ error: 'Authentication timed out.', type: 'failed' as const }),
        instructions: 'Complete login in your browser.',
        method: 'auto' as const,
        url: 'https://auth.example.test/authorize',
      } satisfies AuthorizeResult),
    );

    const { context, editor } = createMockContext();
    await registerIntegration(context);

    const pkce = editor.methods[0] as IntegrationOAuthMethodRegistration;
    const authorization = await pkce.authorize({} as never);

    await expect(authorization.callback).rejects.toThrow('Authentication timed out.');
  });

  it('passes the device flow expiry through as expiresAt', async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    mockCreateDevice.mockReturnValue(() =>
      Promise.resolve({
        callback: async () => ({
          access: 'access-token',
          expires: Date.now() + 60_000,
          refresh: 'refresh-token',
          type: 'success' as const,
        }),
        expiresAt,
        instructions: 'Scan with your phone:',
        method: 'auto' as const,
        url: 'https://auth.example.test/device',
      } satisfies AuthorizeResult),
    );

    const { context, editor } = createMockContext();
    await registerIntegration(context);

    const device = editor.methods[1] as IntegrationOAuthMethodRegistration;
    const authorization = await device.authorize({} as never);

    expect(authorization).toMatchObject({ expiresAt, mode: 'auto' });
  });
});
