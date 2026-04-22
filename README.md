# iExpo

A minimal [Expo](https://expo.dev)-like development tool built from scratch. Write React Native apps with just TypeScript — no Xcode knowledge needed.

## What it does

- **File-system routing** — add a file to `pages/`, it becomes a route
- **Hot reload** — edit, save, see changes instantly on iOS Simulator
- **TypeScript** — zero configuration
- **OTA updates** — push JS updates without App Store re-submission
- **Rust CLI** — fast project setup, build, and publish

## Architecture

```
iExpo/
├── cli/          ← Rust CLI (iex init / run / build / publish)
├── runtime/
│   ├── shell/    ← Pre-built React Native iOS app (Hermes + Metro)
│   └── build/    ← Cached compiled .app (gitignored)
├── bundled/      ← Rust OTA bundle server
└── apps/         ← User projects
    └── myapp/
        └── pages/
            ├── index.tsx      → /
            ├── about.tsx      → /about
            └── settings.tsx   → /settings
```

## How it works

1. `runtime/shell/` is a full React Native iOS project with Hermes engine
2. `iex run` configures Metro to read your source files directly from `apps/myapp/`
3. Metro bundles your TypeScript and serves it to the shell app via HTTP
4. The shell app (iExpoShell) loads the JS bundle and renders native iOS components
5. File changes trigger Metro hot reload — no recompilation needed

## Getting started

### Prerequisites

- macOS with Xcode installed
- Node.js 18+
- Rust (for building CLI)
- CocoaPods (`brew install cocoapods`)

### Build the CLI

```bash
cd cli && cargo build --release
```

### Create and run a project

```bash
# Create a new project
./cli/target/release/iex init myapp

# Start development
cd apps/myapp
../../cli/target/release/iex run
```

First run takes a few minutes (compiles the iOS shell). After that, starts in seconds.

### Commands

| Command | Description |
|---------|-------------|
| `iex init <name>` | Create a new TypeScript project |
| `iex run` | Build shell + install + start Metro dev server |
| `iex run --no-build` | Start Metro only (shell already installed) |
| `iex build --sim` | Bundle JS + compile Release .app for Simulator |
| `iex build` | Bundle JS + compile Release .app for device |
| `iex publish` | Bundle JS + push OTA update to bundle server |

### OTA updates

```bash
# Start the bundle server
./bundled/target/release/bundled

# Publish an update
cd apps/myapp
../../cli/target/release/iex publish --note "fix bug"
```

Release builds check for OTA updates on launch and download in the background.

## Key concepts

| Concept | Our implementation | Expo equivalent |
|---------|-------------------|-----------------|
| Shell app | `runtime/shell/` | Expo Go |
| CLI | `cli/` (Rust) | expo-cli |
| Dev server | Metro (via react-native) | Metro (via expo) |
| Routing | File-system (`pages/`) | expo-router |
| OTA updates | `bundled/` server | EAS Update |
| Build | `iex build` | EAS Build |

## License

MIT
