import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from 'iex/router';
import { useTodoSelector } from '../store/todos';
import type { Todo } from '../store/todos';

export const meta = { title: 'Stats', icon: '◴', systemImage: 'chart.bar', tab: true, tabOrder: 1 };

interface Quote { content: string; author: string; }

async function fetchQuote(): Promise<Quote> {
  const res = await fetch('https://api.quotable.io/random');
  if (!res.ok) throw new Error(`quote API responded ${res.status}`);
  const data = await res.json();
  return { content: String(data.content ?? ''), author: String(data.author ?? 'Anonymous') };
}

export default function Stats(): React.JSX.Element {
  const appState = useAppState();
  const todos = useTodoSelector(s => s.todos);
  const active = todos.filter((t: Todo) => !t.done).length;
  const done = todos.filter((t: Todo) => t.done).length;
  const total = todos.length;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;

  const { data: quote, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['quote'],
    queryFn: fetchQuote,
    staleTime: 10000,
    retry: 1,
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Stats</Text>
        <Text style={styles.subheading}>A quick look at where you stand.</Text>
      </View>

      <View style={styles.grid}>
        <Tile color="#0a84ff" label="Total"      value={String(total)} />
        <Tile color="#ff9500" label="Active"     value={String(active)} />
        <Tile color="#34c759" label="Done"       value={String(done)} />
        <Tile color="#5856d6" label="Completion" value={`${completion}%`} />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardEyebrow}>QUOTE OF THE MOMENT</Text>
          <TouchableOpacity onPress={() => refetch()} activeOpacity={0.7}>
            <Text style={styles.refetch}>{isFetching ? '↻ refreshing' : '↻ refresh'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.quoteWrap}>
          {isLoading ? (
            <ActivityIndicator />
          ) : error ? (
            <Text style={styles.error}>
              Couldn’t reach quotable.io — {(error as Error).message}
            </Text>
          ) : quote ? (
            <>
              <Text style={styles.quote}>“{quote.content}”</Text>
              <Text style={styles.author}>— {quote.author}</Text>
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: appState === 'active' ? '#34c759' : '#ff9500' }]} />
          <Text style={styles.statusLabel}>App state</Text>
          <Text style={styles.statusValue}>{appState}</Text>
        </View>
      </View>
    </View>
  );
}

function Tile({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={[styles.tile, { borderTopColor: color }]}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 24 },

  header: { marginBottom: 20 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1d1d1f' },
  subheading: { fontSize: 13, color: '#86868b', marginTop: 4 },

  grid: { flexDirection: 'row', gap: 12, marginBottom: 16 },

  tile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  tileValue: { fontSize: 28, fontWeight: '700', color: '#1d1d1f' },
  tileLabel: {
    fontSize: 11, fontWeight: '500',
    color: '#86868b', marginTop: 4,
    letterSpacing: 0.4,
  },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardEyebrow: { fontSize: 10, fontWeight: '700', color: '#86868b', letterSpacing: 0.8 },
  refetch: { fontSize: 12, color: '#0a84ff', fontWeight: '500' },
  quoteWrap: { paddingVertical: 8, alignItems: 'center', minHeight: 60, justifyContent: 'center', gap: 6 },
  quote: { fontSize: 18, fontWeight: '500', color: '#1d1d1f', fontStyle: 'italic', textAlign: 'center' },
  author: { fontSize: 12, color: '#86868b', fontWeight: '500' },
  error: { fontSize: 12, color: '#ff3b30', textAlign: 'center', paddingHorizontal: 12 },

  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, color: '#86868b', flex: 1 },
  statusValue: { fontSize: 12, color: '#1d1d1f', fontWeight: '600' },
});
