import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Platform, ScrollView } from 'react-native';
import { useNavigation, usePageFocus } from 'iex/router';
import { SFSymbol } from 'iex/macos';
import { useTodos } from '../../store/todos';

export const meta = { title: 'Task Detail', headerShown: true };

export default function TodoDetail(): React.JSX.Element {
  const { params, goBack } = useNavigation();
  const { getTodo, updateTodo, removeTodo, toggleTodo } = useTodos();

  const todo = getTodo(String(params.id));

  usePageFocus(() => {
    console.log(`[TodoDetail] viewing ${params.id}`);
  });

  if (!todo) {
    return (
      <View style={styles.container}>
        <View style={styles.missingCard}>
          <Text style={styles.missingTitle}>Task not found</Text>
          <Text style={styles.missingHint}>It may have been deleted. Use ⌘[ to go back.</Text>
        </View>
      </View>
    );
  }

  const onDelete = () => {
    Alert.alert('Delete task?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
          removeTodo(todo.id);
          goBack();
        } },
    ]);
  };

  const created = new Date(todo.createdAt);
  const createdLabel = created.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <TouchableOpacity
          style={[styles.statusBadge, todo.done && styles.statusBadgeDone]}
          onPress={() => toggleTodo(todo.id)}
          activeOpacity={0.7}
        >
          {todo.done && (Platform.OS === 'macos'
            ? <SFSymbol name="checkmark" size={11} weight="bold" color="#ffffff" />
            : <Text style={styles.statusBadgeMark}>✓</Text>)}
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.title, todo.done && styles.titleDone]}>{todo.text}</Text>
          <Text style={styles.subtitle}>
            {todo.done ? 'Completed' : 'Active'} · created {createdLabel}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>NOTES</Text>
        <View style={styles.notesCard}>
          <TextInput
            style={styles.notesInput}
            value={todo.notes ?? ''}
            onChangeText={text => updateTodo(todo.id, { notes: text })}
            multiline
            placeholder="Add notes…"
          />
        </View>
      </View>

      <TouchableOpacity style={styles.dangerBtn} onPress={onDelete} activeOpacity={0.7}>
        {Platform.OS === 'macos'
          ? <SFSymbol name="trash" size={13} weight="medium" color="#ff3b30" />
          : <Text style={styles.dangerIcon}>✕</Text>}
        <Text style={styles.dangerText}>Delete Task</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: { paddingHorizontal: 32, paddingVertical: 24, paddingBottom: 60 },

  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    marginBottom: 24,
  },
  statusBadge: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#c7c7cc',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadgeDone: { backgroundColor: '#34c759', borderColor: '#34c759' },
  statusBadgeMark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '600', color: '#1d1d1f' },
  titleDone: { color: '#a1a1a6', textDecorationLine: 'line-through' },
  subtitle: { fontSize: 12, color: '#86868b', marginTop: 4 },

  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', letterSpacing: 0.6, color: '#86868b',
    marginBottom: 8, paddingHorizontal: 4,
  },

  notesCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    padding: 12,
    minHeight: 140,
  },
  notesInput: {
    fontSize: 14, color: '#1d1d1f',
    minHeight: 116,
    textAlignVertical: 'top',
  },

  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  dangerIcon: { fontSize: 14, color: '#ff3b30' },
  dangerText: { fontSize: 13, color: '#ff3b30', fontWeight: '500' },

  missingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12, padding: 24,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
  },
  missingTitle: { fontSize: 16, fontWeight: '600', color: '#1d1d1f' },
  missingHint: { fontSize: 12, color: '#86868b', marginTop: 6 },
});
