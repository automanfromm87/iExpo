import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from 'iex/router';
import { useTodoSelector } from '../store/todos';
import type { Todo } from '../store/todos';

export const meta = { title: 'Stats', icon: 'S', tab: true, tabOrder: 1 };

async function fetchQuote(): Promise<string> {
  await new Promise(r => setTimeout(r, 600));
  const quotes = [
    'Ship it.',
    'Done is better than perfect.',
    'First, solve the problem.',
    'Keep it simple.',
    'Move fast.',
    'Stay hungry, stay foolish.',
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export default function Stats(): React.JSX.Element {
  const appState = useAppState();
  const todos = useTodoSelector(s => s.todos);
  const active = todos.filter((t: Todo) => !t.done).length;
  const done = todos.filter((t: Todo) => t.done).length;

  const { data: quote, isLoading, refetch } = useQuery({
    queryKey: ['quote'],
    queryFn: fetchQuote,
    staleTime: 10000,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.section}>Tasks Overview</Text>
      <View style={styles.row}>
        <StatCard label="Total" value={todos.length} color="#007AFF" />
        <StatCard label="Active" value={active} color="#ff9500" />
        <StatCard label="Done" value={done} color="#34c759" />
      </View>

      <Text style={styles.section}>useQuery Demo</Text>
      <View style={styles.card}>
        {isLoading ? (
          <ActivityIndicator style={{ padding: 20 }} />
        ) : (
          <Text style={styles.quote}>"{quote}"</Text>
        )}
        <TouchableOpacity style={styles.refetchBtn} onPress={() => refetch()}>
          <Text style={styles.refetchText}>Refetch</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>App State</Text>
      <View style={styles.card}>
        <View style={styles.stateRow}>
          <View style={[styles.dot, { backgroundColor: appState === 'active' ? '#34c759' : '#ff9500' }]} />
          <Text style={styles.stateText}>{appState}</Text>
        </View>
      </View>
    </View>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  section: { fontSize: 13, fontWeight: '600', color: '#8e8e93', marginTop: 16, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#8e8e93', marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  quote: { fontSize: 18, fontStyle: 'italic', color: '#333', textAlign: 'center' },
  refetchBtn: { marginTop: 12, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#007AFF' },
  refetchText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  stateRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  stateText: { fontSize: 16, fontWeight: '500' },
});
