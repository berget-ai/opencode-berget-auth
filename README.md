# Berget Auth Plugin for OpenCode

Authenticate [OpenCode](https://opencode.ai) with your [Berget AI](https://berget.ai) account.

Works with **OpenCode V2 and V1 from one package** (`@bergetai/opencode-auth` ≥ 1.2):

- **V2 (`@opencode/cli` ≥ 2.0)** — configure under `"plugins"`
- **V1 (`opencode-ai` ≥ 1.3.4)** — configure under `"plugin"`

## Quick Start

The recommended way to get started is with the [Berget CLI](https://www.npmjs.com/package/berget):

```bash
npm install -g berget
berget code init
opencode
# Type /connect → choose your auth method
```

### Manual setup

```jsonc
// OpenCode V2 — opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@bergetai/opencode-auth@latest"],
}
```

```jsonc
// OpenCode V1 — opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@bergetai/opencode-auth@latest"],
}
```

## Authentication Methods

### Berget Code Seat — Magic link

For team members with a Berget Code seat, on machines with a browser:

1. Run `/connect` in OpenCode
2. Select "Berget Code Seat - Login using this device"
3. The login page opens in your browser — token refresh is automatic

### Berget Code Seat — Login using other device with QR

For headless environments (SSH, CI, containers) where the browser cannot open on the same machine:

1. Run `/connect` in OpenCode
2. Select "Berget Code Seat - Login using other device with QR"
3. Scan the QR code with your phone, or open the link shown in the dialog — the sign-in code is already included in it
4. Approve the sign-in on the other device; OpenCode continues automatically

The sign-in is valid for 10 minutes. If it times out, just run `/connect` again.

### API Key

For API key users:

1. Run `/connect` in OpenCode
2. Select "Berget API Key - Enter API key manually"
3. Paste your key — persisted across sessions

## Version Compatibility

| OpenCode CLI          | Plugin version                      | Config key |
| --------------------- | ----------------------------------- | ---------- |
| `@opencode/cli` (V2)  | `@bergetai/opencode-auth` 1.2.x     | `plugins`  |
| `opencode-ai` ≥ 1.3.4 | `@bergetai/opencode-auth` 1.2.x     | `plugin`   |
| `opencode-ai` < 1.3.4 | pin `@bergetai/opencode-auth@1.1.1` | `plugin`   |

OpenCode V1 CLIs older than 1.3.4 cannot load object-form default exports; on those
versions the plugin fails to load with a visible error. Pin the exact version
`@bergetai/opencode-auth@1.1.1` to keep using it on older V1 releases — the `@1`
dist-tag now resolves to the 1.2.x line, which requires V1 ≥ 1.3.4.

### Coming from OpenCode V1 on V2?

Your V1 login carries over: on startup the plugin imports the `berget` credential from
V1's `auth.json` into V2's credential store when OpenCode exposes the import surface
(V2 2.0.22 does not yet — see [docs/auth.md](docs/auth.md); until then, log in once via
`/connect`). Once imported, token refresh is handled by the framework; refreshes made
while on V2 are not written back to V1's store, so a long V2 session may require one
re-login if you later downgrade to 1.1.x.

## How It Works

- **PKCE Authorization Flow** for browser login (magic link)
- **Device Authorization Grant** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) for QR / device code login on headless machines
- **Automatic token refresh** — V1 uses a custom fetch; V2 delegates to the framework's credential store (see [docs/auth.md](docs/auth.md))
- **Models fetched dynamically** from Berget API — no manual config needed

## License

MIT
