# OpenCode V2 Migration Plan

Plan for adding OpenCode V2 support to `@bergetai/opencode-auth` while keeping V1 support
in the same package (dual support, no V1 freeze).

## Background

OpenCode V2 ships a **new, incompatible plugin API**. V1 plugins do not load in V2.

- New SDK package: `@opencode/plugin` (replaces `@opencode-ai/plugin`), currently `2.0.22`
  and tagged `latest` on npm.
- New entrypoint: `export default Plugin.define({ id, setup(ctx) })` instead of an exported
  plugin function returning a hooks object.
- The V2 CLI itself is still pre-release (`opencode-ai` latest = `1.18.34`; V2 lives on the
  `beta`/`next` dist-tags with docs at <https://opencode.ai/v2>). The plugin SDK, however, is
  GA. **Therefore: dual support, not a hard cutover.**

### Official sources

- [Migrate plugins from V1](https://opencode.ai/v2/docs/build/plugins/migrate-v1) — official migration guide
- [V2 Plugins API](https://opencode.ai/v2/docs/build/plugins) — full plugin context reference
- [V2 HTTP API & schemas](https://opencode.ai/v2/docs/api) — `Integration.Method`,
  `Credential.OAuth`, `Provider.Info`
- `@opencode/plugin@2.0.22` type definitions (inspected locally from the npm tarball)
- V1 plugin loader source across versions (`packages/opencode/src/plugin/index.ts` and
  `shared.ts`): [v1.3.3](https://github.com/sst/opencode/blob/v1.3.3/packages/opencode/src/plugin/index.ts)
  (no object-form support), [v1.3.4](https://github.com/sst/opencode/blob/v1.3.4/packages/opencode/src/plugin/index.ts)
  (first release with it), [v1.18.34](https://github.com/sst/opencode/blob/v1.18.34/packages/opencode/src/plugin/index.ts)
  (semantics unchanged) — verified dual-export detection and its version history
- [sst/opencode#19347](https://github.com/sst/opencode/pull/19347) ("tui plugins", commit
  `6274b067`) — the PR that introduced object-form `server()` detection
- [npm docs: `peerDependenciesMeta`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependenciesmeta)
  — "Npm will not automatically install optional peer dependencies"
- V2 core source (`sst/opencode@beta`): `packages/core/src/integration.ts` (refresh
  persistence, integration upsert), `packages/core/src/plugin/module.ts` (plugin module
  validation), `packages/util/src/npm.ts` (`ignoreScripts: true` in the plugin installer)
- Ecosystem plugins with shipped V2 support (checked 2026-10-03):
  [heymaaz/opencode-claude-auth-v2](https://github.com/heymaaz/opencode-claude-auth-v2)
  (`opencode-claude-auth-v2@0.4.0-beta.5`) and
  [jenslys/opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth)
  (`opencode-gemini-auth@2.0.1`) — see the "Ecosystem survey" section below

## Strategy: one package, both majors

Dual support is the officially recommended pattern — the migration guide has a dedicated
["Support V1 and V2 from one package"](https://opencode.ai/v2/docs/build/plugins/migrate-v1#support-v1-and-v2-from-one-package)
section showing exactly the spread entrypoint below — and it is verified in the shipped
V1 loader. Object-form `server()` detection (`readV1Plugin(..., 'server', 'detect')` →
`default.server(input, options)`) was introduced in
[sst/opencode#19347](https://github.com/sst/opencode/pull/19347) ("tui plugins", commit
`6274b067`, 2026-03-27) and first shipped in **v1.3.4** (npm, 2026-03-29); v1.3.3 has no
trace of it. The semantics are byte-for-byte identical in every later line checked
(1.14.17, 1.15.0, 1.16.0, 1.18.0, 1.18.28–1.18.34). **The V1 support floor is therefore
1.3.4 or newer, not a recent 1.18.x.**

### Discrepancy with the official floor (1.18.29)

The same official guide states "V1 object entrypoints are supported in OpenCode `1.18.29`
and newer"
([migrate-v1 docs](https://opencode.ai/v2/docs/build/plugins/migrate-v1#support-v1-and-v2-from-one-package)).
That number originates in a **docs-only** commit
([sst/opencode@`27027777`](https://github.com/sst/opencode/commit/27027777d2), "docs:
expand V1 plugin migration guide", 2026-09-12): the
[v1.18.28...v1.18.29 diff](https://github.com/sst/opencode/compare/v1.18.28...v1.18.29)
contains no plugin-loader changes (only a Codex model filter and console quota code), and
1.18.30 was already published when the docs were written (npm, 2026-09-09). So 1.18.29 is
the version the docs author verified with, not a hard compatibility boundary — the source
evidence above (`readV1Plugin`/`applyPlugin` byte-identical since 1.3.4) is the stronger
signal.

One caveat in the other direction: the machinery _around_ detection did change after
1.3.4 — entrypoint resolution for exports without a leading `./`
([#20140](https://github.com/sst/opencode/pull/20140), <= 1.3.9), install version-pinning
and `ignoreScripts` ([#20248](https://github.com/sst/opencode/pull/20248), <= 1.3.11),
warn-only handling of plugins without entrypoints
([#20284](https://github.com/sst/opencode/pull/20284), <= 1.3.11), and `npm-package-arg`
specifier parsing ([#21135](https://github.com/sst/opencode/pull/21135), <= 1.3.17). None
of these affect this package's shape: it installs from the npm registry and its `exports`
values already use leading `./` (resolved correctly even before #20140), and the
install + detection path is the same one the current 1.x package relies on for those CLIs
today. **Decision: keep the >= 1.3.4 floor, but gate it on the step 7 E2E run at 1.3.4 —
if that leg fails, raise the documented floor to >= 1.18.29 (the officially claimed one)
instead of debugging old loaders.** The official guide itself prescribes exactly this loop: "If you
support older V1 releases, use separate package versions or entrypoints and **test the oldest release
you claim to support**" ([migrate-v1
docs](https://opencode.ai/v2/docs/build/plugins/migrate-v1)). This plan keeps one package (the spread
entrypoint, not separate versions/entrypoints) and takes the "test the oldest release" leg, with the
source evidence above as the reason to believe 1.3.4 works.

```ts
// V1 loader (opencode-ai@1.18.34, packages/opencode/src/plugin/index.ts)
function getServerPlugin(value: unknown) {
  if (isServerPlugin(value)) return value; // legacy: export IS the function
  if (!value || typeof value !== 'object' || !('server' in value)) return;
  if (!isServerPlugin(value.server)) return;
  return value.server; // object form: use .server
}
// ...
hooks.push(await plugin.server(input, load.options)); // server() gets V1 PluginInput + options
```

New entrypoint shape (lazy `setup()` — see the rationale after the snippet):

```ts
// index.ts
import type { Plugin } from '@opencode/plugin'; // types only: no V2 SDK code executes under V1

import { BergetAuthPlugin } from './src/plugin';
import type { PluginInput } from './src/plugin/types';

// Plugin.define is the identity function (@opencode/plugin@2.0.22, dist/promise/plugin.js),
// so a local alias avoids a runtime import of the V2 SDK in the module V1 loads.
const define = (plugin: Plugin.Plugin): Plugin.Plugin => plugin;

export default {
  ...define({
    id: 'berget.auth',
    async setup(ctx) {
      // V2-only code (and its @opencode/plugin / @opencode/schema / effect imports)
      // loads lazily; V1 only ever calls server() below, so it never runs this.
      const { setupBergetAuth } = await import('./src/v2/setup');
      return setupBergetAuth(ctx);
    },
  }),
  // V1 (>= 1.3.4) calls this with the same PluginInput the current default export receives
  async server(input: PluginInput) {
    return BergetAuthPlugin(input); // existing V1 implementation, untouched
  },
};
```

All existing named exports (`BergetAuthPlugin`, `accessTokenExpired`, ...) stay — only the
default export changes shape.

#### Entrypoint resolution: both loaders arrive via `exports["./server"]`

The V1 loader does not read package main first when an exports map entry matching the plugin kind
exists: `resolvePackageEntrypoint` reads `exports["./server"]` (kind is `"server"`) and only falls
back to `packageMain` if that is missing
([`shared.ts`](https://github.com/sst/opencode/blob/v1.18.34/packages/opencode/src/plugin/shared.ts)
at v1.18.34, `packages/opencode/src/plugin/shared.ts`). This package's exports map `./server` to the
same `index.ts` as `"."`, so V1 and V2 load the identical dual object — but both through the
`./server` specifier, not `"."`. Two consequences:

- Step 2 must keep both specifiers pointing at the same file (they already do); separating them, as
  `opencode-gemini-auth` does, hands the V1 loader whatever `./server` contains — fatal if it is
  V2-only (see the ecosystem survey below).
- The step 7 floor leg must run the **published package** so the real exports map is exercised: a
  workspace-linked or `file://` install can bypass `exports` resolution and test the wrong resolution
  path. Step 7 already requires "installed package, not workspace-linked" — this is why.

Why lazy `setup()` instead of a static `import { Plugin } from '@opencode/plugin'`: the
SDK's server entrypoint (`dist/promise/index.js`) re-exports every `@opencode/schema`
module, which executes `effect` at module load. A static import would run all of that in
V1's runtime too. With the snippet above, V1's module graph is byte-for-byte what it is
today plus a plain object literal — the V2 SDK, `@opencode/schema`, and `effect` are only
ever loaded by the V2 CLI, which is the only caller of `setup()`. This turns the
"does the V2 SDK execute under V1?" hazard (see the footprint bullet below) into a
non-question by construction, and it is safe on both sides:

- **V2** reads `id` + `setup()`, ignores `server()` — schema-verified: V2 decodes the
  default export as `{ id, effect } | { id, setup }`
  ([`packages/core/src/plugin/module.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/plugin/module.ts)
  on `beta`), and effect Schema ignores excess properties by default. Verified empirically
  against the exact shipped `effect@4.0.0-rc.112`: `{ id, setup, server }` decodes cleanly.
- **V1** (>= 1.3.4) detects the object form and calls `default.server(input, options)`;
  named exports are never consulted in that path (source-verified, see "Resolved during
  research" below).
- V1 < 1.3.4 **cannot** load the object form, and this is _not_ an implicit freeze. The
  old loader calls every module export as a plugin with no typeof check
  (`for (const [_name, fn] of Object.entries(mod)) { hooks.push(await fn(input)) }` —
  [v1.3.3 loader](https://github.com/sst/opencode/blob/v1.3.3/packages/opencode/src/plugin/index.ts)),
  so the non-function default export throws. The loader catches this per-plugin (logs
  `failed to load plugin` and publishes `Session.Event.Error` — same v1.3.3 source), so
  the CLI keeps running but the plugin fails to load with a user-visible error. Because
  OpenCode installs plugins from npm at runtime, users with
  `"plugin": ["@bergetai/opencode-auth@latest"]` on those CLIs auto-receive 2.x and lose
  the integration. They must pin `@bergetai/opencode-auth@1` — this needs explicit README
  and release-notes guidance (steps 6 and 8). `engines.opencode` cannot substitute for the
  pin guidance: `checkPluginCompatibility` was itself introduced in 1.3.4
  ([v1.3.4 `shared.ts`](https://github.com/sst/opencode/blob/v1.3.4/packages/opencode/src/plugin/shared.ts);
  absent in v1.3.3, which has no `shared.ts` at all), so the versions that break never
  evaluate it. It becomes useful in the later major that drops V1.
- Side benefit: the object form fixes a latent V1 bug in the current package. Today the
  default export is a bare function, so `readV1Plugin` detect mode returns nothing and
  the `getLegacyPlugins` fallback invokes **every** function export as a plugin —
  including the `accessTokenExpired` / `isOAuthAuth` / `createPkceAuthorizeMethod`
  utility exports, whose return values get pushed into `hooks` (inert, but wrong).
  Routing V1 through the default object's `server()` avoids this entirely.
- Exit criterion: drop `server()` in a later major once the V2 CLI is GA and V1 usage winds
  down. The official guide explicitly recommends removing the V1 implementation after the
  support window ends.

## What changes

| Current (V1)                                                                                           | V2 equivalent                                                                                                                                                                                                                                  | Impact                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.loader` returning custom `fetch` with per-request refresh + disk cache-busting (`src/plugin.ts`) | **Deleted in the V2 path.** The `refresh` callback on the OAuth method registration lets the framework own refresh timing and credential persistence                                                                                           | Big simplification: `fetchWithAuth`, cache-busting, and `client.auth.set` persistence orchestration all go away in V2                                                                                |
| `auth.methods`: PKCE (auto), device flow (QR), API key                                                 | `ctx.integration.transform` → `editor.method.update(...)` x3: two `oauth` methods (**both** `mode: 'auto'` — the device flow polls; the user never pastes a code into OpenCode) + one `key` method                                             | Direct port. `pkce-flow.ts` / `device-flow.ts` are framework-agnostic and reusable; return `Credential.OAuth` instead of V1 `AuthOAuthResult` (**not** the same shape — see the adapter notes below) |
| `config` hook setting `config.provider.berget` (baseURL + models)                                      | `ctx.provider.transform` → `editor.add({ info: { ...Provider.Info.empty('berget'), name: 'Berget AI', activation: 'enabled', integrationID: 'berget', package: '@opencode/ai/providers/openai-compatible', settings: { baseURL } }, models })` | `models.ts` output must map to `Model.Info` (use `Model.Info.default(providerID, id)`); fetch models in `setup` before the (synchronous) transform                                                   |
| Default-exported plugin function                                                                       | Object form: `export default { ...define({ id, setup: lazy V2 }), server: BergetAuthPlugin }` (see the strategy entrypoint)                                                                                                                    | Keeps V1 working; V2 SDK never loads under V1                                                                                                                                                        |
| `"plugin": [...]` in user config / README                                                              | `"plugins": [...]`                                                                                                                                                                                                                             | Docs update                                                                                                                                                                                          |

### Verified V2 integration API (from `@opencode/plugin@2.0.22` `.d.ts`)

```ts
export type IntegrationOAuthAuthorization = {
  readonly url: string;
  readonly instructions: string;
  readonly expiresAt?: number;
} & (
  | { readonly mode: 'auto'; readonly callback: Promise<Credential.OAuth> }
  | { readonly mode: 'code'; readonly callback: (code: string) => Promise<Credential.OAuth> }
);

export type IntegrationOAuthMethodRegistration = {
  readonly integrationID: string;
  readonly method: { id: string; type: 'oauth'; label: string; form?: Form.Fields };
  readonly authorize: (answer: Form.Answer) => Promise<IntegrationOAuthAuthorization>;
  readonly refresh?: (credential: Credential.OAuth) => Promise<Credential.OAuth>;
  readonly label?: (credential: Credential.OAuth) => string | undefined;
};
```

This covers everything the plugin needs: PKCE (`mode: 'auto'`, callback promise resolves
after the localhost redirect), device flow (polling promise; QR/URL in `instructions`), and
framework-driven token refresh via `refresh`.

### Confirmed framework semantics (source- and docs-verified)

- **OAuth modes**: `code` means the user pastes a code back into OpenCode
  (`integration.oauth.complete` is documented as "complete a code-based OAuth attempt");
  `auto` means the callback promise resolves on its own. PKCE (localhost redirect) and the
  device flow (polling; the user code is entered on the Keycloak page) are **both** `auto`.
- **Ecosystem cross-check**: the published
  [opencode-claude-auth-v2](https://github.com/heymaaz/opencode-claude-auth-v2) plugin
  (`0.4.0-beta.5`, `src/index.ts`) registers its OAuth method with exactly the planned shape —
  `draft.method.update({ integrationID, method, authorize, refresh, label })` where `authorize`
  returns `{ mode: 'auto', url, instructions, callback }` (the credential wrapped in a promise) and
  `refresh` returns a `Credential.OAuth` with `metadata: { email }` — independently confirming the
  SDK `.d.ts` reading above, including `draft.update(INTEGRATION_ID, ...)` for the display name.
- **Token refresh**: lazy, on `Integration.connection.resolve` — when the stored credential
  is within 5 minutes of `expires`, the framework calls the method's `refresh(credential)`
  and re-persists the result (`packages/core/src/integration.ts` on `beta`). No background
  timer; per-request like the V1 fetch wrapper, so behavior parity holds.
- **Error channel**: rejected `authorize`/`refresh` promises are wrapped in
  `AuthorizationError`; a failed authorize settles the attempt as
  `{ status: 'failed', message }`, surfaced to the user. V1's `{ type: 'failed' }` results
  become promise rejections.
- **Integration creation**: `editor.method.update(...)` upserts — it creates the integration
  when missing, with `name` defaulting to the raw id. Set the display name explicitly:
  `editor.update('berget', (i) => { i.name = 'Berget AI' })`.
- **`Credential.OAuth` adapter** (schema-verified): `{ type: 'oauth', methodID, refresh,
access, expires, metadata? }` — discriminant `'oauth'` (not `'success'`), **required**
  `methodID`, integer `expires`. Units are epoch **milliseconds** for both `expires`
  (compared against `Clock.currentTimeMillis` in `connection.resolve` —
  [`integration.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/integration.ts)
  on `beta`) and `IntegrationOAuthAuthorization.expiresAt` — the same convention the V1
  code already uses (`Date.now() + expires_in * 1000`, `src/plugin/device-flow.ts`), so no
  unit conversion. Small adapter, but not zero work.
- **Method registration details** (source-verified, same `integration.ts`): `oauth` methods
  dedup by `method.id`, so PKCE and device flow need distinct method ids; `key`/`env`
  methods have no id and dedup by **type** (any same-type method matches), so there is
  exactly one `key` method and transform replays replace rather than duplicate it. Map the
  device flow's `expires_in` (already tracked in `src/plugin/device-flow.ts`) to
  `IntegrationOAuthAuthorization.expiresAt` so the attempt expires with the device code
  instead of the framework's 10-minute default (`attemptLifetime`, same source).
- **Provider registration**: the official plugin-context example matches the planned
  `editor.add` shape, including `package: '@opencode/ai/providers/openai-compatible'`.
  `Provider.Info.activation` is required — set `activation: 'enabled'` (matches V1's
  always-on behavior).
- **Install footprint**: all four TUI peers (`@opentui/*`, `solid-js`, `@opencode/theme`)
  are marked `optional: true` in `@opencode/plugin`'s `peerDependenciesMeta`, and npm
  does not auto-install optional peers
  ([npm docs](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#peerdependenciesmeta);
  verified empirically with npm 11.9.0 — none of them install). The real weight is the
  **regular** dependency tree: ~180 MB installed (`effect` 51 MB, `@opentelemetry/*`
  28 MB, `@redis/*` 15 MB, `@aws-sdk`/`@smithy` ~14 MB, `zod` 5.6 MB — measured, npm
  11.9.0). The server (`promise`) entrypoint imports `effect` + `@opencode/schema` at
  module load — with the lazy-`setup()` entrypoint above, none of that executes under V1
  by construction (V1 never calls `setup()`, so the dynamic import never runs). The
  installers set `ignoreScripts: true` (no native builds —
  [`packages/util/src/npm.ts`](https://github.com/sst/opencode/blob/beta/packages/util/src/npm.ts)
  on `beta`). The slim-down is therefore purely an install-footprint tradeoff, not a V1
  safety question: `Plugin.define` is the identity function (verified in `dist`), so
  depending on narrow `@opencode/schema` plus hand-rolled context types instead of the
  full SDK, just decoupled from correctness. **Decision (researched, see "Dependency
  footprint on V1 users" below): ship `@opencode/plugin` as a type-only devDependency —
  zero runtime SDK imports in `src/v2/` — and step 1 verifies an installed-package E2E
  with no runtime SDK. Fallback if a runtime need emerges: promote to an exact regular
  dependency, accept the ~180 MB tax on every user, and document it.**

### Legacy credential migration (existing users)

V1 and V2 use different credential stores, but V2 **imports the V1 store automatically** —
users who log in on V1 and later run the V2 CLI should not need to re-authenticate. This
was surfaced as a review gap and resolved from source:

- **V1 storage**: V1 persists `client.auth.set` credentials to `<Global.Path.data>/auth.json`
  (`packages/opencode/src/auth/index.ts` at
  [v1.18.34](https://github.com/sst/opencode/blob/v1.18.34/packages/opencode/src/auth/index.ts);
  our `src/plugin.ts` persists OAuth results there via `client.auth.set`).
- **V2 import**: a one-time database migration
  [`20260805200742_import_legacy_credentials`](https://github.com/sst/opencode/blob/beta/packages/core/src/database/migration/20260805200742_import_legacy_credentials.ts)
  on `beta` reads that **exact same file** on first V2 database setup (`auth.json` lives
  under the same XDG data root as the V2 SQLite database,
  [`database.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/database/database.ts)
  on `beta`). It decodes V1's persisted shapes (`type: 'oauth'` with
  `refresh`/`access`/`expires`, `type: 'api'` keys, wellknown) — a superset match for what
  this plugin writes.
- **`methodID` assignment on import matters**: the migration derives
  `Credential.OAuth.methodID` from the auth.json key via a small fallback table —
  `"openai"` → `"chatgpt-browser"`; `"github-copilot"`/`"opencode"`/`"xai"` → `"device"`;
  **everything else → `"oauth"`** (same file). So a legacy `"berget"` entry imports with
  `methodID: "oauth"`, regardless of which V1 method (PKCE or device flow) created it.
- **Connections need no activation**: every stored credential automatically surfaces as a
  connection on its integration (`resolveConnections`,
  [`integration.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/integration.ts)
  on `beta`) — a migrated credential becomes live as soon as this plugin registers the
  `"berget"` integration.
- **Silent failure mode**: `connection.resolve` looks up the refresh implementation by
  `credential.value.methodID` and returns the credential untouched when nothing matches —
  `if (!implementation?.refresh) return credential.value` (same source). A method id that
  doesn't match the imported `"oauth"` therefore yields a credential that **works until
  expiry and then never refreshes**, with no visible error.
- **Decision this forces**: the PKCE method must register with `id: "oauth"` exactly (the
  legacy import fallback value), and the device flow gets a distinct id (e.g. `"device"`).
  Refresh behaves identically for both flows (same Keycloak refresh-token endpoint), so a
  device-flow-originated V1 credential routed at the PKCE method's `refresh` is equivalent.
- **One-time semantics**: the migration journal runs migrations once
  ([`migration.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/database/migration.ts)
  on `beta`). Logins that happen **on V1 after the first V2 startup** are not imported.
- **Downgrade asymmetry**: the import is read-only — V2 never rewrites `auth.json`, so
  returning to V1 (`@bergetai/opencode-auth@1`) keeps the last V1-era state. Refreshes
  performed while on V2 do not propagate back, so those tokens go stale for V1.

### Dependency footprint on V1 users

Adding `@opencode/plugin@2.0.22` as a **regular** dependency would tax every install — and
with the V2 CLI still pre-release, that is V1 users who load none of it. The installer
landscape was verified across V1 versions:

- V1 **1.3.4–1.3.13** install plugins via `BunProc.install` — a shell-out to
  `bun add --force --exact --cwd <cache>`
  ([`bun/index.ts`](https://github.com/sst/opencode/blob/v1.3.4/packages/opencode/src/bun/index.ts)
  and [`shared.ts`](https://github.com/sst/opencode/blob/v1.3.4/packages/opencode/src/plugin/shared.ts)
  at `v1.3.4`).
- V1 **≥ 1.3.14** and V2 use `@npmcli/arborist` with `ignoreScripts: true` instead — the
  switch landed in [sst/opencode#18308](https://github.com/sst/opencode/pull/18308)
  ("replace BunProc with Npm module using @npmcli/arborist", 2026-04-01);
  [`shared.ts` at v1.3.14](https://github.com/sst/opencode/blob/v1.3.14/packages/opencode/src/plugin/shared.ts)
  imports `Npm`, and `packages/core/src/npm.ts` at
  [v1.18.34](https://github.com/sst/opencode/blob/v1.18.34/packages/core/src/npm.ts) shows
  the same Arborist setup as V2's [`packages/util/src/npm.ts`](https://github.com/sst/opencode/blob/beta/packages/util/src/npm.ts).
- **Bun's optional-peer behavior matches npm's**: "If the dependency is marked optional in
  `peerDependenciesMeta`, Bun uses an existing dependency if possible"
  ([bun install docs, peer dependencies](https://bun.com/docs/cli/install#peer-dependencies)).
  Verified empirically with bun 1.3.14 running the same `bun add --force --exact` command
  V1 1.3.x uses: `@opencode/plugin@2.0.22` installs **without** `solid-js`/`@opentui/*`,
  regular dependencies land at **180 MB on disk** (same as npm). Both installer families
  are therefore covered; the earlier "verify on the real bun path" concern is closed.

The 180 MB regular-dependency weight is the only open cost. Because `Plugin.define` is the
identity function and V2 decodes the default export as plain `{ id, setup }` structures
([`module.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/plugin/module.ts)
on `beta`) — with integration/method/provider registrations themselves plain objects
decoded by the CLI (`IntegrationEditor.update` receives data, not SDK instances) — a V2
implementation needs **no runtime import of the SDK at all**: `import type` for shapes,
`Plugin`-branded string types constructed as plain strings. That makes the type-only
devDependency approach workable, and it is directly verifiable in step 1 spike item (e).

### Ecosystem survey (published plugins with V2 support, checked 2026-10-03)

Three support shapes are in the wild. None uses the spread entrypoint this plan adopts — the official
guide's recommended shape has no shipped precedent, so the step 7 matrix is the plan's validation, not
community imitation:

- **Separate packages** — [opencode-claude-auth-v2](https://github.com/heymaaz/opencode-claude-auth-v2)
  ships V2 only, alongside its V1 predecessor (`opencode-claude-auth`); the README tells users to swap
  `plugin` → `plugins` when moving to V2. It is the strongest external validation of this plan's API
  port (see the cross-check bullet under "Confirmed framework semantics"), with one divergence: it
  imports `@opencode/plugin` **at runtime**, accepting the SDK weight. No established plugin validates
  the type-only devDependency approach, which is precisely why step 1 spike item (e) verifies it
  against an installed-package load, with the documented promotion fallback.
- **Split entrypoints** — [opencode-gemini-auth](https://github.com/jenslys/opencode-gemini-auth)
  claims dual support by putting V1-style named function exports (no default export) in
  `exports["."]` and a V2-only `Plugin.define({ id, setup })` default export in
  `exports["./server"]` — the official guide's "separate entrypoints" alternative. **This shape is
  unsafe on V1:** since V1 `>= 1.3.4` resolves `exports["./server"]` before package main (see the
  entrypoint-resolution note in the strategy section), the V1 loader receives the V2-only object and
  `readV1Plugin` throws `Plugin <spec> must default export an object with server()` (caught per-plugin;
  the plugin just fails to load). Do not copy this structure; the plan's `./server` pointing at the
  same dual `index.ts` avoids it.
- **Out-of-package adapter** — [oc-codex-multi-auth](https://github.com/ndycode/oc-codex-multi-auth)
  has the V2 CLI load its plugin through a V2 adapter installed separately (`npx --v2`). A
  bridge managed outside the package; not applicable to an npm-distributed auth plugin.

## Execution plan

1. **Spike: validate the credential pipeline**
   Minimal local plugin (`.opencode/plugins/`) against the V2 beta CLI registering a `berget`
   integration + provider with `integrationID`. Verify: (a) methods appear in `/connect`,
   (b) the access token reaches provider requests — **for the `key` method too** (V1 relied
   on the custom fetch for API-key Bearer injection as well), (c) `refresh` fires near expiry
   and the refreshed credential is persisted (source-verified: lazy, 5-minute skew,
   re-persisted — confirm end to end). Fallback if header injection is not automatic:
   `ctx.session.hook("model.request", (event) => { event.headers["Authorization"] = ... },
{ providerID: 'berget' })` — the official guide steers request-header injection to `model.request`
   and reserves `http.request`/`http.response` for plugins needing the native provider HTTP exchange
   ([migrate-v1 docs](https://opencode.ai/v2/docs/build/plugins/migrate-v1)); note that a hook that
   must cover **every** model request kind needs `context`, `compaction`, `generate`, and `title`
   registered separately (same source) — `opencode-claude-auth-v2` does exactly this in practice.
   `http.request` with the provider filter remains the second fallback if `model.request` proves
   insufficient. Also verify here, not just in
   step 7, that **the dual entrypoint loads under a real V1 binary at the support floor
   (1.3.4)**. With the lazy-`setup()` design no V2 SDK code executes under V1 by
   construction, so this is a smoke test of the _detection_ path (object-form default →
   `readV1Plugin` detect → `server()`) and of unchanged module execution — cheap
   insurance against a wrong assumption in this document, not a known hazard.

   Two additional spike items, both cheap on the same fixture:

   (d) **Legacy credential import E2E**: seed `auth.json` the way V1 persists it (OAuth
   shape, key `"berget"`), run the V2 beta CLI, confirm the credential is imported with
   `methodID: "oauth"` and appears as a connection on the `berget` integration, and that
   its access token reaches provider requests **without re-login** — and that `refresh`
   re-persists the imported (not just freshly created) credential near expiry.

   (e) **SDK-free install check**: build the package with `@opencode/plugin` present only
   in `devDependencies` and `src/v2/` importing it strictly type-only; install via the V2
   CLI from npm and confirm the plugin loads and registers (this is what keeps user
   installs at `qrcode`-only weight). If it fails because a genuine runtime SDK import is
   needed, that is the documented fallback trigger (see step 2).
2. **Add dependency + dual entrypoint**
   Add `@opencode/plugin` pinned exactly (`2.0.22`) as a **devDependency** — types only.
   The official guide requires a version compatible with the targeted OpenCode release;
   as a devDependency the pin constrains contributors, not user installs, and the
   ~180 MB regular-dependency tree (see "Dependency footprint on V1 users") never reaches
   users. All `src/v2/` imports of the SDK must be `import type`; `Plugin`-branded string
   types are constructed as plain strings (phantom brands). If step 1 spike item (e)
   shows a runtime SDK import is genuinely required, promote to an exact regular
   dependency instead — accepting and documenting the 180 MB install tax; do not ship a
   half-type-only package that breaks at load. Also promote `@opencode-ai/sdk` to an explicit dependency: `src/plugin.ts`,
   `src/plugin/types.ts` and `src/plugin/token.ts` import it today but only get it
   transitively via `@opencode-ai/plugin`. All of those imports are `import type`, so
   they are erased at transpile and hoisting changes cannot break runtime (the package
   ships raw `.ts` that OpenCode executes without typechecking) — this is typecheck
   hygiene, not a runtime fix. Rewrite `index.ts` to the dual object form with the lazy
   `setup()` from the strategy section. Keep `@opencode-ai/plugin` imports for the V1
   path, and keep all existing named exports (`BergetAuthPlugin`, `accessTokenExpired`,
   ...) — they are public API. Verify: `npm run typecheck`; existing V1 tests pass
   unchanged.
3. **Port integration registration** (`src/v2/integration.ts`)
   Transform registering all 3 methods (PKCE + device as `mode: 'auto'`, API key as `key`);
   set the display name via `editor.update('berget', (i) => { i.name = 'Berget AI' })`.
   Adapt `createPkceAuthorizeMethod` / `createDeviceAuthorizeMethod` to the V2 `authorize`
   signature, including the `Credential.OAuth` adapter (`methodID` — distinct per OAuth
   method, `type: 'oauth'`, integer `expires` in epoch ms, failures reject the promise)
   and the device flow's `expires_in` → `expiresAt` mapping; move the Keycloak refresh
   call from `refreshAccessTokenDirect` into `refresh`.

   Method ids are a compatibility decision, not a naming preference (see "Legacy
   credential migration" above): register the PKCE method with `id: "oauth"` — the value
   V2's legacy-import migration assigns to migrated `"berget"` credentials
   ([`20260805200742_import_legacy_credentials.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/database/migration/20260805200742_import_legacy_credentials.ts)
   on `beta`, fallback branch of `methodID()`) — and the device flow with `id: "device"`.
   Also note `Credential.OAuth.methodID` is a branded `Integration.MethodID` in the SDK
   types (`@opencode/schema@2.0.22`, `dist/credential.d.ts`); the adapter must echo the
   registered method's own id — a mismatch surfaces as `OAuth method not found` on the
   connect path (`integration.ts` on `beta`) or, worse, the silent no-refresh behavior on
   `connection.resolve`. Assert in unit tests that the id constants used in
   `editor.method.update` and written into returned credentials are the same constants. Verify: unit tests with mocked
   `ctx`; spike validation passes.
4. **Port provider/model registration** (`src/v2/provider.ts`)
   Fetch models in `setup`, capture them, `editor.add(...)` in a synchronous transform. Official
   guidance requires transforms to be "synchronous, cheap, and free of one-time side effects" — load
   external data before registration, capture it in the callback, and call the domain's `reload()`
   when that data changes ([migrate-v1
   docs](https://opencode.ai/v2/docs/build/plugins/migrate-v1)) — which is exactly why the model fetch
   lives in `setup` rather than inside the transform.
   Verify: `/api/model` lists Berget models; a real agent-loop request completes.
5. **Tests**
   Keep all flow tests (pkce / device / token / models); rewrite `plugin.test.ts` for the V2
   entrypoint; keep V1 `server()` covered. Verify: `npm test`, `npm run lint`,
   `npm run typecheck`.
6. **Docs**
   README + `docs/auth.md`: V2 config (`plugins`), new token-storage section (framework-owned
   credentials; plugin implements only `authorize`/`refresh`; refresh is lazy with a 5-minute
   expiry skew and the framework re-persists the result), V1 >= 1.3.4 requirement, and
   pin-`@1` guidance for users on older V1 CLIs (see the strategy section — older loaders
   reject the object-form default export: the plugin fails to load with a user-visible
   error event while the CLI keeps running; there is no implicit freeze, and
   `engines.opencode` cannot substitute for the pin guidance).

   Add a credential-transition section (see "Legacy credential migration" above):
   existing V1 logins are imported into V2's credential store automatically on first V2
   startup; logins made on V1 *after* that are not; on V2, refreshed tokens land only in
   V2's store, so downgrading back to `@1` after a long V2 session requires re-login if
   the `auth.json` token expired in the meantime.
7. **E2E matrix** (installed package, not workspace-linked)
   V1 1.3.4 (oldest supported — the object-form loader floor, source-verified; **this leg
   gates the floor**: if it fails, raise the documented floor to >= 1.18.29 per the
   official guide rather than debugging old loaders — see "Discrepancy with the official
   floor" above), V1 latest, V2 beta. All three login methods + a session
   running past token expiry. Plus a **transition leg**: log in on V1 latest, then run the
   V2 beta CLI with the installed package and complete an agent loop **without
   re-authenticating** (spike item (d), end to end) — and re-run after a V2-era refresh to
   confirm the downgrade story documented in step 6 matches reality. Follow the official
   [porting checklist](https://opencode.ai/v2/docs/build/plugins/migrate-v1#verify-a-ported-plugin).
8. **Release**
   Major bump to `2.0.0` via `publish.yml` (signals the V2 support window). Release
   notes must call out the V1 >= 1.3.4 floor and the `@bergetai/opencode-auth@1` pin
   for older V1 CLIs.

## Open questions (resolve during step 1 spike)

- QR rendering: the plugin embeds a QR in `instructions` (`qrcode` dep) — confirm it still
  renders acceptably in the V2 TUI.
- Confirm the `key`-method credential is attached to provider requests automatically
  (see the step 1 fallback if not). Likely mechanism, from source: `Provider.Editor.add`
  accepts a `sourceConnection: IntegrationConnection.Info` — the provider↔credential
  binding the request layer resolves
  ([`provider.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/provider.ts)
  on `beta`). If `Provider.Info.integrationID` alone is insufficient for the `key` method,
  threading the connection through `editor.add` is the next candidate.

Resolved during research (kept for the record):

- ~~Whether `readV1Plugin(..., 'server', 'detect')` cleanly prefers `server()` when both
  shapes are present~~ — yes, source-verified: detect mode inspects **only** `mod.default`;
  if it is a record containing `server` (or `id`), the loader returns it and calls
  `default.server(input, options)`; named exports are never consulted. Same code in
  [v1.3.4](https://github.com/sst/opencode/blob/v1.3.4/packages/opencode/src/plugin/shared.ts)
  and [v1.18.34](https://github.com/sst/opencode/blob/v1.18.34/packages/opencode/src/plugin/shared.ts).
  One constraint: the loader throws if the default object has _both_ `server` and `tui` —
  irrelevant here since TUI plugins are a non-goal.
- ~~How a brand-new integration is registered (`IntegrationEditor` has no `add`)~~ —
  `editor.method.update` upserts and creates it; set the display name separately
  (`packages/core/src/integration.ts` on `beta`).
- ~~Whether the framework auto-refreshes via `refresh` and re-persists~~ — yes: lazily on
  credential resolve, 5-minute expiry skew, result re-persisted (same source).
- ~~Exact provider `package` string~~ — `@opencode/ai/providers/openai-compatible`,
  confirmed by the official plugin-context example.
- ~~Whether V2 accepts the extra `server` key on the default export~~ — yes: V2
  schema-decodes `default` as `{ id, effect } | { id, setup }`
  ([`packages/core/src/plugin/module.ts`](https://github.com/sst/opencode/blob/beta/packages/core/src/plugin/module.ts)
  on `beta`) and effect Schema ignores excess properties by default; verified empirically
  against the exact shipped `effect@4.0.0-rc.112` (`{ id, setup, server }` decodes
  cleanly).
- ~~Whether `Plugin.define` does anything at runtime~~ — no, it is the identity function
  (`@opencode/plugin@2.0.22`, `dist/promise/plugin.js`), which is what makes the
  `import type` + local `define` + lazy `setup()` entrypoint possible.
- ~~Why the official guide says object entrypoints need V1 >= 1.18.29 while the code says
  1.3.4~~ — the 1.18.29 figure comes from a docs-only commit with no corresponding loader
  change; see "Discrepancy with the official floor" in the strategy section.
- ~~What happens to a user's existing V1 login when they move to the V2 CLI~~ — V2 imports
  the legacy `auth.json` one time into its credential store, with `methodID` derived from
  the auth.json key (`"berget"` → `"oauth"`); see "Legacy credential migration" above.
- ~~Does bun (the V1 1.3.x installer) auto-install the TUI peers~~ — no: bun treats
  `peerDependenciesMeta.optional` the same as npm ([bun install docs](https://bun.com/docs/cli/install#peer-dependencies)
  + empirical bun 1.3.14 test; 180 MB of regular deps install either way); see "Dependency
  footprint on V1 users".
- ~~Which installer does each supported CLI use for plugin dependencies~~ — 1.3.4–1.3.13:
  `bun add` ([v1.3.4 source](https://github.com/sst/opencode/blob/v1.3.4/packages/opencode/src/plugin/shared.ts);
  switch in [sst/opencode#18308](https://github.com/sst/opencode/pull/18308)); 1.3.14+ and
  V2: Arborist with `ignoreScripts: true`.
- ~~Exact `Provider.Info` fields for the port~~ — `integrationID` (optional),
  `activation: 'auto' | 'enabled' | 'disabled'` (required; `Info.empty()` defaults to
  `'auto'`), `package` (required) —
  [`packages/schema/src/provider.ts`](https://github.com/sst/opencode/blob/beta/packages/schema/src/provider.ts)
  on `beta`. The plan's `activation: 'enabled'` choice stands (V1 is always-on).

## Non-goals

- No V1 behavior changes (the V1 path moves behind `server()` as-is).
- No new auth methods or features — parity only.
- TUI/CLI plugins (`@opencode/plugin/tui`) are out of scope.
