// iex/appearance — useColorScheme hook with platform-specific backing.
// macOS: subscribes to NSApp.effectiveAppearance via the bridge.
// iOS / others: defers to React Native's Appearance API.

import { useEffect, useState } from 'react';
import { Platform, Appearance } from 'react-native';

const native: any = (globalThis as any).__iex;

type Scheme = 'light' | 'dark';

const macListeners = new Set<(s: Scheme) => void>();
let macStarted = false;
let macCached: Scheme = 'light';

function ensureMacStarted(): void {
  if (macStarted) return;
  macStarted = true;
  macCached = (native?.getColorScheme?.() === 'dark' ? 'dark' : 'light');
  native?.onColorScheme?.((s: string) => {
    macCached = s === 'dark' ? 'dark' : 'light';
    macListeners.forEach(fn => fn(macCached));
  });
}

export function useColorScheme(): Scheme {
  const isMac = Platform.OS === 'macos';
  if (isMac) ensureMacStarted();
  const initial: Scheme = isMac
    ? macCached
    : ((Appearance.getColorScheme() ?? 'light') as Scheme);
  const [scheme, setScheme] = useState<Scheme>(initial);
  useEffect(() => {
    if (isMac) {
      macListeners.add(setScheme);
      return () => { macListeners.delete(setScheme); };
    }
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme((colorScheme ?? 'light') as Scheme);
    });
    return () => sub.remove();
  }, [isMac]);
  return scheme;
}

export type { Scheme as ColorScheme };
