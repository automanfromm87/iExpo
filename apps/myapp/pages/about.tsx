import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

export const icon = 'i';

export default function About(): React.JSX.Element {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What is iExpo?</Text>
        <Text style={styles.body}>
          A minimal Expo-like development tool built entirely from scratch. It lets you write React Native apps with just TypeScript — no Xcode knowledge needed.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Architecture</Text>
        {[
          { label: 'CLI', color: '#FF3B30', desc: 'Rust binary — fast project setup and dev server management' },
          { label: 'RT', color: '#007AFF', desc: 'Pre-built iOS shell app with Hermes JS engine' },
          { label: 'Metro', color: '#FF9500', desc: 'Bundles your JS and pushes hot updates via WebSocket' },
          { label: 'Router', color: '#5856D6', desc: 'File-system routing — add a file, get a route' },
        ].map((item, i) => (
          <View key={i} style={styles.archRow}>
            <View style={[styles.badge, { backgroundColor: item.color }]}>
              <Text style={styles.badgeText}>{item.label}</Text>
            </View>
            <Text style={styles.archDesc}>{item.desc}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tech Stack</Text>
        <View style={styles.tags}>
          {['React Native', 'Hermes', 'Metro', 'TypeScript', 'Rust', 'Xcode'].map(t => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { padding: 20, paddingBottom: 40 },
  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  archRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  badge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
    marginRight: 12, minWidth: 56, alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  archDesc: { fontSize: 14, color: '#555', flex: 1, lineHeight: 20, paddingTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: '#f0f0f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, color: '#555', fontWeight: '500' },
});
