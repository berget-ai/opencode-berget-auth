# Local Development Setup

This guide gets you running the plugin locally inside OpenCode in under 2 minutes.

## Prerequisites

- **Node.js 22+** and **npm 10+**
- **OpenCode CLI** installed globally: `npm install -g opencode`
- A test project directory where you want to run OpenCode

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (optional but recommended)

```bash
cp .env.example .env.local
```

Edit `.env.local` to point at the environment you want to test against:

```env
# Use staging environment for safe testing
BERGET_API_URL=https://api.stage.berget.ai
BERGET_INFERENCE_URL=https://api.stage.berget.ai/v1

# Enable plugin debug logging
DEBUG_BERGET_AUTH=1
```

**Default behavior:** If you skip this step, the plugin uses production URLs (`https://api.berget.ai`). The `BERGET_API_URL` env var is read at runtime by `src/constants.ts`.

### 3. Link Plugin into a Test Project

From this repo:

```bash
npm run dev:link /path/to/your/test-project
```

Or if you want to test in the current directory:

```bash
npm run dev:link
```

This creates a symlink: `.opencode/plugins/berget-auth-dev -> $(pwd)`

### 4. Run OpenCode

```bash
npm run dev:opencode /path/to/your/test-project
```

Or, if you already have `.env.local` loaded in your shell:

```bash
cd /path/to/your/test-project && opencode
```

### 5. Verify It Works

1. Start OpenCode in your test project
2. Type `/connect`
3. You should see **"Login with Berget"** and **"Enter Berget API Key manually"**
4. Choose an auth method and authenticate
5. Check that Berget models appear in the model picker

## Workflow During Development

```bash
# 1. Make your code changes in src/

# 2. Run quality checks
npm run typecheck   # TypeScript
npm test            # Unit tests
npm run lint        # ESLint

# 3. No rebuild step needed — OpenCode loads TypeScript directly via Bun!
# 4. Just restart OpenCode to pick up changes
```

## Environment Variables Reference

| Variable               | Description                                  | Default                    |
| ---------------------- | -------------------------------------------- | -------------------------- |
| `BERGET_API_URL`       | Base URL for Berget API & Keycloak discovery | `https://api.berget.ai`    |
| `BERGET_INFERENCE_URL` | URL for chat completions endpoint            | `https://api.berget.ai/v1` |
| `DEBUG_BERGET_AUTH`    | Enable verbose plugin logging                | `0`                        |
| `OPENCODE_HEADLESS`    | Run without browser (for CI)                 | `0`                        |

## Architecture Notes

- **OpenCode loads plugins as TypeScript directly** — no build/bundle step required during development.
- **The symlink (`berget-auth-dev`) is the plugin name** — OpenCode picks it up automatically from `.opencode/plugins/`.
- **Auth state is persisted** by OpenCode in the system keychain or secure storage, so after login you stay logged in across restarts.
- **Token refresh happens per-request** via the custom `fetch` returned by the `loader` hook — you don't need to manually refresh tokens.

## Troubleshooting

### "Plugin not showing up in /connect"

- Make sure the symlink exists: `ls -la .opencode/plugins/`
- Check OpenCode logs: run with `DEBUG=opencode:* opencode`
- Verify the symlink points to the repo root (where `index.ts` lives)

### "Token refresh fails"

- Check `BERGET_API_URL` points at a working environment.
- If using staging, ensure you have a valid stage account.
- Look for `logDebug` / `logError` output in OpenCode logs.

### "Changes not picked up"

- OpenCode caches plugins. Restart OpenCode after making changes.
- No rebuild step is needed — TypeScript is loaded directly.

## See Also

- [README.md](./README.md) — User-facing quick start
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Full contributor guide with testing & publishing
- [docs/auth.md](./docs/auth.md) — Internal auth architecture documentation
