import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

export const meta = { title: 'Notes', icon: '📝', tab: true, tabOrder: 0 };

export default function Notes(): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<string[]>([]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setNotes(prev => [text, ...prev]);
    setDraft('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Notes</Text>
      <Text style={styles.subheading}>
        Quick scratch-pad. Notes live in memory only — close the app and they're gone.
      </Text>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Jot something down…"
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={submit} activeOpacity={0.7}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {notes.length === 0 ? (
          <Text style={styles.empty}>No notes yet — type above and hit Add.</Text>
        ) : notes.map((n, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowText}>{n}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 24, gap: 16 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1d1d1f' },
  subheading: { fontSize: 13, color: '#86868b', marginBottom: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 4,
    paddingLeft: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  input: { flex: 1, fontSize: 14, color: '#1d1d1f', paddingVertical: 8 },
  addBtn: {
    backgroundColor: '#0a84ff',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 7,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  list: { flex: 1 },
  empty: { fontSize: 13, color: '#86868b', textAlign: 'center', paddingTop: 32 },
  row: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  rowText: { fontSize: 14, color: '#1d1d1f', lineHeight: 20 },
});
