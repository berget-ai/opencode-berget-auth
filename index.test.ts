import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { PluginInput } from './src/plugin/types';

import plugin, {
  accessTokenExpired,
  BergetAuthPlugin,
  BergetOAuthPlugin,
  createPkceAuthorizeMethod,
  isOAuthAuth,
} from './index';

vi.mock('./src/plugin', () => ({
  BergetAuthPlugin: vi.fn().mockResolvedValue({ auth: { loader: vi.fn() } }),
  BergetOAuthPlugin: { name: 'BergetOAuthPlugin' },
}));

describe('dual entrypoint', () => {
  it('default export is the V2 object shape with a V1 server() function', () => {
    expect(typeof plugin).toBe('object');
    expect(plugin.id).toBe('berget.auth');
    expect(typeof plugin.setup).toBe('function');
    expect(typeof plugin.server).toBe('function');
  });

  it('setup() lazily imports the V2 setup module', async () => {
    const cleanup = await plugin.setup({} as Parameters<typeof plugin.setup>[0]);
    expect(cleanup).toBeUndefined();
  });

  it('setup() propagates errors from the V2 setup module', async () => {
    vi.doMock('./src/v2/setup', () => ({
      setupBergetAuth: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    // The entrypoint holds a static reference to the lazy import; dynamics are
    // cached per module, so exercise a fresh import graph via resetModules.
    vi.resetModules();
    const { default: fresh } = (await import('./index')) as typeof import('./index');
    await expect(fresh.setup({} as Parameters<typeof fresh.setup>[0])).rejects.toThrow('boom');
  });

  it('server() delegates to BergetAuthPlugin with the plugin input', async () => {
    const input = { client: {} } as unknown as PluginInput;
    const hooks = await plugin.server(input);

    expect(hooks.auth?.loader).toBeDefined();
    expect(BergetAuthPlugin).toHaveBeenCalledWith(input);
  });

  it('keeps the previous named exports as public API', () => {
    expect(BergetAuthPlugin).toBeDefined();
    expect(BergetOAuthPlugin).toBeDefined();
    expect(accessTokenExpired).toBeDefined();
    expect(isOAuthAuth).toBeDefined();
    expect(createPkceAuthorizeMethod).toBeDefined();
  });
});

function listTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) {
      files.push(...listTypeScriptFiles(filePath));
    } else if (filePath.endsWith('.ts')) {
      files.push(filePath);
    }
  }
  return files;
}

describe('V2 SDK footprint', () => {
  it('never imports @opencode/* SDK packages at runtime in src/v2', () => {
    const sources = listTypeScriptFiles(path.join(import.meta.dirname, 'src/v2'));
    expect(sources.length).toBeGreaterThan(0);

    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      for (const [index, rawLine] of source.split('\n').entries()) {
        const line = rawLine.trim();
        const isModuleStatement = line.startsWith('import ') || line.startsWith('export ');
        const referencesSdk = line.includes("'@opencode/");
        if (isModuleStatement && referencesSdk) {
          const isTypeOnly = line.startsWith('import type') || line.startsWith('export type');
          expect(
            isTypeOnly,
            [`${file}:${index + 1} must be a type-only import:`, line].join(' '),
          ).toBe(true);
        }
      }
    }
  });
});
