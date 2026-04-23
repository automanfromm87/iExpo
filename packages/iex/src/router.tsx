import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  SafeAreaView, StatusBar, useWindowDimensions,
} from 'react-native';

// ─── Types ───

interface RouteMeta {
  title?: string;
  icon?: string;
  tab?: boolean;
  tabOrder?: number;
  headerShown?: boolean;
  statusBarStyle?: 'dark-content' | 'light-content';
}

interface Route {
  path: string;
  component: React.ComponentType<any>;
  meta: RouteMeta;
  layout?: React.ComponentType<{ children: React.ReactNode }>;
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

// ─── Hooks ───

export function useNavigation(): NavigationContext {
  return useContext(NavContext);
}

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

// ─── Router ───

interface RouterProps {
  routes: Route[];
}

export function Router({ routes }: RouterProps): React.JSX.Element {
  const { width: SCREEN_WIDTH } = useWindowDimensions();

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
      slideAnim.setValue(SCREEN_WIDTH);
      setStack(prev => [...prev, { path, params: mergedParams }]);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [routes, tabPaths, slideAnim, SCREEN_WIDTH]);

  const goBack = useCallback(() => {
    if (stack.length <= 1) return;
    Animated.timing(slideAnim, { toValue: SCREEN_WIDTH, duration: 220, useNativeDriver: true }).start(() => {
      setStack(p => p.slice(0, -1));
      slideAnim.setValue(0);
    });
  }, [stack.length, slideAnim, SCREEN_WIDTH]);

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
  const StackLayout = stackRoute?.route.layout;

  const pageContent = (
    <View style={s.screen}>
      {tabRoutes.map(route => {
        const isFocused = activeTabPath === route.path && !canGoBack;
        const Layout = route.layout;
        const Page = route.component;
        return (
          <View
            key={route.path}
            style={[StyleSheet.absoluteFill, { display: activeTabPath === route.path ? 'flex' : 'none' }]}
          >
            <LifecycleContext.Provider value={{ isFocused }}>
              {Layout ? <Layout><Page /></Layout> : <Page />}
            </LifecycleContext.Provider>
          </View>
        );
      })}

      {StackPage && canGoBack && (
        <Animated.View style={[
          StyleSheet.absoluteFill,
          { backgroundColor: '#f2f2f7' },
          { transform: [{ translateX: slideAnim }] },
        ]}>
          <LifecycleContext.Provider value={{ isFocused: true }}>
            {StackLayout ? <StackLayout><StackPage /></StackLayout> : <StackPage />}
          </LifecycleContext.Provider>
        </Animated.View>
      )}
    </View>
  );

  return (
    <NavContext.Provider value={{ navigate, goBack, currentPath: current.path, params: current.params }}>
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
