import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  SafeAreaView, StatusBar, useWindowDimensions, AppState, Platform,
} from 'react-native';
import { Vibrancy, SFSymbol } from './macos';
import { useColorScheme } from './appearance';

const IS_MAC = Platform.OS === 'macos';

// ─── Types ───

export interface RouteMeta {
  title?: string;
  icon?: string;
  systemImage?: string;
  tab?: boolean;
  tabOrder?: number;
  headerShown?: boolean;
  statusBarStyle?: 'dark-content' | 'light-content';
  presentation?: 'card' | 'modal';
  gestureEnabled?: boolean;
}

interface Route {
  path: string;
  component: React.ComponentType<any>;
  meta: RouteMeta;
  layouts?: React.ComponentType<{ children: React.ReactNode }>[];
}

interface NavigationContext {
  navigate: (path: string, params?: Record<string, any>) => void;
  goBack: () => void;
  currentPath: string;
  params: Record<string, any>;
}

interface PageLifecycle {
  isFocused: boolean;
}

// ─── Contexts ───

const NavContext = createContext<NavigationContext>({
  navigate: () => {},
  goBack: () => {},
  currentPath: '/',
  params: {},
});

const LifecycleContext = createContext<PageLifecycle>({ isFocused: false });

// ─── Navigation hooks ───

export function useNavigation(): NavigationContext {
  return useContext(NavContext);
}

// ─── Page lifecycle hooks ───

export function usePageFocus(callback: () => void | (() => void)): void {
  const { isFocused } = useContext(LifecycleContext);
  const prev = useRef(false);
  useEffect(() => {
    if (isFocused && !prev.current) {
      const cleanup = callback();
      prev.current = true;
      return typeof cleanup === 'function' ? cleanup : undefined;
    }
    prev.current = isFocused;
  }, [isFocused]);
}

export function usePageBlur(callback: () => void): void {
  const { isFocused } = useContext(LifecycleContext);
  const prev = useRef(true);
  useEffect(() => {
    if (!isFocused && prev.current) {
      callback();
    }
    prev.current = isFocused;
  }, [isFocused]);
}

// ─── App lifecycle hooks ───

export function useAppState(): 'active' | 'background' | 'inactive' | 'unknown' | 'extension' {
  const [state, setState] = useState(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', setState);
    return () => sub.remove();
  }, []);
  return state;
}

export function useAppForeground(callback: () => void): void {
  const prev = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && prev.current !== 'active') {
        callback();
      }
      prev.current = next;
    });
    return () => sub.remove();
  }, []);
}

export function useAppBackground(callback: () => void): void {
  const prev = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background' && prev.current === 'active') {
        callback();
      }
      prev.current = next;
    });
    return () => sub.remove();
  }, []);
}

// ─── Path matching ───

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/');
  const tp = path.split('/');
  if (pp.length !== tp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) {
      params[pp[i].slice(1)] = decodeURIComponent(tp[i]);
    } else if (pp[i] !== tp[i]) {
      return null;
    }
  }
  return params;
}

function findRoute(routes: Route[], path: string): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.path === path) return { route, params: {} };
  }
  for (const route of routes) {
    if (route.path.includes(':')) {
      const params = matchPath(route.path, path);
      if (params) return { route, params };
    }
  }
  return null;
}

// ─── Layout nesting ───

function wrapWithLayouts(
  layouts: React.ComponentType<{ children: React.ReactNode }>[] | undefined,
  page: React.JSX.Element,
): React.JSX.Element {
  if (!layouts || layouts.length === 0) return page;
  return layouts.reduceRight<React.JSX.Element>(
    (child, Layout) => <Layout>{child}</Layout>,
    page,
  );
}

// ─── Router ───

interface RouterProps {
  routes: Route[];
  /// Optional brand label rendered in the macOS sidebar header. Hub mode passes
  /// the running app's display name so the sidebar reflects "which app am I in"
  /// rather than the platform name. Falls back to "iExpo" for legacy callers.
  brand?: string;
}

