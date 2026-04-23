import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, usePageFocus, usePageBlur } from 'iex/router';
import clipboard from 'iex/clipboard';

export const meta = { title: 'Task Detail', headerShown: true };

export default function TodoDetail(): React.JSX.Element {
  const { params } = useNavigation();

  usePageFocus(() => {
    console.log(`[TodoDetail] viewing task #${params.id}`);
  });

  usePageBlur(() => {
    console.log(`[TodoDetail] leaving task #${params.id}`);
  });

  const handleCopy = async () => {
    clipboard.setString(`Task #${params.id}`);
    Alert.alert('Copied', `"Task #${params.id}" copied to clipboard`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Task ID</Text>
        <Text style={styles.value}>#{params.id}</Text>
      </View>

      <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
        <Text style={styles.copyText}>Copy Task ID</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Dynamic route: /todo/:id{'\n'}
        Uses usePageFocus, usePageBlur, and iex/clipboard
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 30 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  label: { fontSize: 13, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  value: { fontSize: 36, fontWeight: '800', color: '#007AFF' },
  copyBtn: {
    marginTop: 16, backgroundColor: '#007AFF', borderRadius: 12, padding: 14, alignItems: 'center',
  },
  copyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 13, color: '#c7c7cc', textAlign: 'center', marginTop: 24, lineHeight: 20 },
});
