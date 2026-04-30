import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Link } from 'iex/router';

export const meta = { title: 'Hello', icon: '👋', tab: true, tabOrder: 0 };

export default function Home(): React.JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Hello, iExpo 👋</Text>
      <Text style={styles.subheading}>
        A minimal app running inside the iExpo platform.
      </Text>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => setCount(c => c + 1)}
        activeOpacity={0.7}
      >
        <Text style={styles.btnText}>Tapped {count} time{count === 1 ? '' : 's'}</Text>
      </TouchableOpacity>

      <Link to="/about" style={styles.link}>
        <Text style={styles.linkText}>About this app →</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  heading: { fontSize: 32, fontWeight: '700', color: '#1d1d1f' },
  subheading: { fontSize: 14, color: '#86868b', textAlign: 'center' },
  btn: {
    backgroundColor: '#0a84ff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  link: { marginTop: 8 },
  linkText: { color: '#0a84ff', fontSize: 14, fontWeight: '500' },
});
