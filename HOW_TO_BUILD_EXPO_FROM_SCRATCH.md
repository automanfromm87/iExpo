# How to Build Expo from Scratch

> **Note**: This document was written during the initial development of iExpo with RN 0.76. The project has since evolved significantly — upgraded to RN 0.85/React 19, Rust CLI, file-system routing with layouts/dynamic routes, global state, React Query integration, etc. See `README.md` for the current state. This document is preserved as a historical record of the architecture and lessons learned.

A complete technical guide to building an Expo-like development tool from zero. This document covers every layer of the architecture, every decision point, and every pitfall we encountered.

---

## Table of Contents

1. [What Is Expo, Really?](#1-what-is-expo-really)
2. [Architecture Overview](#2-architecture-overview)
3. [Layer 1: JavaScript Engine (Hermes)](#3-layer-1-javascript-engine-hermes)
4. [Layer 2: React Native Bridge](#4-layer-2-react-native-bridge)
5. [Layer 3: The Shell App](#5-layer-3-the-shell-app)
6. [Layer 4: Metro Bundler](#6-layer-4-metro-bundler)
7. [Layer 5: The CLI](#7-layer-5-the-cli)
8. [Layer 6: Hot Module Replacement](#8-layer-6-hot-module-replacement)
9. [The Complete Data Flow](#9-the-complete-data-flow)
10. [Implementation Guide](#10-implementation-guide)
11. [Problems We Encountered](#11-problems-we-encountered)
12. [What Real Expo Does Beyond This](#12-what-real-expo-does-beyond-this)

---

## 1. What Is Expo, Really?

Strip away the marketing and Expo is three things:

1. **A pre-built native iOS/Android app** (Expo Go) that can execute arbitrary JavaScript
2. **A development server** (Metro) that serves JavaScript bundles over HTTP
3. **A CLI** that orchestrates everything so the developer never touches native code

The fundamental insight: **native code changes slowly, JavaScript changes fast**. By pre-compiling all the native code once and loading JavaScript dynamically, you eliminate the compile-wait-run cycle entirely.

```
Traditional iOS Development:
  Edit Swift → Compile (30s-5min) → Install → Launch → See change

Expo Development:
  Edit JS → Save → See change (200ms)
```

This is possible because the native "shell" app contains a JavaScript engine that can execute any JS code given to it at runtime.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer's Machine                      │
│                                                              │
│  ┌──────────┐    ┌─────────────┐    ┌────────────────────┐  │
│  │  App.js  │───→│   Metro     │───→│   iExpoShell.app   │  │
│  │ (user    │    │  Bundler    │    │   (on Simulator)    │  │
│  │  code)   │    │             │    │                     │  │
│  └──────────┘    │ localhost   │    │  ┌───────────────┐  │  │
│                  │ :8081       │    │  │    Hermes      │  │  │
│                  │             │◄──►│  │  JS Engine     │  │  │
│                  │ ┌─────────┐ │    │  │               │  │  │
│                  │ │ HTTP    │ │    │  │  Executes     │  │  │
│                  │ │ Server  │ │    │  │  your App.js  │  │  │
│                  │ └─────────┘ │    │  └───────┬───────┘  │  │
│                  │ ┌─────────┐ │    │          │          │  │
│                  │ │WebSocket│ │    │  ┌───────▼───────┐  │  │
│                  │ │ (HMR)   │ │    │  │  RN Bridge    │  │  │
│                  │ └─────────┘ │    │  │  JS ↔ Native  │  │  │
│                  └─────────────┘    │  └───────┬───────┘  │  │
│                                     │          │          │  │
│                                     │  ┌───────▼───────┐  │  │
│                                     │  │   UIKit       │  │  │
│                                     │  │  Native Views │  │  │
│                                     │  └───────────────┘  │  │
│                                     └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Layer 1: JavaScript Engine (Hermes)

### What Is Hermes?

Hermes is a JavaScript engine built by Meta specifically for React Native. It lives inside the shell app as a dynamic framework:

```
iExpoShell.app/
  Frameworks/
    hermes.framework/
      hermes          ← 6.3MB dynamic library
```

### Why Not JavaScriptCore?

iOS ships with JavaScriptCore (used by Safari), but Hermes is better for RN:

| Feature | JavaScriptCore | Hermes |
|---------|---------------|--------|
| Startup time | ~1s (JIT compile) | ~200ms (AOT bytecode) |
| Memory | Higher (JIT cache) | 30% less |
| Binary size | 0 (system lib) | +6MB |
| Bytecode precompilation | No | Yes |

Hermes precompiles JS to bytecode at build time, so at runtime it skips parsing and compilation entirely.

### How Hermes Executes Your Code

```
1. Metro bundles App.js + dependencies → single index.bundle file
2. Shell app downloads index.bundle via HTTP
3. Hermes receives the bundle as a string
4. Hermes compiles to bytecode (or loads precompiled .hbc)
5. Hermes executes bytecode in its VM
6. JS calls like `<View>` translate to native bridge calls
```

### Where Hermes Lives in the Build

```
Source:
  node_modules/react-native/sdks/hermes-engine/

Downloaded during pod install:
  ~/.iexpo/shell/ios/Pods/hermes-engine/destroot/Library/Frameworks/
    universal/hermes.xcframework/
      ios-arm64/                    ← real device
      ios-arm64_x86_64-simulator/  ← simulator
      xros-arm64/                  ← visionOS
```

CocoaPods downloads a precompiled Hermes binary from Maven:
```
https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/
  0.76.9/react-native-artifacts-0.76.9-hermes-ios-debug.tar.gz
```

---

## 4. Layer 2: React Native Bridge

### The Bridge Architecture

The bridge is the communication layer between JavaScript (Hermes) and native code (UIKit):

```
JavaScript World                    Native World
┌─────────────────┐                ┌─────────────────┐
│                 │                │                 │
│  React          │   Bridge      │  UIKit          │
│  Component Tree │◄────────────►│  View Hierarchy │
│                 │  (async JSON  │                 │
│  <View>         │   messages)   │  UIView         │
│  <Text>         │               │  UILabel        │
│  <ScrollView>   │               │  UIScrollView   │
│  <Image>        │               │  UIImageView    │
│                 │                │                 │
└─────────────────┘                └─────────────────┘
```

### How a `<View>` Becomes a UIView

When your JS code renders:

```jsx
<View style={{ backgroundColor: 'red', width: 100, height: 100 }} />
```

This happens:

```
1. React reconciler creates a virtual node:
   { type: 'View', props: { style: { backgroundColor: 'red', width: 100, height: 100 } } }

2. React Native's renderer serializes this to a bridge message:
   ["createView", [viewTag, "RCTView", rootTag, { backgroundColor: 0xFFFF0000, width: 100, height: 100 }]]

3. Bridge sends this message from JS thread to main thread (async, batched)

4. Native side deserializes and calls:
   UIView *view = [[UIView alloc] init];
   view.backgroundColor = [UIColor redColor];

5. Yoga (layout engine) calculates frame: CGRect(0, 0, 100, 100)

6. View is added to the native view hierarchy
```

### Yoga Layout Engine

Yoga is a C++ Flexbox implementation that runs on the native side:

```
JS: style={{ flexDirection: 'row', justifyContent: 'center' }}
  ↓
Yoga receives flex properties
  ↓
Yoga calculates pixel positions (x, y, width, height) for every node
  ↓
Native applies CGRect frames to UIViews
```

Yoga is why you use `flexDirection: 'row'` instead of Auto Layout constraints.

### New Architecture (Fabric + TurboModules)

React Native 0.76 uses the "New Architecture":

- **Fabric**: Replaces the old bridge with direct C++ communication (no JSON serialization)
- **TurboModules**: Lazy-loaded native modules with direct JSI (JavaScript Interface) calls
- **JSI**: C++ API that lets JS call native functions directly, without serialization

```
Old: JS → JSON → Bridge → ObjC → UIKit  (async, serialized)
New: JS → JSI → C++ → ObjC → UIKit      (sync, direct)
```

This is why the shell app binary is 33MB — it contains all these C++ libraries statically linked.

### What's Inside the 33MB Debug Dylib

```
iExpoShell.debug.dylib (33MB) contains:
├── React-Core           ← Component lifecycle, event system
├── React-Fabric         ← New renderer (C++)
├── React-FabricComponents ← Native component implementations
├── React-cxxreact       ← C++ bridge code
├── React-jsi            ← JavaScript Interface (JS ↔ C++)
├── React-jsiexecutor    ← Hermes integration via JSI
├── React-jsinspector    ← Chrome DevTools connection
├── ReactCommon          ← Shared cross-platform code
├── React-RCTText        ← <Text> component (UILabel bridge)
├── React-RCTImage       ← <Image> component (UIImageView bridge)
├── React-RCTNetwork     ← fetch() implementation (NSURLSession)
├── React-RCTAnimation   ← Animated API (native driver)
├── React-RCTBlob        ← Binary data handling
├── React-RCTSettings    ← AsyncStorage bridge
├── Yoga                 ← Flexbox layout engine (C++)
├── DoubleConversion     ← Number ↔ string conversion
├── glog                 ← Google logging library
├── RCT-Folly            ← Meta's C++ utilities
├── boost                ← C++ Boost libraries
├── fmt                  ← String formatting
├── SocketRocket         ← WebSocket client (for HMR & DevTools)
└── hermes (linked)      ← JS engine reference
```

---

## 5. Layer 3: The Shell App

### What Makes It a "Shell"

A normal React Native app has your JS code bundled inside it. The shell app has **no JS code** — it loads JS from an external source at runtime.

The difference is one method in AppDelegate:

```objc
- (NSURL *)bundleURL
{
#if DEBUG
  // Shell mode: load from Metro dev server
  return [[RCTBundleURLProvider sharedSettings]
          jsBundleURLForBundleRoot:@"index"];
  // Returns: http://localhost:8081/index.bundle?platform=ios
#else
  // Release mode: load embedded bundle
  return [[NSBundle mainBundle]
          URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
```

In DEBUG mode, `RCTBundleURLProvider` returns a URL pointing to `http://localhost:8081/index.bundle?platform=ios`. The app downloads this bundle over HTTP and hands it to Hermes for execution.

### The Registration Handshake

The shell app and your JS code must agree on a name:

```
Native side (AppDelegate.mm):
  self.moduleName = @"iExpoShell";

JS side (index.js):
  AppRegistry.registerComponent('iExpoShell', () => App);
```

If these names don't match, you get a red screen: "Application iExpoShell has not been registered."

### Shell App File Structure

```
~/.iexpo/shell/
├── package.json           ← Dependencies (react, react-native)
├── node_modules/          ← All npm packages
│   ├── react/             ← React core
│   ├── react-native/      ← RN framework + native code
│   └── hermes-engine/     ← JS engine
├── index.js               ← Entry point (registers App component)
├── App.js                 ← Replaced by user's code at dev time
├── metro.config.js        ← Metro bundler configuration
├── ios/
│   ├── Podfile            ← CocoaPods dependency list
│   ├── Pods/              ← Compiled native dependencies (after pod install)
│   ├── iExpoShell.xcworkspace  ← Xcode workspace (project + Pods)
│   ├── iExpoShell.xcodeproj    ← Xcode project
│   └── iExpoShell/
│       ├── AppDelegate.h
│       ├── AppDelegate.mm     ← Native entry point
│       ├── Info.plist
│       └── LaunchScreen.storyboard
└── app.json
```

### Why CocoaPods?

React Native's native code is distributed as CocoaPods. When you run `pod install`:

1. CocoaPods reads the `Podfile`
2. Resolves 65+ pod dependencies
3. Downloads source code for each pod
4. Generates an Xcode workspace that links everything together
5. Downloads precompiled Hermes binary from Maven

This is why `pod install` takes 85 seconds — it's downloading and configuring 65 native libraries.

### Build Process

```
pod install
    ↓ generates iExpoShell.xcworkspace
xcodebuild -workspace iExpoShell.xcworkspace -scheme iExpoShell
    ↓ compiles 65+ pods + app code
    ↓ links everything into iExpoShell.debug.dylib (33MB)
    ↓ copies hermes.framework
    ↓ generates Info.plist
    ↓ produces iExpoShell.app
xcrun simctl install booted iExpoShell.app
    ↓ installs on simulator
xcrun simctl launch booted org.reactjs.native.example.iExpoShell
    ↓ launches app → app connects to localhost:8081
```

After this one-time build, you never compile native code again (unless you add a native module).

---

## 6. Layer 4: Metro Bundler

### What Metro Does

Metro is a JavaScript bundler (like webpack/vite but for React Native):

```
Your App.js
  ↓
import React from 'react'        ← resolves to node_modules/react/index.js
import { View } from 'react-native'  ← resolves to node_modules/react-native/...
  ↓
Metro traverses all imports recursively (dependency graph)
  ↓
Concatenates everything into a single file: index.bundle
  ↓
Serves via HTTP: http://localhost:8081/index.bundle?platform=ios
```

### Metro's HTTP Server

Metro exposes several endpoints:

```
GET /index.bundle?platform=ios    ← The full JS bundle (~2-5MB)
GET /index.map?platform=ios       ← Source maps (for debugging)
GET /status                       ← "packager-status:running"
GET /symbolicate                  ← Stack trace symbolication

WebSocket /hot                    ← Hot Module Replacement connection
WebSocket /debugger-proxy         ← Chrome DevTools connection
```

### Bundle Format

The bundle is a single JS file that looks roughly like this:

```javascript
// Module registry
__d(function(global, require, module, exports) {
  // === node_modules/react/index.js ===
  var React = { createElement: ..., useState: ... };
  module.exports = React;
}, 0); // module ID 0

__d(function(global, require, module, exports) {
  // === node_modules/react-native/index.js ===
  var RN = { View: ..., Text: ..., StyleSheet: ... };
  module.exports = RN;
}, 1); // module ID 1

__d(function(global, require, module, exports) {
  // === your App.js ===
  var React = require(0);
  var RN = require(1);
  function App() { return React.createElement(RN.View, ...); }
  module.exports = App;
}, 2); // module ID 2

// Entry point
require(2);
```

Each file becomes a `__d()` call with a numeric module ID. `require()` loads modules by ID.

### How User Code Gets to Metro

In iExpo, when the user saves `App.js`:

```
1. iexpo CLI detects file change (fs.watch)
2. Copies App.js from user's project to ~/.iexpo/shell/App.js
3. Metro detects the file change in shell directory
4. Metro invalidates its bundle cache
5. Next request for index.bundle returns updated code
6. If HMR is connected, Metro pushes the update immediately
```

---

## 7. Layer 5: The CLI

### iExpo CLI Architecture

```
/tmp/iExpo/
├── package.json          ← npm package definition
├── bin/iexpo.js          ← Entry point (#!/usr/bin/env node)
├── src/
│   ├── paths.js          ← IEXPO_HOME, SHELL_DIR constants
│   ├── shell.js          ← Shell app management (create, build, install)
│   └── commands/
│       ├── init.js       ← `iexpo init <name>` — create new project
│       ├── start.js      ← `iexpo start` — start Metro only
│       └── run.js        ← `iexpo run` — build + install + start Metro
```

### `iexpo init <name>` — What It Creates

```javascript
// Creates a minimal project — just JS, no native code
myapp/
├── App.js           ← User's entry point (React Native components)
├── package.json     ← { dependencies: { react, react-native } }
└── app.json         ← { name: "myapp" }
```

That's it. Three files. The user never sees Xcode, CocoaPods, or native code.

### `iexpo run` — The Orchestration

```
Step 1: ensureShellExists()
  ├── Does ~/.iexpo/shell/node_modules exist?
  ├── NO → create package.json, npm install, generate iOS project, pod install
  └── YES → skip

Step 2: syncProjectToShell()
  └── Copy user's App.js → ~/.iexpo/shell/App.js

Step 3: buildShellForSimulator()
  ├── Does cached .app exist in ~/.iexpo/build/?
  ├── NO → xcodebuild (takes 3-5 minutes first time)
  └── YES → skip ("✅ Using cached shell app")

Step 4: installAndLaunchOnSimulator()
  ├── xcrun simctl install booted iExpoShell.app
  └── xcrun simctl launch booted <bundleId>

Step 5: Start Metro dev server
  └── npx react-native start --port 8081
```

After the first run, Steps 1 and 3 are skipped entirely (cached). Subsequent runs go straight to Step 2 → 4 → 5, which takes ~2 seconds.

---

## 8. Layer 6: Hot Module Replacement (HMR)

### How HMR Works

```
1. App starts → opens WebSocket to ws://localhost:8081/hot

2. You edit App.js and save

3. fs.watch detects the change

4. Metro:
   a. Re-transforms only the changed file
   b. Creates an HMR update payload:
      {
        "type": "update",
        "body": {
          "modules": [{
            "id": 2,  // module ID of App.js
            "code": "function App() { ... new code ... }"
          }]
        }
      }
   c. Sends payload over WebSocket

5. RN client receives the update:
   a. Evaluates the new module code
   b. Replaces module 2 in the module registry
   c. React re-renders with new component
   d. State is preserved (Fast Refresh)

6. Total time: ~200ms
```

### Fast Refresh vs Hot Reload

- **Hot Reload (old)**: Replaces the entire module, loses component state
- **Fast Refresh (new, default)**: Surgically updates only the changed component, preserves state

Fast Refresh works by:
1. Detecting which React components changed
2. Re-rendering only those components with their current state
3. If it can't safely update (e.g., you changed hooks), it falls back to full reload

---

## 9. The Complete Data Flow

### From Keystroke to Pixel: The Full Journey

```
You type in App.js: <Text>Hello</Text>
  ↓ save file
  ↓
[Metro Bundler]
  ↓ fs.watch detects change
  ↓ Babel transforms JSX: React.createElement(Text, null, "Hello")
  ↓ Bundles into index.bundle
  ↓ Pushes HMR update via WebSocket
  ↓
[iExpoShell.app - WebSocket Client]
  ↓ SocketRocket receives WebSocket message
  ↓ Passes new module code to Hermes
  ↓
[Hermes JS Engine]
  ↓ Evaluates: React.createElement(Text, null, "Hello")
  ↓ React reconciler diffs virtual DOM
  ↓ Determines: need to create a Text node with content "Hello"
  ↓
[React Native Fabric Renderer]
  ↓ Creates a shadow node in C++
  ↓ Yoga calculates layout (position, size)
  ↓
[RCTText Native Module]
  ↓ Creates UILabel on main thread
  ↓ Sets text = @"Hello"
  ↓ Sets frame from Yoga calculation
  ↓
[UIKit]
  ↓ Composites UILabel into view hierarchy
  ↓ Core Animation renders to screen buffer
  ↓
[Display]
  ↓ GPU presents frame
  ↓
You see "Hello" on screen
```

---

## 10. Implementation Guide

### Prerequisites

```bash
# Required
- macOS with Xcode installed (for iOS simulator + build tools)
- Node.js (v18-v22 recommended, v24 has compatibility issues)
- npm

# Will be installed during setup
- CocoaPods (requires Ruby 3.0+)
- React Native + Hermes (via npm)
```

### Step 1: Create the CLI

```bash
mkdir iExpo && cd iExpo
npm init -y
npm install commander chalk ora fs-extra
```

```javascript
// bin/iexpo.js
#!/usr/bin/env node
const { program } = require('commander');
program.command('init <name>').action(init);
program.command('start').action(start);
program.command('run').action(run);
program.parse();
```

### Step 2: Create the Shell App

The shell app is a standard React Native project with specific version pinning:

```json
{
  "dependencies": {
    "react": "18.3.1",
    "react-native": "0.76.9",
    "@react-native-community/cli": "15.1.3",
    "@react-native-community/cli-platform-ios": "15.1.3",
    "@react-native/metro-config": "0.76.9"
  }
}
```

**Critical**: All packages must be version-aligned. RN 0.76.9 requires CLI 15.x, metro-config 0.76.x. Mixing versions causes runtime crashes.

### Step 3: Generate iOS Project

Copy the iOS template from `@react-native-community/template`:

```bash
npm install @react-native-community/template@0.76.9 --save-dev
cp -R node_modules/@react-native-community/template/template/ios/ ios/
```

Then rename all `HelloWorld` references to your app name:

```bash
# In all files
find ios/ -type f -exec sed -i '' 's/HelloWorld/iExpoShell/g' {} +
# In directory/file names
mv ios/HelloWorld ios/iExpoShell
mv ios/HelloWorld.xcodeproj ios/iExpoShell.xcodeproj
# ... etc
```

### Step 4: Install CocoaPods

```bash
# Requires Ruby 3.0+ (system Ruby 2.6 won't work)
brew install ruby
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
gem install cocoapods

cd ios && pod install
# Takes ~85 seconds, downloads 65 pods + Hermes binary
```

### Step 5: Build the Shell

```bash
xcodebuild \
  -workspace ios/iExpoShell.xcworkspace \
  -scheme iExpoShell \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" \
  -derivedDataPath build/DerivedData \
  build
# Takes 3-5 minutes first time
```

**Important**: Use `-destination` not `-sdk iphonesimulator`. Xcode 26 beta doesn't generate Info.plist with `-sdk` flag alone.

### Step 6: Install on Simulator

```bash
xcrun simctl install booted build/DerivedData/.../iExpoShell.app
xcrun simctl launch booted org.reactjs.native.example.iExpoShell
```

### Step 7: Start Metro

```bash
npx react-native start --port 8081
```

The app connects to Metro, downloads the JS bundle, and renders your UI.

### Step 8: Sync User Code

```javascript
// When user saves App.js, copy it to the shell directory
fs.copyFileSync(userProject + '/App.js', shellDir + '/App.js');
// Metro detects the change and pushes HMR update
```

---

## 11. Problems We Encountered

### Problem 1: `react-native init` Failed — `fetch failed`

**Symptom**: `npx @react-native-community/cli init` crashes with `TypeError: fetch failed`

**Root Cause**: Node.js 24's native `fetch()` API doesn't work in sandboxed/restricted environments. The RN CLI uses `fetch()` to download templates from npm registry.

**Evidence**:
```javascript
// Node 24's fetch is broken
await fetch('https://registry.npmjs.org/...') // → TypeError: fetch failed

// But npm's HTTP client works fine
npm install react-native  // → works
```

**Solution**: Don't use `react-native init`. Create the project structure manually:
1. Write `package.json` by hand
2. Run `npm install` (uses npm's own HTTP, not Node's fetch)
3. Copy iOS template from `@react-native-community/template` package

**Lesson**: When a CLI tool uses Node.js internals that changed in a new version, bypass the CLI and do it manually.

---

### Problem 2: CocoaPods Won't Install — Ruby Too Old

**Symptom**: `sudo gem install cocoapods` fails with `ffi requires Ruby version >= 3.0`

**Root Cause**: macOS ships with Ruby 2.6.10 (from 2022). CocoaPods depends on `ffi` gem, which dropped Ruby 2.x support in version 1.17.5+.

**Error Chain**:
```
cocoapods → ffi >= 1.15.0 → requires Ruby >= 3.0
System Ruby = 2.6.10 → incompatible
```

**Failed Attempts**:
1. `sudo gem install ffi -v 1.17.4` — Still requires Ruby 3.0 (the error message is misleading)
2. `brew install cocoapods` — Failed due to Homebrew directory permissions

**Solution**:
```bash
brew install ruby        # Installs Ruby 4.0.3 to /opt/homebrew/opt/ruby/
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
export PATH="/opt/homebrew/lib/ruby/gems/4.0.0/bin:$PATH"
gem install cocoapods    # Now uses Ruby 4.0, ffi installs fine
```

**Lesson**: Always check the Ruby version before installing CocoaPods. The system Ruby on macOS is ancient and can't be upgraded without brew/rbenv.

---

### Problem 3: `pod install` Failed — Missing CLI

**Symptom**: `pod install` fails at `use_native_modules!` in the Podfile

**Root Cause**: The Podfile calls `use_native_modules!` which internally runs:
```ruby
node -e "require('@react-native-community/cli').run()"
```
But `@react-native-community/cli` wasn't in `package.json`.

**Solution**: Add CLI packages to dependencies:
```bash
npm install @react-native-community/cli@15.1.3 \
            @react-native-community/cli-platform-ios@15.1.3
```

**Lesson**: React Native's Podfile depends on npm packages being installed. `pod install` is not purely a Ruby/CocoaPods operation — it shells out to Node.js.

---

### Problem 4: Xcode Build Succeeded But App Has No Info.plist

**Symptom**: `xcrun simctl install` fails with "Missing bundle ID"

**Root Cause**: Xcode 26 beta with `-sdk iphonesimulator` flag doesn't generate a complete `.app` bundle. The built binary exists but Info.plist is missing.

**Evidence**:
```bash
# Built with -sdk flag:
ls iExpoShell.app/
  iExpoShell              # 54KB binary ✓
  iExpoShell.debug.dylib  # 33MB ✓
  Frameworks/             # ✓
  Info.plist              # ✗ MISSING

# Built with -destination flag:
ls iExpoShell.app/
  iExpoShell              # ✓
  Info.plist              # ✓ PRESENT
```

**Solution**: Use `-destination` instead of `-sdk`:
```bash
# Wrong (Xcode 26 beta):
xcodebuild -sdk iphonesimulator ...

# Correct:
xcodebuild -destination "platform=iOS Simulator,name=iPhone 17 Pro" ...
```

**Lesson**: Xcode beta versions can change build behavior. Always verify the output artifact contains expected files.

---

### Problem 5: Metro Crashes — `Cannot read 'handle'`

**Symptom**: Metro starts, shows the React Native logo, then crashes:
```
TypeError: Cannot read properties of undefined (reading 'handle')
    at app.use (connect/index.js:87:21)
    at exports.runServer (metro/src/index.flow.js:146:15)
```

**Root Cause**: Version mismatch between `@react-native-community/cli` and `react-native`.

We had:
```json
"@react-native-community/cli": "^20.1.3",  // For RN 0.85
"react-native": "0.76.9"                    // RN 0.76
```

CLI v20 uses Metro 0.84, RN 0.76 uses Metro 0.81. The `connect` middleware in Metro 0.84 has a different API that Metro 0.81's server code doesn't understand.

**Solution**: Pin CLI version to match RN version:
```json
"@react-native-community/cli": "15.1.3",           // Matches RN 0.76
"@react-native-community/cli-platform-ios": "15.1.3",
"@react-native/metro-config": "0.76.9"              // Matches RN 0.76
```

**Version Compatibility Matrix**:
```
RN 0.76.x → CLI 15.x, Metro 0.81.x, metro-config 0.76.x
RN 0.77.x → CLI 16.x, Metro 0.82.x, metro-config 0.77.x
RN 0.78.x → CLI 17.x, Metro 0.82.x, metro-config 0.78.x
...
RN 0.85.x → CLI 20.x, Metro 0.84.x, metro-config 0.85.x
```

**Lesson**: React Native's ecosystem has strict version coupling. A mismatched dependency isn't just "a warning" — it causes hard crashes. This is the #1 reason people can't get RN working. Expo solves this by managing the entire dependency tree.

---

### Problem 6: `@react-native/metro-config` Wrong Version

**Symptom**: Same `Cannot read 'handle'` error even after fixing CLI version.

**Root Cause**: `npm install @react-native/metro-config` without a version specifier installed v0.85.2 (latest), which pulled in Metro 0.84.3 alongside Metro 0.81.5 from RN 0.76.

**Evidence**:
```
npm ls metro
├── @react-native/metro-config@0.85.2
│   └── metro@0.84.3    ← WRONG
└── react-native@0.76.9
    └── metro@0.81.5    ← CORRECT
```

Two versions of Metro in the same project = crash.

**Solution**: `npm install @react-native/metro-config@0.76.9`

**Lesson**: Always specify exact versions for React Native ecosystem packages. Never use `^` or `latest`.

---

### Problem 7: App Shows "No Script URL Provided"

**Symptom**: Red screen with "No script URL provided. unsanitizedScriptURLString = (null)"

**Root Cause**: The app launched before Metro was running. `RCTBundleURLProvider` tries to connect to localhost:8081, fails, and stores null as the bundle URL.

**Solution**: Start Metro first, then launch the app. Or press `i` in the Metro terminal to relaunch with the correct URL.

**Lesson**: The shell app's `bundleURL` method is called once at launch. If Metro isn't ready, the URL is null and the app can't recover without a relaunch.

---

### Problem 8: `iexpo` Command Not Found After nvm Switch

**Symptom**: After `nvm use 20`, `iexpo` command disappears.

**Root Cause**: `npm link` creates a symlink in the current Node version's `bin/` directory. When you switch Node versions with nvm, you get a different `bin/` directory.

```
Node 24: ~/.nvm/versions/node/v24.14.0/bin/iexpo → /tmp/iExpo
Node 20: ~/.nvm/versions/node/v20.x.x/bin/         ← no iexpo here
```

**Solution**: Re-run `npm link` after switching Node versions:
```bash
cd /tmp/iExpo && npm link
```

**Lesson**: `npm link` is per-Node-version. Consider installing globally or adding to PATH instead.

---

## 12. What Real Expo Does Beyond This

Our iExpo implements the core. Real Expo adds:

### Expo Go (Pre-built App)
- Available on App Store/Google Play
- Contains 100+ native modules pre-compiled (Camera, Maps, FileSystem, etc.)
- Users don't need Xcode at all — just scan a QR code

### Expo SDK
- Unified API for native features: `expo-camera`, `expo-location`, etc.
- Version-locked to specific RN version — eliminates version mismatches
- `npx expo install <package>` ensures compatible versions

### EAS Build (Cloud Compilation)
- Builds native app in the cloud — developers don't need Xcode locally
- Produces actual App Store / Play Store binaries
- Handles code signing, provisioning profiles

### OTA Updates
- Push JS bundle updates without App Store review
- `expo publish` uploads new bundle to Expo CDN
- App checks for updates on launch and downloads new bundle

### Config Plugins
- `app.json` / `app.config.js` declaratively configures native projects
- No need to manually edit Info.plist, AndroidManifest.xml, etc.
- Plugins can modify native code at build time (prebuild)

### Expo Router
- File-system based routing (like Next.js but for mobile)
- Deep linking, universal links, tab navigation — all from file structure

---

## Summary

Building Expo from scratch teaches you that mobile development's complexity is not in writing code — it's in **managing the toolchain**. The actual architecture (JS engine + bridge + native shell + bundler) is elegant. The pain comes from:

1. **Version coupling**: Every package must be exactly the right version
2. **Native build tools**: CocoaPods, Ruby, Xcode — each with their own version requirements  
3. **Platform differences**: What works on Node 20 breaks on Node 24
4. **One-time setup cost**: 85 seconds for pod install, 5 minutes for first build — but zero after that

Expo's genius is absorbing all this complexity into a single `npx expo start`. The 50+ engineers at Expo Inc. maintain the version matrix, test every combination, and ship a "just works" experience.

Our iExpo proves it's possible to build the core in an afternoon. Making it reliable across every Mac, every Xcode version, every Node version — that's the multi-year engineering effort.
