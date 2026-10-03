# Implementation Plan: OpenCode V2 Dual Support

Condensed execution plan for [MIGRATE_V2.md](MIGRATE_V2.md). Scope is the **bare
minimum for V2 support**: dual entrypoint, V2 integration + provider registration,
tests, docs, release. All research decisions in MIGRATE_V2.md are already made and are
treated as inputs, not re-opened here.

**Worktree:** `~/worktrees/github.com/berget-ai/opencode-berget-auth/feature-opencode-v2-support`
(branch `feature/opencode-v2-support`). All phases below are committed here, never in
the main checkout.

**Non-negotiable design constraints** (from MIGRATE_V2.md, do not revisit):

- One package, both majors. Default export becomes the spread object
  `{ ...define({ id, setup }), server }` with a **lazy** `setup()` (dynamic import of
  `./src/v2/setup`) so no V2 SDK code executes under V1.
- `@opencode/plugin@2.0.22` is a **devDependency, type-only**. All `src/v2/` SDK imports
  are `import type`. Promotion to a regular dependency (~180 MB user-install tax) only if
  the Phase 0(e) check proves a runtime import is required.
- PKCE method registers with `id: "oauth"` (matches V2's legacy-credential import
  fallback), device flow with `id: "device"`. Same constants are used in
  `editor.method.update` and in returned `Credential.OAuth.methodID`.
- V1 support floor: `>= 1.3.4`, **gated** on the Phase 4 E2E leg. If that leg fails,
  raise the documented floor to `>= 1.18.29` instead of debugging old loaders.
- No V1 behavior changes. All existing named exports stay.

---

## Phase 0 — Worktree setup + spike validation (no commit)

Manual verification on the V2 beta CLI, using a scratch plugin in `.opencode/plugins/`
of a throwaway project — nothing here lands in the repo. Per MIGRATE_V2.md step 1:

- (a) The three methods appear in `/connect`.
- (b) The access token reaches provider requests — **including the `key` method**.
  Fallback if not automatic: `ctx.session.hook("model.request", ...)` with
  `{ providerID: 'berget' }` (registering `context`, `compaction`, `generate`, `title`
  variants as needed).
- (c) `refresh` fires near expiry (5-min skew) and the refreshed credential is
  re-persisted.
- (d) Legacy import E2E: seed `auth.json` as V1 writes it (OAuth shape, key `"berget"`),
  confirm import with `methodID: "oauth"`, live connection, no re-login, and that
  `refresh` re-persists the imported credential.
- (e) SDK-free check: plugin loads and registers with `@opencode/plugin` present only
  as a devDependency. Failure here is the documented trigger to promote it to a regular
  dependency in Phase 1.
- QR in `instructions` renders acceptably in the V2 TUI.

Also: copy `MIGRATE_V2.md` into this worktree (it is untracked on `main`).

**Gate:** all of (a)–(e) pass, or the plan is amended before Phase 1.

**Outcome (2026-10-03): COMPLETE — see [PHASE0_FINDINGS.md](PHASE0_FINDINGS.md).**
Amendments carried into the phases below:

- V2 CLI ships as `@opencode/cli` (npm), not `opencode-ai@beta` (Phase 4 E2E
  uses it).
- **V1 credentials are NOT auto-imported on fresh V2 dbs** in `@opencode/cli@2.0.22`
  (bootstrap journals all migrations without running their `up()`). Phase 2 gains
  a plugin-side one-time V1 import (read legacy `auth.json`, `credential.create`
  - activate via the client) — verified as the working fallback.
- Header injection is automatic for both OAuth and key credentials — the
  `model.request` fallback hook is dropped from Phase 3.
- Type-only devDependency confirmed working — no SDK promotion path needed.
- Berget ships natively in models.dev (key/env auth works plugin-less in V2);
  the plugin's V2 value is OAuth + refresh; provider transform must upsert onto
  the native definition (verified compatible).

---

## Phase 1 — Dependencies + dual entrypoint

**Commit:** `feat: add dual V1/V2 entrypoint with lazy V2 setup`

