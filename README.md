# Berget Auth Plugin for OpenCode

[![License](https://img.shields.io/npm/l/opencode-berget-auth)](LICENSE)

Authenticate [OpenCode](https://opencode.ai) with your [Berget AI](https://berget.ai) account to access AI models through Berget's European AI infrastructure.

## Features

- **Device Authorization Flow** - Secure OAuth 2.0 authentication via browser
- **Automatic Token Refresh** - Seamless token management
- **European AI Infrastructure** - GDPR-compliant AI hosting in Sweden
- **Multiple Model Support** - Access to Claude, GPT-4, Gemini, Mistral, DeepSeek, and more

## Installation

Add the plugin to your OpenCode configuration file (`~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-berget-auth@latest"]
}
```

## Usage

### Login

1. Run the authentication command:
   ```bash
   opencode auth login
   ```

2. Select **Berget** from the provider list

3. Complete authentication in your browser
   - A browser window will open automatically
   - Sign in with your Berget account
   - The CLI will automatically detect successful authentication

### Using Models

Once authenticated, you can use any model available on Berget:

```bash
# Use Claude Sonnet
opencode --model anthropic/claude-sonnet-4-20250514

# Use GPT-4o
opencode --model openai/gpt-4o

# Use Gemini
opencode --model google/gemini-2.5-pro-preview-06-05
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BERGET_API_URL` | Berget API base URL | `https://api.berget.ai` |
| `BERGET_INFERENCE_URL` | Berget inference endpoint | `https://api.berget.ai/v1` |
| `OPENCODE_BERGET_DEBUG` | Enable debug logging | `false` |

### Provider Configuration

You can customize the Berget provider in your `opencode.json`:

```json
{
  "provider": {
    "berget": {
      "api": "https://api.berget.ai/v1",
      "models": {
        "anthropic/claude-sonnet-4-20250514": {},
        "anthropic/claude-opus-4-20250514": {},
        "openai/gpt-4o": {},
        "openai/gpt-4o-mini": {},
        "google/gemini-2.5-pro-preview-06-05": {},
        "mistral/mistral-large-latest": {},
        "deepseek/deepseek-chat": {},
        "deepseek/deepseek-reasoner": {}
      }
    }
  }
}
```

## Available Models

Berget provides access to a variety of AI models:

| Provider | Model | Description |
|----------|-------|-------------|
| Anthropic | claude-sonnet-4-20250514 | Claude Sonnet 4 |
| Anthropic | claude-opus-4-20250514 | Claude Opus 4 |
| OpenAI | gpt-4o | GPT-4 Omni |
| OpenAI | gpt-4o-mini | GPT-4 Omni Mini |
| Google | gemini-2.5-pro-preview-06-05 | Gemini 2.5 Pro |
| Google | gemini-2.5-flash-preview-05-20 | Gemini 2.5 Flash |
| Mistral | mistral-large-latest | Mistral Large |
| DeepSeek | deepseek-chat | DeepSeek Chat |
| DeepSeek | deepseek-reasoner | DeepSeek Reasoner |

## Authentication Flow

This plugin uses the [Device Authorization Flow](https://datatracker.ietf.org/doc/html/rfc8628) (OAuth 2.0 Device Authorization Grant):

1. CLI requests a device code from Berget API
2. User is shown a verification URL and code
3. User authenticates in browser
4. CLI polls for token completion
5. Access and refresh tokens are stored securely
6. Tokens are automatically refreshed when needed

## Troubleshooting

### Debug Mode

Enable debug logging to see detailed information:

```bash
OPENCODE_BERGET_DEBUG=1 opencode
```

### Token Refresh Issues

If you encounter authentication errors, try logging out and back in:

```bash
# Clear existing auth
opencode auth logout

# Re-authenticate
opencode auth login
```

### Headless Environments

In SSH or CI environments, the plugin will display the verification URL for manual browser access:

```
Open the URL above in your browser and enter code: XXXX-XXXX
Then paste the authorization code here when complete.
```

## Development

To develop on this plugin locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/berget-cloud/opencode-berget-auth.git
   cd opencode-berget-auth
   bun install
   ```

2. Link to your OpenCode config:
   ```json
   {
     "plugin": ["file:///path/to/opencode-berget-auth"]
   }
   ```

3. Run type checking:
   ```bash
   bun run typecheck
   ```

## License

MIT

## About Berget AI

[Berget AI](https://berget.ai) provides European AI infrastructure, offering:

- **GDPR Compliance** - Data stays in Europe
- **Sustainable Hosting** - Powered by renewable energy in Sweden
- **Multi-Model Access** - One API for all major AI providers
- **Enterprise Ready** - SOC 2 Type II certified

Learn more at [berget.ai](https://berget.ai)
