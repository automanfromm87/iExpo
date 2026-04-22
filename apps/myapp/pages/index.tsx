import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Link } from 'iex/router';

export const icon = 'H';

export default function Home(): React.JSX.Element {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>iEx</Text>
        </View>
        <Text style={styles.title}>iExpo</Text>
        <Text style={styles.subtitle}>Instant React Native Development</Text>
      </View>

      <View style={styles.cards}>
        <FeatureCard
          color="#5856D6"
          label="R"
          title="File-System Routing"
          desc="Add a file to pages/ and it becomes a route automatically."
        />
        <FeatureCard
          color="#FF9500"
          label="H"
          title="Hot Reload"
          desc="Edit any file, save, and see changes instantly on device."
        />
        <FeatureCard
          color="#007AFF"
          label="T"
          title="TypeScript"
          desc="Full TypeScript support with zero configuration."
        />
      </View>

      <Link to="/about" style={styles.linkCard}>
        <View style={styles.linkRow}>
          <Text style={styles.linkLabel}>Learn more about iExpo</Text>
          <Text style={styles.linkArrow}>›</Text>
        </View>
      </Link>
    </ScrollView>
  );
}

function FeatureCard({ color, label, title, desc }: {
  color: string; label: string; title: string; desc: string;
}): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={[styles.cardBadge, { backgroundColor: color }]}>
        <Text style={styles.cardBadgeText}>{label}</Text>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingVertical: 32 },
  logoBox: {
    width: 64, height: 64, borderRadius: 16,
    backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center',
    marginBottom: 12,
  },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: '#8e8e93', marginTop: 4 },
  cards: { gap: 12, marginTop: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardBadge: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  cardBadgeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  cardDesc: { fontSize: 14, color: '#666', lineHeight: 20 },
  linkCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 12,
  },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkLabel: { fontSize: 16, color: '#007AFF', fontWeight: '500' },
  linkArrow: { fontSize: 22, color: '#007AFF', fontWeight: '300' },
});