Changes:

- `package.json`: add `@opencode/plugin` `2.0.22` (exact) to `devDependencies`; promote
  `@opencode-ai/sdk` to an explicit dependency (typecheck hygiene — all its imports are
  `import type`). Exports map unchanged (`"."` and `"./server"` both → `./index.ts`).
- `index.ts`: rewrite default export to the dual object form (local `define` identity
  function, lazy `setup()` dynamically importing `./src/v2/setup`, `server(input)`
  delegating to `BergetAuthPlugin`). Keep every existing named export.
- `src/v2/setup.ts`: stub returning `{}` (real wiring lands in Phase 3) so the dynamic
  import target exists and typechecks.

Tests:

- New `index.test.ts`: default export is an object with `id: 'berget.auth'`, a `setup`
  function, and a `server` function; `server(input)` delegates to `BergetAuthPlugin`;
  all previous named exports still present. Assert `src/v2/**` contains no non-type
  import of `@opencode/plugin` (a lint rule or a grep-based test) so the type-only
  constraint is enforced in CI.
- Existing V1 test suite passes unchanged. `npm run typecheck` clean.

Docs: JSDoc on `index.ts` explaining the dual-export contract (V1 ≥ 1.3.4 calls
`server()`, V2 calls `setup()`, lazy import keeps the V2 SDK out of V1's module graph).

**Verify:** `npm test && npm run lint && npm run typecheck`.

---

## Phase 2 — V2 integration registration

**Commit:** `feat: register berget integration and auth methods on V2`

Changes:

- `src/v2/integration.ts`: `ctx.integration.transform` registering three methods via
  `editor.method.update` — PKCE (`id: "oauth"`, `mode: 'auto'`), device flow
  (`id: "device"`, `mode: 'auto'`, device-code `expires_in` → `expiresAt`), API key
  (`type: 'key'`) — plus `editor.update('berget', (i) => { i.name = 'Berget AI' })`.
- `src/v2/credential.ts`: `AuthOAuthResult` → `Credential.OAuth` adapter
  (`type: 'oauth'`, `methodID` echoing the registered method id, integer epoch-ms
  `expires`, failures reject the promise).
- Adapters wrapping `createPkceAuthorizeMethod` / `createDeviceAuthorizeMethod` to the
  V2 `authorize` signature (flow code in `src/plugin/` stays untouched and shared).
- `refresh(credential)` delegating to the Keycloak refresh call moved out of
  `refreshAccessTokenDirect` (shared with V1, no V1 signature change).

**Changed by Phase 0:** add `src/v2/migrate.ts` — a one-time V1 credential import
running in `setup()`: read `$XDG_DATA_HOME || ~/.local/share` + `/opencode/auth.json`,
decode V1 OAuth shapes against the `Credential.OAuth` type, skip when a `berget`
credential already exists, then `credential.create` + `activate` via the client
(framework auto-import is broken on fresh V2 dbs in `@opencode/cli@2.0.22`; the
fallback is spike-verified end to end). Idempotent by construction; silent no-op
when `auth.json` is absent or undecodable.

**Refined during Phase 2:** the plugin context does not expose the client's
`credential` domain (verified in `@opencode/plugin@2.0.22`'s context assembly), so
the import is **feature-detected** — it creates the credential when
`ctx.credential.create` exists and is a silent no-op today. The spike's HTTP-API
verification proved the store accepts the imported credential and refreshes it;
the feature-detect activates the path automatically on CLI builds that expose the
domain.

Tests (`src/v2/integration.test.ts`, mocked `ctx`):

- Transform registers exactly three methods with the expected ids/types/modes; display
  name is set.
- V1 import: reads/decodes legacy `auth.json` (oauth shapes), creates + activates a
  credential with `methodID: "oauth"`, skips when a `berget` credential already exists,
  no-ops on missing/malformed file.
- Adapter output matches the `Credential.OAuth` shape (discriminant, `methodID`,
  integer ms `expires`); authorize failures reject.
- The method-id constants used in `editor.method.update` and in returned credentials are
  the same constants (regression guard against the silent no-refresh failure mode).
- `refresh` calls the shared Keycloak refresh and returns a re-shaped credential.

Docs: JSDoc on the new modules; short "V2 credential storage" section in `docs/auth.md`
(framework owns persistence and lazy refresh; plugin implements only
`authorize`/`refresh`).

**Verify:** `npm test && npm run lint && npm run typecheck`.

---

## Phase 3 — V2 provider/model registration + setup wiring

**Commit:** `feat: register berget provider and models on V2`

Changes:

- `src/v2/provider.ts`: fetch models once in `setup` (reusing
  `fetchBergetModels`/`getInferenceUrl`), capture them, register via a **synchronous**
  `ctx.provider.transform` → `editor.add({ info: { ...Provider.Info.empty('berget'),
name: 'Berget AI', activation: 'enabled', integrationID: 'berget',
package: '@opencode/ai/providers/openai-compatible', settings: { baseURL } }, models })`.
  Model mapping uses `Model.Info.default(providerID, id)` as the base.
- `src/v2/setup.ts`: replace the Phase 1 stub with the real wiring
  (integration transform from Phase 2 + provider transform).

Tests (`src/v2/provider.test.ts`):

- Model mapping produces valid `Model.Info` entries from `fetchBergetModels` output.
- Transform is synchronous and side-effect-free (models captured at setup time, not
  fetched inside the transform).
- `setup(ctx)` registers both transforms.

**Changed by Phase 0:** no `model.request` header-injection hook — token injection is
automatic for OAuth and key credentials (spike-verified). The provider transform must
upsert onto the native models.dev `berget` definition without duplicating models
(also spike-verified).

Docs: JSDoc; "V2 provider registration" note in `docs/auth.md` (models fetched at
startup, transform synchronous).

**Verify:** `npm test && npm run lint && npm run typecheck`.

---

## Phase 4 — E2E gate, docs, release prep

**Commit:** `docs: V2 support docs and 2.0.0 release prep`

E2E matrix (manual, installed package from a packed tarball — never workspace-linked, so
the real `exports` resolution is exercised). Results recorded in the commit message:

- V1 **1.3.4** (`opencode-ai@1.3.4`; floor leg — gates the documented floor), V1 latest
  (`opencode-ai@1.18.x`), V2 (`@opencode/cli@2` — the V2 CLI's npm distribution).
- All three login methods + a session running past token expiry on each.
- Transition leg: log in on V1 latest → run V2 beta → complete an agent loop **without
  re-authenticating**; re-run after a V2-era refresh to confirm the documented downgrade
  story.

Changes:

- `README.md` + `docs/auth.md`: V2 config (`"plugins": [...]`), V1 `>= 1.3.4`
  requirement, pin-`@bergetai/opencode-auth@1` guidance for older V1 CLIs (object-form
  default export fails to load there — no implicit freeze, `engines.opencode` cannot
  substitute), credential-transition section: **V1 logins carry over via the plugin's
  one-time import** (the framework's native import is broken on fresh V2 dbs as of
  `@opencode/cli@2.0.22`); logins made on V1 _after_ the import are not imported
  (re-run triggers only when no `berget` credential exists); V2 refreshes don't
  propagate back to `auth.json`, so downgrading to `@1` after a long V2 session may
  require re-login.
- `package.json`: version → `2.0.0`.
- Release notes draft (for `publish.yml`): V2 support window, the 1.3.4 floor, the `@1`
  pin.

**Verify:** E2E matrix green (or floor raised per the gate); `npm run format:check &&
npm test && npm run lint && npm run typecheck`. Release via the existing `publish.yml`
workflow — from `main` after merge, not from the worktree.

---

## Out of scope (per MIGRATE_V2.md non-goals)

- V1 behavior changes, new auth methods, TUI/CLI plugins.
- Dropping `server()` — later major, once V2 CLI is GA.
- Debugging pre-1.3.4 loaders — the floor moves up instead.
