# Berget Auth Plugin for OpenCode

Authenticate [OpenCode](https://opencode.ai) with your [Berget AI](https://berget.ai) account.

## Quick Start

The recommended way to get started is with the [Berget CLI](https://www.npmjs.com/package/berget):

```bash
npm install -g berget
berget code init
opencode
# Type /connect → choose your auth method
```

## Authentication Methods

### Berget Code (SSO)

For team members with a Berget Code seat:

1. Run `/connect` in OpenCode
2. Select "Login with Berget"
3. Authenticate in browser — token refresh is automatic

### API Key

For API key users:

1. Run `/connect` in OpenCode
2. Select "Enter Berget API Key manually"
3. Paste your key — persisted across sessions

## How It Works

- **Device Authorization Flow** for SSO login (works in SSH/headless too)
- **Automatic token refresh** via custom fetch — sessions stay alive indefinitely
- **Models fetched dynamically** from Berget API — no manual config needed

## License

MIT
