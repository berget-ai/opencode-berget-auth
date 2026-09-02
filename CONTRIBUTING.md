# Contributing to Berget Auth Plugin for OpenCode

Thank you for your interest in contributing! This document covers everything you need to develop, test, and publish changes to the plugin.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing Locally with OpenCode](#testing-locally-with-opencode)
- [Running Tests](#running-tests)
- [Code Quality](#code-quality)
- [Submitting Changes](#submitting-changes)
- [Publishing](#publishing)

---

## Prerequisites

- **Node.js 22+** (managed via `.nvmrc` or your preferred version manager)
- **npm 10+**
- **OpenCode CLI** installed globally (`npm install -g opencode`)
- (Optional) **Bun** — OpenCode uses Bun internally to load plugins, but this project uses npm for development

## Getting Started

```bash
# Clone the repository
git clone https://github.com/berget-ai/opencode-berget-auth.git
cd opencode-berget-auth

# Install dependencies
npm install

# Verify everything works
npm run typecheck
npm test
```

## Project Structure

```
.
├── index.ts                  # Main entrypoint — exports the plugin
├── src/
│   ├── plugin.ts             # Core plugin logic (auth provider registration)
│   ├── constants.ts          # Berget API URLs, provider IDs, env vars
│   └── plugin/
│       ├── auth.ts           # OAuth/API key detection and helpers
│       ├── pkce-flow.ts      # PKCE authorization (browser-based login)
│       ├── token.ts          # Token refresh logic
│       ├── models.ts         # Dynamic model fetching from Berget API
│       ├── debug.ts          # Structured logging utilities
│       └── types.ts          # TypeScript interfaces
├── src/plugin/*.test.ts      # Unit tests (co-located with source)
├── docs/
│   └── auth.md               # Internal auth architecture docs
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.js
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feat/your-feature-name
# or
git checkout -b fix/your-bug-description
```

### 2. Make Your Changes

All source files are in `src/` and `index.ts`. The plugin is written in **TypeScript** with **ES modules** and targets ES2022.

Key conventions:

- Use explicit types — avoid `any`
- Prefer `async/await` over raw Promises
- Log via `logDebug()` / `logError()` from `src/plugin/debug.ts` instead of `console.log`
- Keep hooks small and focused; the plugin returns an object of event handlers

### 3. Test Your Changes Locally

See [Testing Locally with OpenCode](#testing-locally-with-opencode) below for the full workflow.

### 4. Run the Quality Checks

```bash
# Type check (no emission)
npm run typecheck

# Run tests
npm test

# Lint
npm run lint

# Format
npm run format:check
npm run format   # auto-fix if needed
```

Pre-commit hooks (via Husky) will run linting and formatting automatically on staged files.

## Testing Locally with OpenCode

The fastest way to verify your changes is to load the plugin **locally** into OpenCode instead of installing from npm.

### Option A: Symlink into `.opencode/plugins/` (Recommended)

From the **project directory** where you run OpenCode:

```bash
# Create the local plugins directory if it doesn't exist
mkdir -p .opencode/plugins

# Symlink the plugin source
ln -s /absolute/path/to/opencode-berget-auth .opencode/plugins/berget-auth-dev
```

> **Note:** Use the **absolute path** to the repo root. OpenCode resolves symlinks relative to the project directory.

Then run OpenCode:

```bash
opencode
```

The plugin will be loaded automatically from `.opencode/plugins/berget-auth-dev`.

### Option B: Copy Files

If symlinks cause issues (some environments don't follow them well):

```bash
mkdir -p .opencode/plugins/berget-auth-dev
cp -r /path/to/opencode-berget-auth/* .opencode/plugins/berget-auth-dev/
```

Remember to re-copy after every change.

### Option C: Global Plugin Directory

You can also test globally (applies to all OpenCode sessions):

```bash
mkdir -p ~/.config/opencode/plugins
ln -s /absolute/path/to/opencode-berget-auth ~/.config/opencode/plugins/berget-auth-dev
```

### Verifying the Plugin Loaded

1. Run `opencode` in your test project
2. Type `/connect`
3. You should see **"Log in with Berget AI (requires a Berget Code seat)"** as an auth option
4. Check logs — the plugin calls `logDebug('Initializing Berget Auth Plugin')` on startup

### Testing Auth Flows

| Flow               | How to Test                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **OAuth / SSO**    | `/connect` → "Log in with Berget AI (requires a Berget Code seat)" → browser opens → complete login     |
| **API Key**        | `/connect` → "Use a Berget AI API key" → paste a key                                                    |
| **Token Refresh**  | Start a session, wait for token expiry (or temporarily shorten expiry in code), then send a new message |
| **Model Fetching** | After auth, check that Berget models appear in model picker                                             |

### Debugging

Enable debug logging in OpenCode to see plugin output:

```bash
DEBUG=opencode:* opencode
```

Or use the OpenCode SDK client logging (the plugin uses `client.app.log()` for structured logs).

## Running Tests

We use **Vitest** for unit testing.

```bash
# Run all tests once (CI mode)
npm test

# Run tests in watch mode during development
npm run test:watch

# Run with coverage
npx vitest run --coverage
```

### Writing Tests

- Test files live next to source files: `src/plugin/<module>.test.ts`
- Mock external API calls (Berget API, Keycloak) — never hit real services in unit tests
- Use `vi.fn()` for spies and mocks
- Keep tests deterministic and fast

Example:

```ts
import { describe, expect, it, vi } from 'vitest';
import { accessTokenExpired } from './auth';

describe('accessTokenExpired', () => {
  it('returns true for an expired token', () => {
    const expired = { expires_at: Date.now() / 1000 - 100 };
    expect(accessTokenExpired(expired as any)).toBe(true);
  });
});
```

## Code Quality

All code is checked automatically on commit and in CI.

| Command                | Purpose                            |
| ---------------------- | ---------------------------------- |
| `npm run typecheck`    | TypeScript type checking (no emit) |
| `npm run lint`         | ESLint check                       |
| `npm run lint:fix`     | ESLint auto-fix                    |
| `npm run format:check` | Prettier check                     |
| `npm run format`       | Prettier auto-fix                  |

### Pre-commit Hook

Husky + lint-staged run automatically on `git commit`:

- `.ts` / `.tsx` files → ESLint --fix + Prettier --write
- `.json` / `.md` / `.yml` files → Prettier --write

## Submitting Changes

1. **Open an issue first** for significant changes or new features — we can discuss design before you invest time.
2. **Write clear commits** — we don't enforce a strict convention, but please describe _what_ and _why_.
3. **Ensure CI passes** — the PR must pass `typecheck` (tests are run locally; CI currently runs typecheck only).
4. **Update docs** — if you change user-facing behavior, update `README.md` or this file.
5. **Open a Pull Request** against the `main` branch with a clear description.

## Publishing

> ⚠️ Only maintainers with NPM publish access should run this.

Releases are handled via **GitHub Actions** (`.github/workflows/publish.yml`):

1. Go to **Actions → Publish to NPM**
2. Click **Run workflow**
3. Select version bump: `patch`, `minor`, or `major`
4. The workflow will:
   - Run typecheck
   - Bump the version in `package.json`
   - Create a git tag
   - Publish to NPM as `@bergetai/opencode-auth`

Do **not** publish manually from your local machine.

---

## Need Help?

- **OpenCode Plugin Docs:** <https://opencode.ai/docs/plugins>
- **OpenCode SDK Docs:** <https://opencode.ai/docs/sdk>
- **Discord:** <https://opencode.ai/discord>
- **Issues:** <https://github.com/berget-ai/opencode-berget-auth/issues>

Happy coding! 🚀
