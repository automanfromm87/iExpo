# iExpo

A lightweight React Native app framework with file-system routing, built-in state management, and a Rust CLI. Write apps in TypeScript — no Xcode knowledge needed.

## What it does

- **File-system routing** — `pages/index.tsx` → `/`, `pages/todo/[id].tsx` → `/todo/:id`
- **Layout system** — `_layout.tsx` wraps pages, supports nesting
- **Page metadata** — declare title, icon, tab, headerShown via `export const meta`
- **Global state** — `createStore` with `useSyncExternalStore` (selector support)
- **Data fetching** — `@tanstack/react-query` (pre-installed)
- **Lifecycle hooks** — page focus/blur + app foreground/background
- **Hot reload** — edit, save, see changes instantly on iOS Simulator
- **Rust CLI** — fast init, run, build, add, sync, publish

## Architecture

```
iExpo/
├── cli/              ← Rust CLI (iex)
├── packages/iex/     ← Framework runtime
│   ├── router.js     ←   Router, Link, navigation hooks, lifecycle
│   └── store.js      ←   createStore, useStore, useSelector
├── runtime/
│   ├── shell/        ← React Native 0.85 iOS shell (Hermes + Metro)
│   └── build/        ← Cached .app (gitignored)
├── bundled/          ← Rust OTA bundle server
└── apps/
    └── myapp/        ← Example Todo app
        ├── iex.toml
        ├── store/
        │   └── todos.ts
        └── pages/
            ├── _layout.tsx
            ├── index.tsx       → / (tab)
            ├── stats.tsx       → /stats (tab)
            ├── settings.tsx    → /settings (tab)
            └── todo/
                └── [id].tsx    → /todo/:id (dynamic)
```

## Getting started

### Prerequisites

- macOS with Xcode
- Node.js 18+
- Rust (`cargo`)
- CocoaPods (`gem install cocoapods`)

### Build the CLI

```bash
cd cli && cargo build --release
```

### Create and run a project

```bash
./cli/target/release/iex init myapp
cd apps/myapp
../../cli/target/release/iex run
```

First run sets up the shell (npm install + pod install + xcodebuild). After that, starts in seconds.

### Commands

| Command | Description |
|---------|-------------|
| `iex init <name>` | Create a new project with `iex.toml` and pages/ |
| `iex run` | Build shell + install + start Metro |
| `iex run --no-build` | Start Metro only (shell already installed) |
| `iex sync` | Regenerate routes (while Metro is running) |
| `iex add <pkg>` | npm install + pod install + clear build cache |
| `iex build --sim` | Bundle JS + compile Release .app for Simulator |
| `iex build` | Bundle JS + compile Release .app for device |
| `iex publish` | Push OTA update to bundle server |

## Application model

### File routing

```
pages/
  index.tsx           → /
  about.tsx           → /about
  settings.tsx        → /settings
  product/
    [id].tsx          → /product/:id (dynamic route)
    index.tsx         → /product
```

### Layout

`_layout.tsx` in any directory wraps all pages in that directory. Layouts nest automatically.

```tsx
// pages/_layout.tsx
export default function RootLayout({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TodoProvider>
        <View style={{ flex: 1 }}>{children}</View>
      </TodoProvider>
    </QueryClientProvider>
  );
}
```

### Page metadata

```tsx
export const meta = {
  title: 'Home',                    // Header title
  icon: 'H',                       // Tab bar icon
  tab: true,                       // Show in tab bar
  tabOrder: 0,                     // Tab position
  headerShown: true,               // Show/hide header
  statusBarStyle: 'dark-content',  // Status bar style
  presentation: 'card',            // 'card' | 'modal'
  gestureEnabled: true,            // Allow swipe-back
};
```

### Navigation

```tsx
import { Link, useNavigation } from 'iex/router';

// Declarative
<Link to="/product/42">View Product</Link>

// Imperative
const { navigate, goBack, params } = useNavigation();
navigate('/product/42');
```

### Global state

```tsx
import { createStore } from 'iex/store';

const { Provider, useStore, useSelector } = createStore({ count: 0 });

// In _layout.tsx: wrap with <Provider>
// In any page:
const count = useSelector(s => s.count);
const [state, setState] = useStore();
setState(s => ({ ...s, count: s.count + 1 }));
```

### Data fetching

Uses `@tanstack/react-query` (pre-installed):

```tsx
import { useQuery } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['todos'],
  queryFn: () => fetch('/api/todos').then(r => r.json()),
});
```

### Lifecycle hooks

```tsx
import { usePageFocus, usePageBlur, useAppForeground, useAppBackground, useAppState } from 'iex/router';

// Page level
usePageFocus(() => console.log('page visible'));
usePageBlur(() => console.log('page hidden'));

// App level
useAppForeground(() => console.log('app active'));
useAppBackground(() => console.log('app background'));
const appState = useAppState(); // 'active' | 'background' | 'inactive'
```

### Configuration

`iex.toml` is the single config file:

```toml
name = "iExpoShell"
display_name = "My App"
bundle_id = "com.example.myapp"
port = 8081
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| CLI | Rust (clap, serde, toml, notify) |
| Runtime | React Native 0.85, React 19, Hermes |
| Routing | File-system based, custom Router |
| State | createStore (useSyncExternalStore) |
| Data | @tanstack/react-query |
| Build | xcodebuild, CocoaPods |
| OTA | Custom Rust bundle server |

## License

MIT
