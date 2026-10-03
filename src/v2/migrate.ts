/**
 * One-time import of V1 credentials into the V2 credential store.
 *
 * Background (see PHASE0_FINDINGS.md): OpenCode ships a legacy-import
 * migration, but it only executes when upgrading an *existing* older-V2
 * database — `DatabaseMigration.apply` bootstraps fresh databases by applying
 * the final schema and journaling every migration id without running their
 * `up()` (verified against `@opencode/cli@2.0.22`). Users moving from V1 would
 * otherwise lose their login and need to re-authenticate.
 *
 * The plugin context does not (yet) expose the client's `credential` domain,
 * so this import is feature-detected: when `ctx.credential.create`/`list`
 * exist, it seeds the credential V1 persisted to `<data>/opencode/auth.json`;
 * otherwise it is a silent no-op and users log in once via the V2 flows.
 * Either way it never throws — startup must not depend on the import.
 */

import type { Plugin } from '@opencode/plugin';

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { logDebug } from '../plugin/debug';
import { PKCE_METHOD_ID } from './credential';

export type ImportOutcome =
  | 'error'
  | 'exists'
  | 'imported'
  | 'invalid-file'
  | 'missing-file'
  | 'unavailable'
  | 'unsupported-entry';

/**
 * Minimal shape of the client's `credential` domain. Branded server types are
 * treated as unknown; only `integrationID` (a plain string on the wire) is
 * inspected.
 */
interface CredentialClientApi {
  create: (input: {
    activate?: boolean;
    id?: string;
    integrationID: string;
    label?: string;
    value: unknown;
  }) => Promise<unknown>;
  list?: () => Promise<Array<{ integrationID?: string | { toString(): string } }>>;
}

type LegacyAuthEntry = Record<string, unknown>;

type LegacyAuthFile = Record<string, LegacyAuthEntry>;

/**
 * Best-effort import of the V1 `berget` OAuth credential. Returns what
 * happened for tests/logging; never throws.
 */
export async function importV1Credential(context: Plugin.Context): Promise<ImportOutcome> {
  const api = credentialClient(context);
  if (!api) {
    logDebug(
      'V1 credential import unavailable on this OpenCode build (no credential API on context)',
    );
    return 'unavailable';
  }

  let content: string | undefined;
  for (const candidate of legacyAuthPaths()) {
    try {
      content = await readFile(candidate, 'utf8');
      break;
    } catch {
      // try the next candidate location
    }
  }
  if (content === undefined) {
    logDebug('No legacy auth.json found, skipping V1 credential import');
    return 'missing-file';
  }

  let parsed: LegacyAuthFile;
  try {
    const value: unknown = JSON.parse(content);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('auth.json must contain an object');
    }
    parsed = value as LegacyAuthFile;
  } catch (error) {
    logDebug(`Legacy auth.json is not decodable, skipping repair: ${String(error)}`);
    return 'invalid-file';
  }

  const entry = parsed['berget'];
  if (!isImportableOAuth(entry)) {
    logDebug('Legacy auth.json has no importable berget OAuth credential');
    return 'unsupported-entry';
  }

  if (await alreadyImported(api).catch(() => false)) {
    logDebug('A berget credential already exists, skipping V1 import');
    return 'exists';
  }

  try {
    await api.create({
      activate: true,
      integrationID: 'berget',
      label: 'Berget account (imported from OpenCode 1)',
      value: {
        access: entry.access,
        expires: Math.trunc(entry.expires),
        methodID: PKCE_METHOD_ID,
        refresh: entry.refresh,
        type: 'oauth',
      },
    });
  } catch (error) {
    logDebug(`V1 credential import failed: ${String(error)}`);
    return 'error';
  }

  logDebug('Imported V1 berget credential into the V2 credential store');
  return 'imported';
}

async function alreadyImported(api: CredentialClientApi): Promise<boolean> {
  const list = api.list;
  if (typeof list !== 'function') {
    return false;
  }
  const credentials = await list();
  return credentials.some((entry) => String(entry.integrationID) === 'berget');
}

function credentialClient(context: Plugin.Context): CredentialClientApi | undefined {
  const candidate = (context as { credential?: CredentialClientApi }).credential;
  return candidate;
}

function isImportableOAuth(
  entry: LegacyAuthEntry,
): entry is { access: string; expires: number; refresh: string } {
  return (
    entry['type'] === 'oauth' &&
    typeof entry['access'] === 'string' &&
    entry['access'].length > 0 &&
    typeof entry['refresh'] === 'string' &&
    entry['refresh'].length > 0 &&
    typeof entry['expires'] === 'number' &&
    Number.isFinite(entry['expires'])
  );
}

/**
 * Candidate V1 auth.json locations, in V1's own read order: the XDG data dir
 * (all platforms), then the pre-XDG-migration `~/.opencode` location that V1
 * still reads as a fallback (verified against `opencode-ai@1.18.34`).
 */
function legacyAuthPaths(): string[] {
  const dataHome = process.env.XDG_DATA_HOME || path.join(homedir(), '.local', 'share');
  return [
    path.join(dataHome, 'opencode', 'auth.json'),
    path.join(homedir(), '.opencode', 'auth.json'),
  ];
}
