# Contributing to @bergetai/opencode-auth

Thank you for your interest in contributing! This document will help you get started with local development.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm (comes with Node.js)
- Git

## Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/berget-ai/opencode-berget-auth.git
   cd opencode-berget-auth
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

   This will also set up [Husky](https://typicode.github.io/husky/) pre-commit hooks via the `prepare` script.

## Development Workflow

### Available Scripts

| Script                 | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run typecheck`    | Run TypeScript type checking (no emit)   |
| `npm run lint`         | Run ESLint on TypeScript files           |
| `npm run lint:fix`     | Run ESLint with auto-fix                 |
| `npm run format`       | Format all files with Prettier           |
| `npm run format:check` | Check formatting without modifying files |

### Before Committing

Run the following to ensure your changes pass all checks:

```bash
npm run typecheck
npm run lint
npm run format:check
```

The pre-commit hook will automatically run `eslint --fix` and `prettier --write` on staged files.

## Code Style

- **TypeScript**: Strict mode enabled (`strict: true` in `tsconfig.json`)
- **Quotes**: Double quotes
- **Semicolons**: Required
- **Trailing commas**: ES5 compatible
- **Print width**: 100 characters
- **Tab width**: 2 spaces

See `.prettierrc.json` and `eslint.config.js` for full configuration.

## Testing the Plugin Locally with OpenCode

### Method 1: Local Plugin Directory (Recommended for Development)

The fastest way to test changes is to place the plugin files directly in your OpenCode plugin directory. OpenCode loads TypeScript plugins automatically at startup.

1. **Create the local plugin directory** in your project:

   ```bash
   mkdir -p .opencode/plugins
   ```

2. **Copy or symlink the plugin files**:

   ```bash
   # Option A: Copy files
   cp -r /path/to/opencode-berget-auth/* .opencode/plugins/berget-auth/

   # Option B: Symlink for live editing (recommended)
   ln -s /path/to/opencode-berget-auth .opencode/plugins/berget-auth
   ```

3. **Create `.opencode/package.json`** with the plugin's dependencies:

   ```json
   {
     "dependencies": {
       "@opencode-ai/plugin": "1.3.13"
     }
   }
   ```

4. **Restart OpenCode** to load the plugin.

5. **Run `/connect`** in OpenCode and select your authentication method.

### Method 2: npm Link (Testing as npm Package)

Test the plugin as it would be installed from npm:

1. **Link the local package**:

   ```bash
   cd /path/to/opencode-berget-auth
   npm link
   ```

2. **Reference it in your `opencode.json`**:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "plugin": ["@bergetai/opencode-auth"]
   }
   ```

3. **OpenCode will use the linked local version** when it installs plugins at startup.

### Testing Against Stage vs Production

Use environment variables to point the plugin to different environments:

#### Stage Environment

```bash
BERGET_API_URL=https://api.stage.berget.ai opencode
```

The plugin automatically derives the Keycloak URL from the API URL, so stage authentication will use `https://keycloak.stage.berget.ai`.

#### Production Environment (Default)

```bash
opencode
```

No environment variables needed. The plugin defaults to:

- API URL: `https://api.berget.ai`
- Inference URL: `https://api.berget.ai/v1`
- Keycloak: `https://keycloak.berget.ai`

#### Custom Environment Variables

| Variable               | Default                    | Description            |
| ---------------------- | -------------------------- | ---------------------- |
| `BERGET_API_URL`       | `https://api.berget.ai`    | Base API URL           |
| `BERGET_INFERENCE_URL` | `https://api.berget.ai/v1` | Inference API endpoint |

## Architecture

This plugin is a **TypeScript ESM module** with no build step. OpenCode loads the source files directly.

```
index.ts          # Entry point — exports BergetAuthPlugin
src/
├── plugin.ts     # Main plugin orchestrator
├── constants.ts  # Environment-aware URLs & config
└── plugin/
    ├── auth.ts      # Auth state helpers
    ├── debug.ts     # Debug logging
    ├── models.ts    # Dynamic model fetching
    ├── pkce-flow.ts # PKCE OAuth implementation
    ├── token.ts     # Token refresh logic
    └── types.ts     # TypeScript interfaces
```

### Key Behaviors

- **No build step**: `tsc --noEmit` is used for type checking only
- **Dynamic model fetching**: Models are fetched from the Berget API at plugin load time
- **Automatic token refresh**: The custom fetch handler refreshes OAuth tokens before expiry
- **Dual auth support**: Supports both OAuth (PKCE) and API key authentication

## Release Process

Releases are handled automatically by GitHub Actions:

1. Go to the **Actions** tab in GitHub
2. Run the **"Publish to NPM"** workflow manually
3. Select the version bump type: `patch`, `minor`, or `major`
4. The workflow will:
   - Run type checking
   - Bump the version in `package.json`
   - Create a git tag
   - Publish to npm

## Questions?

- Open an [issue](https://github.com/berget-ai/opencode-berget-auth/issues) on GitHub
- See the [OpenCode Plugins documentation](https://opencode.ai/docs/plugins) for general plugin development info
