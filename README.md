<h1 align="center">
  <img src="assets/icon.png" width="72" alt="DeepSeek Harness Desktop logo" />
  <br />
  DeepSeek Harness Desktop
</h1>

<p align="center">
  A minimal, local-first, cross-platform desktop shell for
  <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/krystal-cao/deepseek-harness-desktop/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/krystal-cao/deepseek-harness-desktop?style=flat-square&color=171513" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-171513.svg?style=flat-square" /></a>
  <a href="https://github.com/krystal-cao/deepseek-harness-desktop/actions/workflows/release.yml"><img alt="Release build" src="https://github.com/krystal-cao/deepseek-harness-desktop/actions/workflows/release.yml/badge.svg" /></a>
  <img alt="macOS" src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%7C%20Intel-171513.svg?style=flat-square" />
</p>

<img alt="DeepSeek Harness Desktop screenshot" src="assets/screenshot.png" />

DeepSeek Harness Desktop packages the official DeepSeek Harness Web experience as a standalone desktop application. It removes the need to start the CLI manually or manage local ports while preserving the full Harness interface.

This project focuses on desktop hosting. It does not fork, modify, inject into, or reimplement the Harness UI. Models, sessions, settings, plugins, and agent capabilities remain provided by the official `@deepseek-ai/dsh` package.

> [!IMPORTANT]
> This is an unofficial community wrapper and an early-stage project. It depends on the rapidly evolving `@deepseek-ai/dsh@0.1.0-rc.6`. The macOS builds are not Apple-notarized, and the Windows builds are not commercially code-signed.

## Download

