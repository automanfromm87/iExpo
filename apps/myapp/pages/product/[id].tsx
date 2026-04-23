import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, usePageFocus, usePageBlur, Link } from 'iex/router';

export const meta = { title: 'Product', headerShown: true };

const productData: Record<string, { name: string; color: string; desc: string }> = {
  '1': { name: 'React Native', color: '#61dafb', desc: 'Build native apps using React.' },
  '2': { name: 'TypeScript', color: '#3178c6', desc: 'Typed JavaScript at any scale.' },
  '3': { name: 'Expo Modules', color: '#000020', desc: 'Native modules with a simple API.' },
};

export default function ProductDetail(): React.JSX.Element {
  const { params } = useNavigation();
  const product = productData[params.id];

  usePageFocus(() => {
    console.log(`[Product] ${params.id} focused`);
  });

  usePageBlur(() => {
    console.log(`[Product] ${params.id} blurred`);
  });

  return (
    <View style={styles.container}>
      <View style={[styles.card, { borderLeftColor: product?.color ?? '#ccc' }]}>
        <Text style={styles.id}>#{params.id}</Text>
        <Text style={styles.name}>{product?.name ?? 'Unknown'}</Text>
        <Text style={styles.desc}>{product?.desc ?? 'No data for this ID.'}</Text>
      </View>

      <View style={styles.nav}>
        {['1', '2', '3'].filter(id => id !== params.id).map(id => (
          <Link key={id} to={`/product/${id}`} style={styles.navBtn}>
            <Text style={styles.navText}>View #{id}</Text>
          </Link>
        ))}
      </View>

      <Text style={styles.hint}>Dynamic route: /product/:id</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 30 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  id: { fontSize: 14, color: '#8e8e93', marginBottom: 4 },
  name: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  desc: { fontSize: 15, color: '#666', lineHeight: 22 },
  nav: { flexDirection: 'row', gap: 8, marginTop: 20 },
  navBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center' },
  navText: { fontSize: 14, color: '#007AFF', fontWeight: '600' },
  hint: { fontSize: 12, color: '#c7c7cc', textAlign: 'center', marginTop: 24 },
});
