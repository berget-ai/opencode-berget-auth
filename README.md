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

### Berget Code Seat — Magic link

For team members with a Berget Code seat, on machines with a browser:

1. Run `/connect` in OpenCode
2. Select "Berget Code Seat - Magic link"
3. The login page opens in your browser — token refresh is automatic

### Berget Code Seat — QR or device code

For headless environments (SSH, CI, containers) where the browser cannot open on the same machine:

1. Run `/connect` in OpenCode
2. Select "Berget Code Seat - QR or device code"
3. Scan the QR code with your phone, or open the link shown in the dialog — the sign-in code is already included in it
4. Approve the sign-in on the other device; OpenCode continues automatically

The sign-in is valid for 10 minutes. If it times out, just run `/connect` again.

### API Key

For API key users:

1. Run `/connect` in OpenCode
2. Select "Use Berget AI API key"
3. Paste your key — persisted across sessions

## How It Works

- **PKCE Authorization Flow** for browser login (magic link)
- **Device Authorization Grant** ([RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)) for QR / device code login on headless machines
- **Automatic token refresh** via custom fetch — sessions stay alive indefinitely
- **Models fetched dynamically** from Berget API — no manual config needed

## License

MIT