export function Router({ routes, brand }: RouterProps): React.JSX.Element {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const scheme = useColorScheme();

  const tabRoutes = useMemo(
    () => routes
      .filter(r => r.meta?.tab)
      .sort((a, b) => (a.meta?.tabOrder ?? 99) - (b.meta?.tabOrder ?? 99)),
    [routes]
  );
  const tabPaths = useMemo(() => new Set(tabRoutes.map(r => r.path)), [tabRoutes]);

  const [stack, setStack] = useState<Array<{ path: string; params: Record<string, any> }>>([
    { path: tabRoutes[0]?.path ?? '/', params: {} },
  ]);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const current = stack[stack.length - 1];
  const currentMatch = findRoute(routes, current.path);

  const navigate = useCallback((path: string, navParams?: Record<string, any>) => {
    const match = findRoute(routes, path);
    if (!match) {
      console.warn(`[iex] Route not found: ${path}`);
      return;
    }
    const mergedParams = { ...match.params, ...navParams };
    const isTab = tabPaths.has(match.route.path);

    if (isTab) {
      setStack([{ path: match.route.path, params: mergedParams }]);
      slideAnim.setValue(0);
    } else {
      const isModal = match.route.meta?.presentation === 'modal';
      const distance = isModal ? SCREEN_HEIGHT : SCREEN_WIDTH;
      slideAnim.setValue(distance);
      setStack(prev => [...prev, { path, params: mergedParams }]);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [routes, tabPaths, slideAnim, SCREEN_WIDTH, SCREEN_HEIGHT]);

  const goBack = useCallback(() => {
    if (stack.length <= 1) return;
    const currentRoute = findRoute(routes, stack[stack.length - 1].path);
    if (currentRoute?.route.meta?.gestureEnabled === false) return;

    const isModal = currentRoute?.route.meta?.presentation === 'modal';
    const distance = isModal ? SCREEN_HEIGHT : SCREEN_WIDTH;
    Animated.timing(slideAnim, { toValue: distance, duration: 220, useNativeDriver: true }).start(() => {
      setStack(p => p.slice(0, -1));
      slideAnim.setValue(0);
    });
  }, [stack, routes, slideAnim, SCREEN_WIDTH, SCREEN_HEIGHT]);

  if (!currentMatch) {
    return <SafeAreaView style={s.container}><Text style={s.err}>404 — {current.path}</Text></SafeAreaView>;
  }

  const { route: currentRoute } = currentMatch;
  const activeMeta = currentRoute.meta ?? {};
  const headerShown = activeMeta.headerShown !== false;
  const barStyle = activeMeta.statusBarStyle ?? 'dark-content';
  const title = activeMeta.title ?? routeTitle(current.path);
  const canGoBack = stack.length > 1;

  const activeTabPath = stack[0].path;
  const stackRoute = canGoBack ? findRoute(routes, current.path) : null;
  const StackPage = stackRoute?.route.component;
  const stackLayouts = stackRoute?.route.layouts;
  const isModal = stackRoute?.route.meta?.presentation === 'modal';

  const pageContent = (
    <View style={s.screen}>
      {tabRoutes.map(route => {
        const isFocused = activeTabPath === route.path && !canGoBack;
        const Page = route.component;
        return (
          <View
            key={route.path}
            style={[StyleSheet.absoluteFill, { display: activeTabPath === route.path ? 'flex' : 'none' }]}
          >
            <LifecycleContext.Provider value={{ isFocused }}>
              {wrapWithLayouts(route.layouts, <Page />)}
            </LifecycleContext.Provider>
          </View>
        );
      })}

      {StackPage && canGoBack && (
        <Animated.View style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isModal ? 'rgba(0,0,0,0.4)' : '#f2f2f7' },
          { transform: [isModal ? { translateY: slideAnim } : { translateX: slideAnim }] },
        ]}>
          <LifecycleContext.Provider value={{ isFocused: true }}>
            {wrapWithLayouts(stackLayouts, <StackPage />)}
          </LifecycleContext.Provider>
        </Animated.View>
      )}
    </View>
  );

  const navContext = { navigate, goBack, currentPath: current.path, params: current.params };

  if (IS_MAC) {
    const isDark = scheme === 'dark';
    const contentBg = isDark ? '#1e1e1e' : '#ffffff';
    const brandColor = isDark ? '#f5f5f7' : '#1d1d1f';
    return (
      <NavContext.Provider value={navContext}>
        <View style={mac.shell}>
          <Vibrancy material="sidebar" style={mac.sidebar}>
            <View style={mac.sidebarHeader}>
              <Text style={[mac.sidebarBrand, { color: brandColor }]}>{brand ?? 'iExpo'}</Text>
            </View>
            {tabRoutes.map(route => (
              <SidebarRow
                key={route.path}
                meta={route.meta ?? {}}
                title={route.meta?.title || routeTitle(route.path)}
                active={stack[0].path === route.path}
                isDark={isDark}
                onPress={() => navigate(route.path)}
              />
            ))}
          </Vibrancy>

          <View style={[mac.content, { backgroundColor: contentBg }]}>
            {pageContent}
          </View>
        </View>
      </NavContext.Provider>
    );
  }

  return (
    <NavContext.Provider value={navContext}>
      <View style={s.container}>
        <StatusBar barStyle={barStyle} />

        {headerShown && (
          <SafeAreaView style={s.safeTop}>
            <View style={s.header}>
              <View style={s.headerSide}>
                {canGoBack && (
                  <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={s.back}>‹ Back</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
              <View style={s.headerSide} />
            </View>
          </SafeAreaView>
        )}

        {pageContent}

        {tabRoutes.length > 0 && (
          <SafeAreaView style={s.safeBottom}>
            <View style={s.tabBar}>
              {tabRoutes.map(route => {
                const active = current.path === route.path || (stack[0].path === route.path && stack.length > 1);
                const tabMeta = route.meta ?? {};
                return (
                  <TouchableOpacity key={route.path} style={s.tab} onPress={() => navigate(route.path)} activeOpacity={0.6}>
                    <View style={[s.tabIconBox, active && s.tabIconBoxActive]}>
                      <Text style={[s.tabIconText, active && s.tabIconTextActive]}>
                        {tabMeta.icon || '*'}
                      </Text>
                    </View>
                    <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                      {tabMeta.title || routeTitle(route.path)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SafeAreaView>
        )}
      </View>
    </NavContext.Provider>
  );
}

const mac = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row' },

  sidebar: {
    width: 200,
    paddingTop: 36,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.08)',
  },
  sidebarHeader: { paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  sidebarBrand: { fontSize: 13, fontWeight: '700', color: '#1d1d1f', letterSpacing: 0.4 },

  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    marginBottom: 2,
  },
  sideRowHover: { backgroundColor: 'rgba(0,0,0,0.05)' },
  sideRowHoverDark: { backgroundColor: 'rgba(255,255,255,0.07)' },
  sideRowActive: { backgroundColor: '#0a84ff' },
  sideIcon: { fontSize: 14, color: '#86868b', width: 16, textAlign: 'center' },
  sideIconBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  sideIconActive: { color: '#ffffff' },
  sideLabel: { fontSize: 13, color: '#1d1d1f', fontWeight: '500' },
  sideLabelActive: { color: '#ffffff', fontWeight: '600' },

  content: { flex: 1, backgroundColor: '#ffffff' },
});

function SidebarRow({ meta, title, active, isDark, onPress }: {
  meta: RouteMeta; title: string; active: boolean; isDark?: boolean; onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const idleIcon = isDark ? '#a1a1a6' : '#86868b';
  const idleLabel = isDark ? '#f5f5f7' : '#1d1d1f';
  const rowStyle = [
    mac.sideRow,
    !active && hovered && (isDark ? mac.sideRowHoverDark : mac.sideRowHover),
    active && mac.sideRowActive,
  ];
  return (
    <TouchableOpacity
      style={rowStyle as any}
      onPress={onPress}
      activeOpacity={0.7}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      {meta.systemImage
        ? <SFSymbol name={meta.systemImage} size={13} weight="medium"
                    color={active ? '#ffffff' : idleIcon} style={mac.sideIconBox} />
        : <Text style={[mac.sideIcon, { color: active ? '#ffffff' : idleIcon }]}>{meta.icon || '•'}</Text>}
      <Text style={[mac.sideLabel, { color: active ? '#ffffff' : idleLabel },
                    active && mac.sideLabelActive]}>{title}</Text>
    </TouchableOpacity>
  );
}

function routeTitle(path: string): string {
  if (path === '/') return 'Home';
  const last = path.split('/').filter(s => s && !s.startsWith(':')).pop() || '';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// ─── Link ───

interface LinkProps {
  to: string;
  params?: Record<string, any>;
  children: React.ReactNode;
  style?: any;
}

export function Link({ to, params, children, style }: LinkProps): React.JSX.Element {
  const { navigate } = useNavigation();
  return (
    <TouchableOpacity onPress={() => navigate(to, params)} style={style} activeOpacity={0.7}>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </TouchableOpacity>
  );
}

// ─── Styles ───

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  safeTop: { backgroundColor: '#fff' },
  safeBottom: { backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 16, backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#000', flex: 1, textAlign: 'center' },
  headerSide: { width: 72 },
  back: { fontSize: 17, color: '#007AFF' },
  screen: { flex: 1 },
  err: { fontSize: 18, color: '#ff3b30', textAlign: 'center', marginTop: 100 },
  tabBar: {
    flexDirection: 'row', height: 50,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#fff',
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  tabIconBox: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#e5e5ea', justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  tabIconBoxActive: { backgroundColor: '#007AFF' },
  tabIconText: { fontSize: 12, fontWeight: '700', color: '#8e8e93' },
  tabIconTextActive: { color: '#fff' },
  tabLabel: { fontSize: 10, color: '#8e8e93', letterSpacing: 0.1 },
  tabLabelActive: { color: '#007AFF', fontWeight: '600' },
});
