# iExpo

A personal App Store for React Native on macOS. One persistent shell, many small bundles, install at runtime — like Expo Go, but for your own apps on your own server.

Write a normal RN app, run `iex publish-app`, see it appear in a Slack-style launcher. End user clicks Install, clicks the icon, and the bundle takes over the window. The whole loop, from "agent writes a tool" to "tool is running on your dock," is around 60 seconds.

## Why

AI coding agents (Claude Code, Codex, Cursor) make creating a small custom desktop tool nearly free. Distribution is the bottleneck — App Store review takes days, Electron is hundreds of MB per gadget, "open Xcode and figure out signing" is too much friction for something you only want for the next two hours. iExpo is the five-second answer: a shell you ship once + a server you trust + a one-line publish command.

## Quickstart

Prereqs: macOS, Xcode, Rust, Node 18+, CocoaPods (for iOS, optional).

```bash
# 1. Build the CLI
cd cli && cargo build --release

# 2. Start the catalog server (in another terminal)
cd ../bundled && cargo run --release

# 3. Publish a few apps
cd ..
./cli/target/release/iex publish-app hello
./cli/target/release/iex publish-app myapp
./cli/target/release/iex publish-app notes

# 4. Launch the shell
./cli/target/release/iex hub
```

Open the iExpo window, click **Install** on any catalog tile, then click its icon in the left rail. ~1.5s bridge restart and the app takes over the right pane. Click the home icon (or **View → Show Launcher**, ⌘⇧A) to come back.

## Architecture

```
┌──────────────────────┐               ┌────────────────────────────┐
│ bundled (Rust)       │               │ iExpoMac.app (Swift)       │
│  /apps               │ ◀── fetch ─── │  ┌──────┬─────────────────┐│
│  /apps/<id>/manifest │               │  │ rail │  Hermes runtime ││
│  /apps/<id>/bundles  │               │  │native│  ┌────────────┐ ││
└──────▲───────────────┘               │  │AppKit│  │ launcher   ││
       │ POST                          │  │      │  │   OR       ││
┌──────┴───────────────┐               │  │ home │  │  app-N JS  ││
│ iex publish-app foo  │               │  │  📋  │  └────────────┘ ││
│  Metro bundle        │               │  │  👋        ↓           │
│  curl POST           │               │  │  📝   ~/Library/.../   │
└──────────────────────┘               │  └─── installed.json      │
                                       │       apps/<id>/v<N>...   │
                                       └────────────────────────────┘
```

- **`bundled/`** — Rust/axum HTTP server. Per-app manifests + bundle versions.
- **`cli/`** — Rust CLI. `iex hub` runs the launcher in dev. `iex publish-app <id>` bundles a single app's `pages/` via Metro and uploads it.
- **`runtime/shell-macos/`** — Swift macOS shell. Wraps Hermes + a custom RN reconciler. Exposes `__iex.switchBundle(url)` to JS so the launcher can hand the screen over to a downloaded bundle.
- **`packages/iex/`** — JS framework: file-system router, store, fs, window, menubar, etc. `iex/hub` is the launcher itself.
- **`apps/`** — example apps that publish into the catalog (`hello`, `myapp`, `notes`).

## Notable design choices

- **Bridge restart, not shared Hermes.** The alternative — one runtime, multiple bundles — means publishers need special tooling (esbuild externals, runtime require maps) to avoid two-React-instances chaos. Bridge restart costs 1–2s per switch but the publisher writes vanilla RN with Metro.
- **The sidebar is native AppKit, not JS.** Lives outside the JS engine so it survives every bundle swap. Both sides read `installed.json`.
- **macOS RN via `react-reconciler` directly.** No upstream `react-native-macos` — `runtime/shell/iex-runtime.js` provides View / Text / Animated / etc. on top of AppKit, backed by host functions on `globalThis.__iex`.
- **Yoga top-down via `NSFlippedView`.** AppKit's coordinate system is bottom-up; views go through a flipped subclass so Yoga's frames render the way the JS authored them.

## Writing an app

```
apps/notes/
├── iex.toml          # name, displayName, icon, bundle_id
├── package.json
└── pages/
    ├── _layout.tsx
    └── index.tsx     # exports default + meta = { title, tab, ... }
```

File-system routing: `pages/index.tsx` → `/`, `pages/todo/[id].tsx` → `/todo/:id`. `_layout.tsx` wraps every page in its directory. Standard React Native + the `iex/router`, `iex/store`, `iex/window`, `iex/menubar` framework modules. See `apps/myapp/` for a full example with Todo state, drag-to-reorder, and a custom toolbar.

## Status / limitations

- macOS only. iOS shell exists but bridge-swap is mac-side.
- No bundle signing — trust model is "you trust the server you point it at."
- Installed bundles pin to the version current at install time; updates via uninstall + reinstall.
- Initial bridge-restart switch is 1–2s. Could be brought down by warming a second Hermes runtime in the background; not done yet.
- The original single-app dev mode (`iex run` from inside an app dir) still works — useful while iterating on a single app before publishing.

## License

MIT
