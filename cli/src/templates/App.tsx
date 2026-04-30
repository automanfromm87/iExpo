import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, StyleSheet, SafeAreaView, StatusBar,
} from 'react-native';

interface Item {
  id: string;
  text: string;
  done: boolean;
}

export default function App(): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([
    { id: '1', text: 'Welcome to iExpo! 🎉', done: false },
    { id: '2', text: 'Now with TypeScript! 🔷', done: false },
    { id: '3', text: 'Save the file — hot reload!', done: false },
  ]);
  const [input, setInput] = useState<string>('');

  const addItem = (): void => {
    if (!input.trim()) return;
    setItems(prev => [{ id: Date.now().toString(), text: input.trim(), done: false }, ...prev]);
    setInput('');
  };

  const toggleItem = (id: string): void => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  };

  const deleteItem = (id: string): void => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>My App</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Add something..."
          value={input}
          onChangeText={setInput}
          onSubmitEditing={addItem}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addItem}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i: Item) => i.id}
        renderItem={({ item }: { item: Item }) => (
          <View style={styles.item}>
            <TouchableOpacity onPress={() => toggleItem(item.id)} style={styles.itemContent}>
              <Text style={[styles.itemText, item.done && styles.done]}>
                {item.done ? '✅ ' : '⬜ '}{item.text}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteItem(item.id)}>
              <Text style={styles.deleteBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        style={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 20, marginBottom: 16 },
  inputRow: { flexDirection: 'row', marginBottom: 16 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff',
  },
  addBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#007AFF',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  addBtnText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  list: { flex: 1 },
  item: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    padding: 16, borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  itemContent: { flex: 1 },
  itemText: { fontSize: 16 },
  done: { textDecorationLine: 'line-through', color: '#999' },
  deleteBtn: { fontSize: 18, color: '#ff3b30', paddingLeft: 12 },
});
