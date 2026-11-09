/**
 * OpenCode V2 plugin setup for Berget.
 *
 * Runs only in V2 CLIs (the dual entrypoint in `index.ts` loads this module
 * lazily via dynamic import), wires the integration registration, seeds any
 * V1 credential, and registers the provider. SDK imports stay type-only —
 * enforced by `index.test.ts`.
 *
 * Returns a cleanup function that stops the periodic model-catalog refresh.
 */

import type { Plugin } from '@opencode/plugin';

import { logError } from '../plugin/debug';
import { registerIntegration } from './integration';
import { importV1Credential } from './migrate';
import { fetchV2Models, refreshModels, registerProvider } from './provider';

/** Refresh the live model catalog every 5 minutes by default. */
const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export async function setupBergetAuth(context: Plugin.Context): Promise<(() => void) | undefined> {
  await registerIntegration(context);
  await importV1Credential(context);

  // Models load before the (synchronous) provider transform so the captured
  // data never requires network access inside the transform.
  const models = await fetchV2Models();
  await registerProvider(context, models);

  // Live refresh: every interval, fetch the catalog again, merge it into the
  // provider editor and call reload() — new models reach OpenCode without a
  // restart ("Load external data before the synchronous callback, then call
  // reload() after those inputs change", docs: build/plugins/server).
  const intervalMs = getRefreshIntervalMs();
  const timer = setInterval(() => {
    void fetchV2Models()
      .then((fresh) => refreshModels(context, fresh))
      .catch((error: unknown) => logError('Periodic model refresh failed', error));
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}

function getRefreshIntervalMs(): number {
  const raw = process.env['BERGET_MODELS_REFRESH_MS'];
  if (raw === undefined || raw === '') return DEFAULT_REFRESH_INTERVAL_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_INTERVAL_MS;
}
