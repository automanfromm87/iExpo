import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Link, usePageFocus } from 'iex/router';

export const meta = { title: 'Home', icon: 'H', tab: true, tabOrder: 0 };

const products = [
  { id: '1', name: 'React Native', color: '#61dafb' },
  { id: '2', name: 'TypeScript', color: '#3178c6' },
  { id: '3', name: 'Expo Modules', color: '#000020' },
];

export default function Home(): React.JSX.Element {
  usePageFocus(() => {
    console.log('[Home] focused');
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>iEx</Text>
        </View>
        <Text style={styles.title}>iExpo</Text>
        <Text style={styles.subtitle}>Instant React Native Development</Text>
      </View>

      <Text style={styles.section}>Dynamic Routes</Text>
      {products.map(p => (
        <Link key={p.id} to={`/product/${p.id}`} style={styles.productCard}>
          <View style={styles.productRow}>
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={styles.productName}>{p.name}</Text>
            <Text style={styles.arrow}>›</Text>
          </View>
        </Link>
      ))}

      <Text style={styles.section}>Navigation</Text>
      <Link to="/about" style={styles.linkCard}>
        <View style={styles.productRow}>
          <Text style={styles.linkLabel}>About iExpo</Text>
          <Text style={styles.arrow}>›</Text>
        </View>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingVertical: 28 },
  logoBox: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  logoText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#8e8e93', marginTop: 2 },
  section: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  productCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8 },
  productRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  productName: { flex: 1, fontSize: 16, fontWeight: '500' },
  arrow: { fontSize: 20, color: '#c7c7cc', fontWeight: '300' },
  linkCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  linkLabel: { flex: 1, fontSize: 16, color: '#007AFF', fontWeight: '500' },
});
