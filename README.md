# Berget Auth Plugin for OpenCode

Authenticate [OpenCode](https://opencode.ai) with your [Berget AI](https://berget.ai) account.

## Quick Start

```bash
# 1. Set up plugin
echo '{"$schema":"https://opencode.ai/config.json","plugin":["@bergetai/opencode-auth"]}' > opencode.json

# 2. Start OpenCode and connect
opencode
# Type /connect → select Berget → authenticate in browser

# 3. Done. Models are auto-discovered, token refresh is automatic.
```

## How It Works

- **Device Authorization Flow** for login (works in SSH/headless too)
- **Automatic token refresh** via custom fetch -- sessions stay alive indefinitely
- **Models fetched dynamically** from Berget API -- no manual config needed

## Development

```bash
# Test locally against a different directory (outside any existing opencode.json tree)
mkdir /tmp/test-plugin
echo '{"$schema":"https://opencode.ai/config.json","plugin":["file:///path/to/opencode-berget-auth"]}' > /tmp/test-plugin/opencode.json
cd /tmp/test-plugin && opencode
```

## License

MIT
