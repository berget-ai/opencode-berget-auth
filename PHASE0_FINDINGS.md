# Phase 0 Findings — Spike Validation

Date: 2026-10-03. Environment: `@opencode/cli@2.0.22` (npm), isolated
`XDG_DATA_HOME`, spike fixture at `/tmp/oc-v2-spike/proj/.opencode/plugins/berget-spike.ts`
(manual throwaway — not committed). Method: headless `opencode serve` +
raw HTTP API + `opencode run --standalone`, with a local probe server standing in
for the provider to capture `Authorization` headers.

## Verified (green)

- **(a) Method registration.** The integration transform upserts cleanly onto the
  *native* `berget` integration (models.dev): plugin methods (`oauth`, `device`,
  labeled key) merge with the framework's `env` method; display name set to
  "Berget AI".
- **(b) Token injection is automatic — no hook needed.** The `key`-method
  credential (`Authorization: Bearer spike-test-abc123`) and the OAuth access
  token both reached `POST /v1/chat/completions` on the provider
  baseURL without any plugin-side header injection. Resolves MIGRATE_V2.md's open
  question about the key method positively — no `model.request` fallback needed.
- **(c) Refresh pipeline E2E.** Seeded an *expired* OAuth credential with the real
  V1 refresh token. On `connection.resolve` the framework called the plugin's
  `refresh` (`methodID: "oauth"`), which POSTed to
  `https://api.berget.ai/v1/auth/refresh` → fresh 900 s JWT → **re-persisted**
  in the V2 credential store (db `access`/`expires` updated) → fresh Bearer
  captured by the probe on the next agent loop. Lazy, on-expiry, framework-driven.
- **(d-fallback) Plugin-side credential migration works.**
  `POST /api/credential {integrationID, label, value, activate:true}` with a V1
  `auth.json` OAuth shape → active connection immediately; refresh pipeline
  (c) then runs on it. The plugin can implement a one-time V1 import in `setup()`.
- **(e) SDK-free, type-only devDependency: confirmed.** With `@opencode/plugin`
  unresolvable from the plugin's ancestor chain, the spread-entrypoint plugin
  loaded, registered all transforms (probe hits prove our provider settings were
  used), and completed an agent loop. Bun strips `import type`. Promotion of the
  SDK to a regular dependency is NOT needed.
- **PKCE + device authorize paths.** Real Keycloak grants work headlessly up to
  user approval: device grant returns `verification_uri_complete` +
  `user_code`; instructions embed URL + code + QR as a markdown data-URI image;
  PKCE authorize URL (S256 challenge) returns Keycloak's login page (200) and the
  localhost callback listener binds (404 on non-callback paths).
- **Upsert semantics.** `editor.method.update` merged 3 plugin methods onto the
  native integration without duplicates; native key-method label untouched
  (ours replaced it), `editor.update` set the display name.

## Findings that amend the plan / MIGRATE_V2.md

1. **[CRITICAL] V1 credential auto-import does not run on fresh V2 databases**
   (`@opencode/cli@2.0.22`). `DatabaseMigration.apply` bootstraps a fresh db with
   `schema.up` and journal-inserts **all 48 migration ids — without executing
   their `up()`**. `20260805200742_import_legacy_credentials` only runs via
   `applyOnly` when upgrading an *existing older-V2* db. Verified twice with
   seeded `auth.json` (berget + openai entries): 0 credentials imported,
   `GET /api/experimental/migration/v1` → `{"status":"completed"}`. MIGRATE_V2.md's
   "V2 imports the V1 store automatically" is **wrong for first V2 startup**
   with this CLI build.
   → **Plan amendment:** Phase 2 gains a plugin-side one-time import (read
   `$XDG_DATA_HOME || ~/.local/share` + `/opencode/auth.json`, decode V1 shapes,
   `credential.create` + `activate` via the client) — the fallback proven above.
   Watch upstream: if a later CLI build fixes bootstrap, keep the import gated
   (only when no berget credential exists) so it stays idempotent.
2. **V2 CLI distribution**: ships as `@opencode/cli` (npm, 2.0.x, postinstall
   native binary), **not** `opencode-ai@beta` as MIGRATE_V2.md's background
   assumed. Phase 4 E2E legs must use `@opencode/cli`.
3. **Berget is native in V2's models.dev provider registry** (env
   `BERGET_API_KEY`, openai-compatible, `https://api.berget.ai/v1`, model catalog
   included). Consequences: key/env auth works in V2 *without* our plugin; the
   V2 plugin's unique value is OAuth (PKCE + device) + refresh + the docs/
   UX around it. Also means `methodID: "oauth"` for the PKCE method remains
   correct for the import-matching path (unused until the import is fixed or
   done plugin-side), and our provider transform must stay compatible with the
   native one (verified: clean upsert).
4. **`opencode run` reattaches to a running instance by default** — use
   `--standalone` in E2E harnesses to avoid cross-project instance bleed
   (caused a confusing probe result during the spike).

## Deferred / user-gated

- Actual OAuth login completion (browser Keycloak password + callback →
  credential persisted via `authorize`/`callback`). Fixture is ready;
  needs a human at the keyboard.
- TUI `/connect` visuals (QR rendering fidelity, method labels) — content of
  `instructions` verified; rendering is a visual check.
- V1 1.3.4 floor leg (`opencode-ai@1.3.4` loading the dual entrypoint) — planned
  for Phase 4's E2E matrix, unchanged.

## Scratch artifacts

- `/tmp/oc-v2-spike/` — CLI install, spike project, probe server, test dirs
  (`proj`, `bare`, `import-test*`, `refresh-test`), captured logs and db copies.
- Real V1 `auth.json` was copied (never modified) into isolated data dirs; one
  real refresh performed using the V1 refresh token (V1 Keycloak session still
  valid — a real user-visible data point: V1 login survives into a V2 session
  *if* migrated).
