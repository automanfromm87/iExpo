import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { usePageFocus, usePageBlur } from 'iex/router';

export const meta = { title: 'About', icon: 'i', tab: true, tabOrder: 1 };

export default function About(): React.JSX.Element {
  const [visits, setVisits] = useState(0);

  usePageFocus(() => {
    setVisits(v => v + 1);
    console.log('[About] focused');
  });

  usePageBlur(() => {
    console.log('[About] blurred');
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>iExpo Framework</Text>
        <Text style={styles.cardDesc}>
          A lightweight React Native development tool with file-system routing, layout support, and dynamic routes.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lifecycle Demo</Text>
        <Text style={styles.cardDesc}>
          This page uses usePageFocus and usePageBlur hooks.
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Visits: {visits}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Features</Text>
        {[
          'File-system routing (pages/)',
          'Layout system (_layout.tsx)',
          'Dynamic routes ([id].tsx)',
          'Explicit tab declaration (meta.tab)',
          'Page metadata (meta.title, icon, ...)',
          'Lifecycle hooks (usePageFocus, usePageBlur)',
        ].map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  cardDesc: { fontSize: 14, color: '#666', lineHeight: 20 },
  badge: {
    marginTop: 12, alignSelf: 'flex-start',
    backgroundColor: '#007AFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  check: { fontSize: 14, color: '#34c759', marginRight: 8, fontWeight: '700' },
  featureText: { fontSize: 14, color: '#333' },
});
