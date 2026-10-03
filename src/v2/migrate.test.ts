import type { Plugin } from '@opencode/plugin';

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PKCE_METHOD_ID } from './credential';

const mocks = vi.hoisted(() => ({ home: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mocks.home };
});

import { importV1Credential } from './migrate';

interface CredentialCalls {
  createInputs: unknown[];
  listResult?: Array<{ integrationID: string }>;
  rejectCreate?: Error;
}

function createMockContext(calls?: CredentialCalls): Plugin.Context {
  const context = calls
    ? {
        credential: {
          create: async (input: unknown) => {
            if (calls.rejectCreate) throw calls.rejectCreate;
            calls.createInputs.push(input);
            return { id: 'cred_new' };
          },
          list: async () => calls.listResult ?? [],
        },
      }
    : {};

  return context as Plugin.Context;
}

async function writeAuthJson(content: string): Promise<void> {
  const opencodeDirectory = path.join(dataHome, 'opencode');
  await mkdir(opencodeDirectory, { recursive: true });
  await writeFile(path.join(opencodeDirectory, 'auth.json'), content);
}

async function writeLegacyAuthJson(content: string): Promise<void> {
  const legacyDirectory = path.join(mocks.home, '.opencode');
  await mkdir(legacyDirectory, { recursive: true });
  await writeFile(path.join(legacyDirectory, 'auth.json'), content);
}

let dataHome = '';

beforeEach(async () => {
  dataHome = await mkdtemp(path.join(tmpdir(), 'berget-migrate-'));
  mocks.home = await mkdtemp(path.join(tmpdir(), 'berget-migrate-home-'));
  vi.stubEnv('XDG_DATA_HOME', dataHome);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dataHome, { force: true, recursive: true });
  await rm(mocks.home, { force: true, recursive: true });
});

describe('importV1Credential', () => {
  it('is a no-op when the context has no credential API', async () => {
    await expect(importV1Credential({} as Plugin.Context)).resolves.toBe('unavailable');
  });

  it('is a no-op when no legacy auth.json exists', async () => {
    const calls: CredentialCalls = { createInputs: [] };
    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('missing-file');
    expect(calls.createInputs).toHaveLength(0);
  });

  it('is a no-op on malformed auth.json', async () => {
    await writeAuthJson('{ not json');
    const calls: CredentialCalls = { createInputs: [] };
    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('invalid-file');
    expect(calls.createInputs).toHaveLength(0);
  });

  it('is a no-op when auth.json contains no berget OAuth credential', async () => {
    await writeAuthJson(JSON.stringify({ berget: { key: 'sk', type: 'api' }, other: {} }));
    const calls: CredentialCalls = { createInputs: [] };
    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('unsupported-entry');
    expect(calls.createInputs).toHaveLength(0);
  });

  it('creates and activates the credential with the PKCE method id', async () => {
    await writeAuthJson(
      JSON.stringify({
        berget: {
          access: 'legacy-access',
          expires: 1_234_567.8,
          refresh: 'legacy-refresh',
          type: 'oauth',
        },
      }),
    );
    const calls: CredentialCalls = { createInputs: [] };

    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('imported');

    expect(calls.createInputs).toEqual([
      {
        activate: true,
        integrationID: 'berget',
        label: 'Berget account (imported from OpenCode 1)',
        value: {
          access: 'legacy-access',
          expires: 1_234_567,
          methodID: PKCE_METHOD_ID,
          refresh: 'legacy-refresh',
          type: 'oauth',
        },
      },
    ]);
  });

  it('imports from the pre-XDG ~/.opencode/auth.json when the XDG location is missing', async () => {
    await writeLegacyAuthJson(
      JSON.stringify({
        berget: { access: 'legacy-dot-opencode', expires: 1, refresh: 'r', type: 'oauth' },
      }),
    );
    const calls: CredentialCalls = { createInputs: [] };

    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('imported');
    expect(calls.createInputs).toMatchObject([{ value: { access: 'legacy-dot-opencode' } }]);
  });

  it('prefers the XDG location over ~/.opencode when both exist', async () => {
    await writeAuthJson(
      JSON.stringify({
        berget: { access: 'xdg-location', expires: 1, refresh: 'r', type: 'oauth' },
      }),
    );
    await writeLegacyAuthJson(
      JSON.stringify({
        berget: { access: 'legacy-dot-opencode', expires: 1, refresh: 'r', type: 'oauth' },
      }),
    );
    const calls: CredentialCalls = { createInputs: [] };

    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('imported');
    expect(calls.createInputs).toMatchObject([{ value: { access: 'xdg-location' } }]);
  });

  it('skips when a berget credential already exists', async () => {
    await writeAuthJson(
      JSON.stringify({
        berget: { access: 'a', expires: 1, refresh: 'r', type: 'oauth' },
      }),
    );
    const calls: CredentialCalls = { createInputs: [], listResult: [{ integrationID: 'berget' }] };

    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('exists');
    expect(calls.createInputs).toHaveLength(0);
  });

  it('reports an error without throwing when creation fails', async () => {
    await writeAuthJson(
      JSON.stringify({
        berget: { access: 'a', expires: 1, refresh: 'r', type: 'oauth' },
      }),
    );
    const calls: CredentialCalls = {
      createInputs: [],
      rejectCreate: new Error('ConflictError'),
    };

    await expect(importV1Credential(createMockContext(calls))).resolves.toBe('error');
  });
});
