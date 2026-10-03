# Release notes — 1.2.0 (draft)

OpenCode V2 support ships in the same package; nothing to reconfigure if you are on V1.

## Highlights

- **OpenCode V2 support.** The plugin registers auth methods through V2's plugin API
  (`/connect` shows the same three methods), delegates token storage and refresh to
  V2's framework, and binds the Berget provider to the connected credential.
- **One package, both majors.** The default export is the officially recommended dual
  shape: V2 reads `id` + `setup()`, V1 (>= 1.3.4) calls `server()`. No V2 SDK code
  executes under V1, and user installs stay `qrcode`-weight.
- **Live model catalog** still fills in models the models.dev listing does not know
  yet, alongside the native V2 provider support for Berget.

## Compatibility notes

- **V1 floor is now 1.3.4+** for `@bergetai/opencode-auth` 1.2.x (older loaders cannot
  load object-form default exports; the plugin fails to load there). If you are on an
  older V1 release, pin the exact version `@bergetai/opencode-auth@1.1.1` — the `@1`
  dist-tag now resolves to 1.2.x.
- **V1 config key is still `plugin`; V2 uses `plugins`.** Update your `opencode.json`
  when switching CLIs.
- **Existing V1 logins**: the plugin imports the V1 `auth.json` credential one time
  when OpenCode exposes the plugin credential API. As of `@opencode/cli@2.0.22` it
  does not, so V2 users log in once via `/connect`. The import activates automatically
  on future CLI builds that expose it (verified working end to end against the
  credential store).
- On V2, token refresh is framework-owned: credentials persist in the V2 store, and
  refreshes are not written back to V1's `auth.json`. Downgrading to 1.1.x after a
  long V2 session may require one re-login.
