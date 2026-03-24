# Berget Auth Plugin for OpenCode

Authenticate [OpenCode](https://opencode.ai) with your [Berget AI](https://berget.ai) account.

## Quick Start

The recommended way to get started is with the [Berget CLI](https://www.npmjs.com/package/berget):

```bash
npm install -g berget
berget code init
opencode
```

This creates an `opencode.json` with the plugin pre-configured. Then run `/connect` in OpenCode to authenticate.

## Authentication Methods

### Berget Code (SSO)

For team members with a Berget Code seat:

1. Run `/connect` in OpenCode
2. Select "Login with Berget"
3. Authenticate in browser — token refresh is automatic

### API Key

For API key users, set `BERGET_API_KEY` in your environment:

```bash
export BERGET_API_KEY=sk_ber_...
opencode
```

The plugin picks up the key automatically — no `/connect` needed.

Alternatively, run `/connect` and select "Enter Berget API Key manually".

## How It Works

- **Device Authorization Flow** for SSO login (works in SSH/headless too)
- **Automatic token refresh** via custom fetch — sessions stay alive indefinitely
- **Models fetched dynamically** from Berget API — no manual config needed
- **API key fallback** from `BERGET_API_KEY` environment variable

## License

MIT
