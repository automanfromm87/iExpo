import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  SafeAreaView, StatusBar, useWindowDimensions,
} from 'react-native';


// ─── Types ───

interface Route {
  name: string;
  path: string;
  icon?: string;
  component: React.ComponentType<any>;
}

interface NavigationContext {
  navigate: (path: string, params?: Record<string, any>) => void;
  goBack: () => void;
  currentPath: string;
  params: Record<string, any>;
}

// ─── Context ───

const NavContext = createContext<NavigationContext>({
  navigate: () => {},
  goBack: () => {},
  currentPath: '/',
  params: {},
});

export function useNavigation(): NavigationContext {
  return useContext(NavContext);
}

// ─── Router ───

interface RouterProps {
  routes: Route[];
}

export function Router({ routes }: RouterProps): React.JSX.Element {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const routeMap = useRef(new Map(routes.map(r => [r.path, r]))).current;
  const tabRoutes = useMemo(
    () => routes.filter(r => r.path === '/' || (r.path.match(/\//g) || []).length === 1),
    [routes]
  );
  const tabSet = useMemo(() => new Set(tabRoutes.map(r => r.path)), [tabRoutes]);

  const [stack, setStack] = useState<string[]>(['/']);
  const [params, setParams] = useState<Record<string, Record<string, any>>>({});
  const slideAnim = useRef(new Animated.Value(0)).current;

  const currentPath = stack[stack.length - 1];

  const navigate = useCallback((path: string, navParams?: Record<string, any>) => {
    if (!routeMap.has(path)) {
      console.warn(`[iex] Route not found: ${path}`);
      return;
    }
    const isTab = tabSet.has(path);
    if (isTab) {
      setStack([path]);
      setParams(prev => ({ ...prev, [path]: navParams || {} }));
      slideAnim.setValue(0);
    } else {
      slideAnim.setValue(SCREEN_WIDTH);
      setStack(prev => [...prev, path]);
      setParams(prev => ({ ...prev, [path]: navParams || {} }));
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [routeMap, tabSet, slideAnim, SCREEN_WIDTH]);

  const goBack = useCallback(() => {
    setStack(prev => {
      if (prev.length <= 1) return prev;
      Animated.timing(slideAnim, { toValue: SCREEN_WIDTH, duration: 220, useNativeDriver: true }).start(() => {
        setStack(p => p.slice(0, -1));
        slideAnim.setValue(0);
      });
      return prev;
    });
  }, [slideAnim, SCREEN_WIDTH]);

  const currentRoute = routeMap.get(currentPath);
  const prevRoute = stack.length > 1 ? routeMap.get(stack[stack.length - 2]) : null;

  if (!currentRoute) {
    return <SafeAreaView style={s.container}><Text style={s.err}>404 — {currentPath}</Text></SafeAreaView>;
  }

  const CurrentPage = currentRoute.component;
  const PrevPage = prevRoute?.component;
  const canGoBack = stack.length > 1;
  const isTabRoute = tabSet.has(currentPath);

  return (
    <NavContext.Provider value={{ navigate, goBack, currentPath, params: params[currentPath] || {} }}>
      <View style={s.container}>
        <StatusBar barStyle="dark-content" />
        <SafeAreaView style={s.safeTop}>
          <View style={s.header}>
            <View style={s.headerSide}>
              {canGoBack && (
                <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={s.back}>‹ Back</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.headerTitle} numberOfLines={1}>{currentRoute.name}</Text>
            <View style={s.headerSide} />
          </View>
        </SafeAreaView>

        <View style={s.screen}>
          {PrevPage && canGoBack && (
            <View style={StyleSheet.absoluteFill}><PrevPage /></View>
          )}
          <Animated.View style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#f2f2f7' },
            canGoBack && !isTabRoute ? { transform: [{ translateX: slideAnim }] } : undefined,
          ]}>
            <CurrentPage />
          </Animated.View>
        </View>

        <SafeAreaView style={s.safeBottom}>
          <View style={s.tabBar}>
            {tabRoutes.map(route => {
              const active = currentPath === route.path || (stack[0] === route.path && stack.length > 1);
              return (
                <TouchableOpacity key={route.path} style={s.tab} onPress={() => navigate(route.path)} activeOpacity={0.6}>
                  <View style={[s.tabIconBox, active && s.tabIconBoxActive]}>
                    <Text style={[s.tabIconText, active && s.tabIconTextActive]}>{route.icon || '*'}</Text>
                  </View>
                  <Text style={[s.tabLabel, active && s.tabLabelActive]}>{route.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      </View>
    </NavContext.Provider>
  );
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.15)',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  headerSide: { width: 72 },
  back: { fontSize: 17, color: '#007AFF' },
  screen: { flex: 1 },
  err: { fontSize: 18, color: '#ff3b30', textAlign: 'center', marginTop: 100 },
  tabBar: {
    flexDirection: 'row',
    height: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.15)',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  tabIconBox: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#e5e5ea', justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  tabIconBoxActive: { backgroundColor: '#007AFF' },
  tabIconText: { fontSize: 12, fontWeight: '700', color: '#8e8e93' },
  tabIconTextActive: { color: '#fff' },
  tabLabel: { fontSize: 10, color: '#8e8e93', letterSpacing: 0.1 },
  tabLabelActive: { color: '#007AFF', fontWeight: '600' },
});
