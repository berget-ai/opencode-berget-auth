/**
 * OpenCode V2 plugin setup for Berget.
 *
 * Runs only in V2 CLIs (the dual entrypoint in `index.ts` loads this module
 * lazily via dynamic import), wires the integration registration, seeds any
 * V1 credential, and registers the provider. SDK imports stay type-only —
 * enforced by `index.test.ts`.
 */

import type { Plugin } from '@opencode/plugin';

import { registerIntegration } from './integration';
import { importV1Credential } from './migrate';

export async function setupBergetAuth(context: Plugin.Context): Promise<void> {
  await registerIntegration(context);
  await importV1Credential(context);
  // Provider/model registration lands in phase 3.
}