| Platform | Architecture | Package | Download |
| --- | --- | --- | --- |
| macOS | Apple Silicon | DMG / ZIP | [Download](https://github.com/krystal-cao/deepseek-harness-desktop/releases/latest) |
| macOS | Intel | DMG / ZIP | [Download](https://github.com/krystal-cao/deepseek-harness-desktop/releases/latest) |

All current and historical packages are available on the [GitHub Releases page](https://github.com/krystal-cao/deepseek-harness-desktop/releases).

## Why this project exists

DeepSeek Harness already provides the complete agent runtime and Web UI. This project supplies the host capabilities required for a desktop product:

- Start and stop the local Harness service automatically
- Allocate a random `127.0.0.1` loopback port
- Wait for Harness readiness before displaying the window
- Provide a single-instance desktop window and safe external navigation
- Enable sandboxing, `contextIsolation`, and navigation restrictions
- Package installable macOS releases for Apple Silicon and Intel

## Features

- Opens the official Harness interface as soon as the local service is ready
- Shows a lightweight loading screen while the local Harness service starts
- Hides to the Dock when the window is closed on macOS (no tray icon)
- Preserves the complete settings, models, sessions, plugins, and agent experience
- Gracefully terminates the Harness child process on application exit
- Listens only on a random local loopback port
- Supports macOS on Apple Silicon and Intel
- Blends the macOS title bar with the active DSH light or dark theme and keeps
  the traffic lights on the sidebar even when it is collapsed
- Manages official `@deepseek-ai/dsh` versions at runtime: install, switch, and
  uninstall versions from the npm registry without rebuilding the app, keeping
  the pinned plugin family version-aligned with every installed dsh
- Can auto-follow the latest official RC: after startup it installs and
  switches to the newest `0.1.0-rc.*` from npm in the background (toggle in
  the dsh manager window)
- Manages out-of-tree plugins in the web profile (list / add / remove, backed
  by `dsh plugin --profile web`), restarting the dsh service automatically
- Ships a small desktop-host client plugin into the web profile: it reports
  plugin activation (readiness) and theme changes to the shell over a preload
  bridge, so the shell no longer depends on UI text/class sniffing — the old
  DOM/CSS heuristics remain only as a fallback

## Installation

### macOS

The macOS builds are integrity-signed but are not Apple-notarized. On first launch:

1. Open the DMG and drag **DeepSeek Harness** into **Applications**.
2. Try to open the app; if macOS blocks it, click **Done**.
3. Open **System Settings → Privacy & Security**.
4. Find DeepSeek Harness in the **Security** section and click **Open Anyway**.
5. Confirm by clicking **Open** once more.

This confirmation is normally required only once.

## Security model

- Harness binds only to `127.0.0.1` on a random port
- Node.js integration is disabled in the renderer
- `contextIsolation` and the Chromium sandbox are enabled
- New windows and cross-origin navigation open in the system browser
- Harness runs in a separate Electron Node child process
- The `--expose-internals` permission required by Cordis HMR is granted only to the Harness child process
- The desktop-host bridge plugin is auto-installed into the web profile from a
  bundled local path (no network), reports only readiness and theme events,
  and is marked as managed in the plugin list

## Runtime architecture

```text
DeepSeek Harness Desktop
├── Electron Main
│   ├── Single-instance window
│   ├── Harness child-process lifecycle
│   ├── Random loopback port and readiness checks
│   └── Platform menu and external-link handling
│
├── Harness Child Process
│   └── @deepseek-ai/dsh web
│       └── http://127.0.0.1:<random-port>
│
└── Sandboxed BrowserWindow
    └── DeepSeek Harness Web UI
```

## Validation status

| Platform | Packaging | Packaged startup | Web UI |
| --- | --- | --- | --- |
| macOS Apple Silicon | DMG / ZIP passed | Passed | HTTP 200 |
| macOS Intel | DMG / ZIP passed | Passed | HTTP 200 |

Every release package is built on a matching GitHub-hosted runner and runs a packaged-app smoke test before publication.

## Known limitations

- Upstream DSH is still an RC release and may change rapidly
- Apple Developer ID signing and notarization are not integrated
- Only macOS builds are provided (Apple Silicon and Intel)

## Updating

This fork ships whole-app auto-updates through `electron-updater`. An update
replaces the entire app, including the bundled `@deepseek-ai/dsh` runtime. For
faster upstream tracking, the built-in **DSH version manager** (Help → dsh
Version Manager…) can also install and switch to newer official
`@deepseek-ai/dsh` versions from npm without waiting for a new desktop build.

- The packaged app checks its feed 5 seconds after launch and every 4 hours;
  the **Help** menu also has **Check for Updates…**.
- The feed is baked into `app-update.yml` at build time. CI points it at this
  repository's GitHub Releases automatically; for local builds edit
  `build.publish.owner` / `build.publish.repo` in `package.json`.
- Runtime overrides: set `DSH_UPDATE_URL` to switch to a generic provider
  (useful for testing or a non-GitHub mirror), or `DSH_DISABLE_AUTO_UPDATE=1`
  to turn updates off. The npm registry defaults to the domestic mirror
  `registry.npmmirror.com` (used by the version catalog and runtime installs);
  set `DSH_NPM_REGISTRY` to switch, for example back to
  `https://registry.npmjs.org/`. You can also change it in the app:
  **Help → dsh Version Manager… → npm 镜像地址** (with common mirror presets).

### Release flow

1. `node scripts/check-upstream.mjs` — compare the pinned dsh version with npm.
2. `node scripts/bump-dsh.mjs 0.1.0-rc.x` — bump every `@deepseek-ai/dsh*` pin
   to the same version, reinstall and run the test suite.
3. `npm run dist:mac:all && npm run smoke:packaged` — verify the packaged app
   boots and serves HTTP 200 (builds Apple Silicon and Intel together).
4. `npm run clean:dist` — remove local build output so Spotlight/Finder never
   indexes a second copy of the app.
5. Bump `version` in `package.json`, push a `vX.Y.Z` tag. The Release workflow
   builds, smoke-tests, and publishes the DMG, ZIP and `latest-mac.yml` to
   GitHub Releases; installed apps then prompt the user to restart and update.

The daily `check-upstream.yml` workflow opens a bump pull request whenever
upstream publishes a new `0.1.0-rc.*` version on npm.

Note: macOS auto-update requires the app to be signed. These builds use ad-hoc
signing, which is sufficient for personal or small-group use; public
distribution should switch to Apple Developer ID signing plus notarization.

## Upstream version and license

The project currently pins `@deepseek-ai/dsh@0.1.0-rc.6` as the bundled default
for reproducible packaging. Additional official versions can be installed from
the DSH version manager at runtime.

The desktop wrapper is available under the [MIT License](LICENSE). The bundled DeepSeek Harness package is also MIT-licensed; its notice is preserved in [`third-party-licenses/deepseek-harness-LICENSE`](third-party-licenses/deepseek-harness-LICENSE).

This project is not affiliated with or endorsed by DeepSeek. DeepSeek Harness and related names belong to their respective owners. The application icon uses the black whale artwork from the upstream DeepSeek Harness Web favicon.
