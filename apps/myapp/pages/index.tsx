import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert } from 'react-native';
import { Link, usePageFocus } from 'iex/router';

export const meta = { title: 'Tasks', icon: 'T', tab: true, tabOrder: 0 };

interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

let nextId = 1;

export default function Tasks(): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([
    { id: '0', text: 'Build the iExpo framework', done: true, createdAt: Date.now() - 86400000 },
    { id: '1', text: 'Implement file-system routing', done: true, createdAt: Date.now() - 3600000 },
    { id: '2', text: 'Add dynamic routes [id].tsx', done: false, createdAt: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');

  usePageFocus(() => {
    console.log(`[Tasks] ${todos.filter(t => !t.done).length} active`);
  });

  const addTodo = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setTodos(prev => [{ id: String(nextId++), text, done: false, createdAt: Date.now() }, ...prev]);
    setInput('');
  }, [input]);

  const toggle = useCallback((id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const remove = useCallback((id: string) => {
    Alert.alert('Delete', 'Remove this task?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => setTodos(prev => prev.filter(t => t.id !== id)) },
    ]);
  }, []);

  const filtered = todos.filter(t =>
    filter === 'all' ? true : filter === 'active' ? !t.done : t.done
  );
  const activeCount = todos.filter(t => !t.done).length;

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="What needs to be done?"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addTodo}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        {(['all', 'active', 'done'] as const).map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? `All (${todos.length})` : f === 'active' ? `Active (${activeCount})` : `Done (${todos.length - activeCount})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.todoRow}>
            <TouchableOpacity style={styles.todoContent} onPress={() => toggle(item.id)} activeOpacity={0.7}>
              <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                {item.done && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.todoText, item.done && styles.todoTextDone]}>{item.text}</Text>
            </TouchableOpacity>
            <Link to={`/todo/${item.id}`} style={styles.detailBtn}>
              <Text style={styles.detailBtnText}>›</Text>
            </Link>
            <TouchableOpacity onPress={() => remove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.deleteBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filter === 'all' ? 'No tasks yet. Add one above!' : `No ${filter} tasks.`}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inputRow: { flexDirection: 'row', padding: 16, gap: 8 },
  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 16, borderWidth: 1, borderColor: '#e5e5ea',
  },
  addBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, fontWeight: '500' },
  filters: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#e5e5ea' },
  filterActive: { backgroundColor: '#007AFF' },
  filterText: { fontSize: 13, fontWeight: '500', color: '#666' },
  filterTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  todoRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8,
  },
  todoContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#c7c7cc',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  checkboxDone: { backgroundColor: '#34c759', borderColor: '#34c759' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  todoText: { fontSize: 16, flex: 1 },
  todoTextDone: { textDecorationLine: 'line-through', color: '#8e8e93' },
  detailBtn: { paddingHorizontal: 8 },
  detailBtnText: { fontSize: 22, color: '#c7c7cc', fontWeight: '300' },
  deleteBtn: { fontSize: 16, color: '#ff3b30', paddingLeft: 4 },
  empty: { textAlign: 'center', color: '#8e8e93', marginTop: 40, fontSize: 15 },
});
