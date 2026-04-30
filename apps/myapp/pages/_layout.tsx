import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Window } from 'iex/window';
import { App } from 'iex/app';
import { FS } from 'iex/fs';
import { MenuBar, type MenuBarItem } from 'iex/menubar';
import Constants from 'iex/constants';
import { Menu, Toolbar } from 'iex/macos';
import { useNavigation } from 'iex/router';
import { useColorScheme } from 'iex/appearance';
import { usePrimaryRoot } from 'iex/root';
import { TodoProvider, useTodoSelector } from '../store/todos';
import { PrefsProvider } from '../store/prefs';

const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const scheme = useColorScheme();
  const isPrimary = usePrimaryRoot();
  const rootBg = scheme === 'dark' ? '#1c1c1e' : '#f5f5f7';

  useEffect(() => {
    if (Platform.OS !== 'macos' || !isPrimary) return;
    // In Hub mode the platform owns the window + dock icon; an app trying to
    // re-size or re-icon the window causes a visible flicker on app switch.
    if (!Constants.isHub) {
      Window.set({
        title: 'iExpo',
        size: { width: 1024, height: 720 },
        minSize: { width: 720, height: 480 },
        titleBarStyle: 'hidden',
        center: true,
      });
      // Prefer ./icon.png (or .icns) in the project root if one exists; fall
      // back to an SF Symbol so the dock icon at least differs from the shell.
      App.setIcon({ symbol: 'checklist', size: 256, weight: 'semibold' });
      (async () => {
        for (const name of ['icon.icns', 'icon.png']) {
          const p = `${Constants.projectDir}/${name}`;
          if (await FS.exists(p)) { App.setIcon({ path: p }); return; }
        }
      })();
    }
    // NSToolbar attachment grows the window's frame to fit, so attaching it
    // from a per-app layout makes the window jump size on every app switch
    // in Hub mode. The platform owns toolbar in Hub mode.
    if (!Constants.isHub) {
      Toolbar.set([
        { id: 'add',     label: 'Add',     tooltip: 'Add a new task',
          systemImage: 'plus',
          onPress: () => console.log('[toolbar] add pressed') },
        { id: 'flex',    kind: 'flexibleSpace' },
        { id: 'refresh', label: 'Refresh', tooltip: 'Reload data',
          systemImage: 'arrow.clockwise',
          onPress: () => console.log('[toolbar] refresh pressed') },
      ], 'unified');
      return () => Toolbar.hide();
    }
    return undefined;
  }, [isPrimary]);

  return (
    <QueryClientProvider client={queryClient}>
      <TodoProvider>
        <PrefsProvider>
          <ShortcutHost>
            <DockBadgeHost />
            <MenuBarHost />
            <View style={[styles.root, { backgroundColor: rootBg }]}>{children}</View>
          </ShortcutHost>
        </PrefsProvider>
      </TodoProvider>
    </QueryClientProvider>
  );
}

function ShortcutHost({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const isPrimary = usePrimaryRoot();
  useEffect(() => {
    // Menu items are app-wide. Registering from every window would multiply
    // them; pin registration to the primary root only.
    if (Platform.OS !== 'macos' || !isPrimary) return;
    const subs = [
      Menu.addItem({ menu: 'View', label: 'Back',     shortcut: '⌘[', onPress: () => nav.goBack() }),
      Menu.addItem({ menu: 'View', label: 'Tasks',    shortcut: '⌘1', onPress: () => nav.navigate('/') }),
      Menu.addItem({ menu: 'View', label: 'Stats',    shortcut: '⌘2', onPress: () => nav.navigate('/stats') }),
      Menu.addItem({ menu: 'View', label: 'Settings', shortcut: '⌘3', onPress: () => nav.navigate('/settings') }),
    ];
    return () => subs.forEach(s => s.remove());
  }, [nav, isPrimary]);
  return <>{children}</>;
}

function DockBadgeHost() {
  const isPrimary = usePrimaryRoot();
  const active = useTodoSelector(s => s.todos.filter(t => !t.done).length);
  useEffect(() => {
    if (Platform.OS !== 'macos' || !isPrimary) return;
    App.setDockBadge(active > 0 ? String(active) : null);
    return () => App.setDockBadge(null);
  }, [active, isPrimary]);
  return null;
}

function MenuBarHost() {
  const isPrimary = usePrimaryRoot();
  const active = useTodoSelector(s => s.todos.filter(t => !t.done).length);
  const itemRef = useRef<MenuBarItem | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'macos' || !isPrimary) return;
    itemRef.current = MenuBar.add({ systemImage: 'checklist', tooltip: 'iExpo Tasks' });
    return () => {
      itemRef.current?.remove();
      itemRef.current = null;
    };
  }, [isPrimary]);

  useEffect(() => {
    const item = itemRef.current;
    if (!item) return;
    item.update({ title: active > 0 ? ` ${active}` : '' });
    item.setMenu([
      { id: 'show',  label: 'Show iExpo',     onPress: () => App.activate() },
      { separator: true },
      { id: 'count', label: `${active} active task${active === 1 ? '' : 's'}`, disabled: true },
      { separator: true },
      { id: 'quit',  label: 'Quit iExpo', shortcut: 'q', onPress: () => App.quit() },
    ]);
  }, [active]);

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
