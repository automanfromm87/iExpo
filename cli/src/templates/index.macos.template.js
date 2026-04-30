// macOS shell entry — counter demo exercising style, dynamic update, and onPress.
const React = require('react');
const { useState, useEffect, createElement: e } = React;
const { render, View, Text } = require('./iex-runtime');

function Counter() {
  const [count, setCount] = useState(0);
  const [autoTick, setAutoTick] = useState(true);

  useEffect(() => {
    if (!autoTick) return;
    const id = setInterval(() => setCount(c => c + 1), 1000);
    return () => clearInterval(id);
  }, [autoTick]);

  return e(View, { style: { padding: 24, gap: 12 } },
    e(Text, { style: { fontSize: 28, fontWeight: 'bold', color: '#007AFF' } },
      `Count: ${count}`),
    e(Text, { style: { fontSize: 13, color: '#8e8e93' } },
      autoTick ? 'Auto-incrementing every second.' : 'Paused.'),
    e(View, {
      style: {
        backgroundColor: autoTick ? '#ff3b30' : '#34c759',
        padding: 12,
        borderRadius: 8,
      },
      onPress: () => setAutoTick(t => !t),
    },
      e(Text, { style: { color: '#fff', fontWeight: '600' } },
        autoTick ? 'Click to pause' : 'Click to resume')
    ),
    e(View, {
      style: { backgroundColor: '#5856d6', padding: 12, borderRadius: 8 },
      onPress: () => setCount(0),
    },
      e(Text, { style: { color: '#fff', fontWeight: '600' } }, 'Reset')
    )
  );
}

render(e(Counter));
