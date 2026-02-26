# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Cursor Cloud specific instructions

### Overview

VS Code (Code - OSS) is an Electron-based desktop editor. The primary development target is the **desktop Electron app** launched via `scripts/code.sh`. Node.js 22.22.0 is required (see `.nvmrc`). The package manager is **npm** (yarn is explicitly rejected by the preinstall hook).

### System dependencies (Linux)

The following system packages must be installed before `npm ci`:
`build-essential pkg-config libx11-dev libx11-xcb-dev libxkbfile-dev libsecret-1-dev libkrb5-dev libgtk-3-0 libgbm1 xvfb libnotify-bin rpm`

### Key commands

| Task | Command |
|---|---|
| Install deps | `npm ci` (triggers postinstall across ~40 subdirs) |
| Download Electron | `npm run electron` |
| Compile (one-off) | `npm run compile` |
| Watch (incremental) | `npm run watch` |
| Download built-in extensions | `npm run download-builtin-extensions` |
| Launch Electron app | `bash scripts/code.sh` (runs preLaunch automatically) |
| ESLint | `npm run eslint` |
| Hygiene | `npm run hygiene` |
| Unit tests (Node) | `npm run test-node` |
| Unit tests (Electron) | `bash scripts/test.sh` (needs `DISPLAY`) |
| Integration tests | `bash scripts/test-integration.sh` (needs `DISPLAY`) |
| Layer check | `npm run valid-layers-check` |

### Running the Electron app in headless environments

- Start Xvfb first: `Xvfb :10 -screen 0 1024x768x24 &` or use the init script at `build/azure-pipelines/linux/xvfb.init`.
- Set `export DISPLAY=:10` (or whichever display the agent's screen is on).
- In Docker containers, pass `--disable-dev-shm-usage --no-sandbox` flags to the Electron binary.
- dbus errors in container logs are cosmetic and do not affect functionality.
- The NLS messages file warning (`Error reading NLS messages file ... nls.messages.json`) is expected in dev builds and harmless.

### Gotchas

- `npm run compile` takes ~2 minutes on first run. Prefer `npm run watch` for incremental development.
- The `hygiene` gulp task may fail on pre-existing copyright issues in generated files (e.g. `extensions/mermaid-chat-features/chat-webview-out/codicon.css`); this is not caused by your changes.
- The `.npmrc` targets Electron 39.6.1 headers for native module compilation. Do not change `target` or `runtime` unless upgrading Electron.
- `scripts/code.sh` calls `build/lib/preLaunch.ts` which ensures deps, Electron, compilation, and built-in extensions are all ready. Set `VSCODE_SKIP_PRELAUNCH=1` to skip if you've already run these steps.
