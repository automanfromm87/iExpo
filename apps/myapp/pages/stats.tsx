import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePageFocus, useAppState } from 'iex/router';

export const meta = { title: 'Stats', icon: 'S', tab: true, tabOrder: 1 };

export default function Stats(): React.JSX.Element {
  const appState = useAppState();

  usePageFocus(() => {
    console.log('[Stats] focused');
  });

  return (
    <View style={styles.container}>
      <Text style={styles.section}>App Lifecycle</Text>
      <View style={styles.card}>
        <Text style={styles.label}>App State</Text>
        <View style={[styles.badge, { backgroundColor: appState === 'active' ? '#34c759' : '#ff9500' }]}>
          <Text style={styles.badgeText}>{appState}</Text>
        </View>
        <Text style={styles.hint}>
          Uses useAppState() hook.{'\n'}
          Minimize the app to see it change.
        </Text>
      </View>

      <Text style={styles.section}>Framework Features</Text>
      <View style={styles.card}>
        {[
          ['File routing', 'pages/index.tsx → /'],
          ['Dynamic routes', 'todo/[id].tsx → /todo/:id'],
          ['Layout', '_layout.tsx wraps all pages'],
          ['Explicit tabs', 'meta.tab: true'],
          ['Metadata', 'title, icon, headerShown'],
          ['Page lifecycle', 'usePageFocus, usePageBlur'],
          ['App lifecycle', 'useAppState, useAppForeground'],
        ].map(([name, desc], i) => (
          <View key={i} style={[styles.featureRow, i > 0 && styles.featureSep]}>
            <Text style={styles.featureName}>{name}</Text>
            <Text style={styles.featureDesc}>{desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  section: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  label: { fontSize: 14, color: '#8e8e93', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  badgeText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 13, color: '#c7c7cc', marginTop: 12, lineHeight: 18 },
  featureRow: { paddingVertical: 10 },
  featureSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e5ea' },
  featureName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  featureDesc: { fontSize: 13, color: '#8e8e93' },
});
