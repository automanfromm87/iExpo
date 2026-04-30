import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Platform, Animated } from 'react-native';
import { Link, usePageFocus } from 'iex/router';
import { ContextMenu, Menu, useDraggable, SFSymbol } from 'iex/macos';
import { FS } from 'iex/fs';
import { useTodos, type Todo } from '../store/todos';

export const meta = { title: 'Tasks', icon: '✓', systemImage: 'checklist', tab: true, tabOrder: 0 };

export default function Tasks(): React.JSX.Element {
  const { todos, addTodo, toggleTodo, removeTodo, reorderTodo } = useTodos();
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const [search, setSearch] = useState('');
  const inputRef = useRef<any>(null);
  const searchRef = useRef<any>(null);

  usePageFocus(() => {
    console.log(`[Tasks] ${todos.filter(t => !t.done).length} active`);
  });

  useEffect(() => {
    if (Platform.OS !== 'macos') return;
    const subs = [
      Menu.addItem({ menu: 'File', label: 'New Task', shortcut: '⌘N',
        onPress: () => inputRef.current?.focus() }),
      Menu.addItem({ menu: 'Edit', label: 'Find',     shortcut: '⌘F',
        onPress: () => searchRef.current?.focus() }),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    addTodo(text);
    setInput('');
  };

  const confirmRemove = (id: string) => {
    Alert.alert('Delete task?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeTodo(id) },
    ]);
  };

  const onFileDrop = async (paths: string[]) => {
    let added = 0;
    for (const p of paths) {
      const ext = FS.path.extname(p).toLowerCase();
      try {
        if (ext === '.txt' || ext === '.md') {
          const lines = (await FS.readText(p))
            .split('\n').map(l => l.trim()).filter(Boolean);
          for (const line of lines) { addTodo(line); added++; }
        } else if (ext === '.json') {
          const data = JSON.parse(await FS.readText(p));
          if (Array.isArray(data?.todos)) {
            for (const t of data.todos) {
              if (typeof t?.text === 'string' && t.text) { addTodo(t.text); added++; }
            }
          }
        } else {
          addTodo(`📎 ${FS.path.basename(p)}`);
          added++;
        }
      } catch (e) {
        console.warn('[Tasks] drop failed for', p, e);
      }
    }
    if (added === 0) Alert.alert('Nothing imported', 'No usable content in dropped files.');
  };

  const filtered = todos.filter(t => {
    const filterOk = filter === 'all' ? true : filter === 'active' ? !t.done : t.done;
    if (!filterOk) return false;
    if (!search.trim()) return true;
    return t.text.toLowerCase().includes(search.toLowerCase());
  });
  const activeCount = todos.filter(t => !t.done).length;
  const doneCount = todos.length - activeCount;
  const canAdd = input.trim().length > 0;

  return (
    <View style={styles.container} onFileDrop={onFileDrop}>
      <View style={styles.header}>
        <Text style={styles.heading}>Tasks</Text>
        <Text style={styles.subheading}>
          {activeCount === 0
            ? 'All caught up. Nice work.'
            : `${activeCount} ${activeCount === 1 ? 'item' : 'items'} remaining`}
          {'  ·  drop a .txt or .json here to import'}
        </Text>
      </View>

      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="What needs doing?"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={submit}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addBtn, !canAdd && styles.addBtnOff]}
          onPress={submit}
          activeOpacity={0.7}
          disabled={!canAdd}
        >
          <Text style={[styles.addBtnText, !canAdd && styles.addBtnTextOff]}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          ref={searchRef}
          style={styles.search}
          placeholder="Search tasks…  (⌘F)"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.6}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filters}>
        {([
          ['all', 'All', todos.length],
          ['active', 'Active', activeCount],
          ['done', 'Done', doneCount],
        ] as const).map(([f, label, count]) => {
          const active = filter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <DraggableTodoRow
            item={item}
            index={index}
            onToggle={() => toggleTodo(item.id)}
            onDelete={() => confirmRemove(item.id)}
            onReorderTo={(targetIndex) => {
              const fromAbs = todos.findIndex(t => t.id === item.id);
              if (fromAbs < 0) return;
              const toItem = filtered[targetIndex];
              const toAbs = toItem ? todos.findIndex(t => t.id === toItem.id) : todos.length - 1;
              reorderTodo(fromAbs, toAbs);
            }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>{filter === 'done' ? '🎯' : '📭'}</Text>
            <Text style={styles.emptyText}>
              {filter === 'all' ? 'No tasks yet.' :
               filter === 'active' ? 'Nothing on your plate.' :
               'No completed tasks.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const ROW_HEIGHT = 56;

function DraggableTodoRow({ item, index, onToggle, onDelete, onReorderTo }: {
  item: Todo; index: number; onToggle: () => void; onDelete: () => void;
  onReorderTo: (targetIndex: number) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  // Native-driven Animated.Value; setValue pushes straight to NSView.transform
  // without a React re-render — the drag stays smooth even with many rows.
  const dyRef = React.useRef(new Animated.Value(0));

  const drag = useDraggable({
    onStart: () => { setDragging(true); dyRef.current.setValue(0); },
    onMove: (e) => dyRef.current.setValue(e.dy),
    onEnd: (e) => {
      const offset = Math.round(e.dy / ROW_HEIGHT);
      if (offset !== 0) onReorderTo(index + offset);
      setDragging(false);
      Animated.timing(dyRef.current, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    },
  });

  return (
    <ContextMenu
      items={[
        { label: item.done ? 'Mark Active' : 'Mark Done', onPress: onToggle },
        { separator: true },
        { label: 'Delete', danger: true, onPress: onDelete },
      ]}
    >
      <Animated.View
        {...drag}
        style={[
          styles.row,
          dragging && styles.rowDragging,
          { transform: [{ translateY: dyRef.current }] },
        ]}
      >
        <TouchableOpacity style={styles.rowMain} onPress={onToggle} activeOpacity={0.6}>
          <View style={[styles.check, item.done && styles.checkDone]}>
            {item.done && (Platform.OS === 'macos'
              ? <SFSymbol name="checkmark" size={11} weight="bold" color="#ffffff" />
              : <Text style={styles.checkMark}>✓</Text>)}
          </View>
          <Text style={[styles.rowText, item.done && styles.rowTextDone]}>
            {item.text}
          </Text>
        </TouchableOpacity>
        <Link to={`/todo/${item.id}`} style={styles.detailLink}>
          {Platform.OS === 'macos'
            ? <SFSymbol name="chevron.right" size={12} color="#c7c7cc" />
            : <Text style={styles.detailLinkText}>›</Text>}
        </Link>
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.6}>
          {Platform.OS === 'macos'
            ? <SFSymbol name="xmark" size={12} weight="medium" color="#ff3b30" />
            : <Text style={styles.deleteText}>✕</Text>}
        </TouchableOpacity>
      </Animated.View>
    </ContextMenu>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 32, paddingTop: 24 },

  header: { marginBottom: 20 },
  heading: { fontSize: 28, fontWeight: '700', color: '#1d1d1f' },
  subheading: { fontSize: 13, color: '#86868b', marginTop: 4 },

  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 4,
    paddingLeft: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
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
  addBtnOff: { backgroundColor: '#d2d2d7' },
  addBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  addBtnTextOff: { color: '#8e8e93' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  search: { flex: 1, fontSize: 13, paddingVertical: 6, color: '#1d1d1f' },
  searchClear: { fontSize: 13, color: '#86868b', paddingHorizontal: 4 },

  filters: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    gap: 8,
  },
  chipActive: { backgroundColor: '#0a84ff' },
  chipLabel: { fontSize: 13, fontWeight: '500', color: '#1d1d1f' },
  chipLabelActive: { color: '#ffffff' },
  badge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 100,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,0.96)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#86868b' },
  badgeTextActive: { color: '#0a84ff' },

  list: { paddingBottom: 24, gap: 8 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  rowDragging: {
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    opacity: 0.95,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 22, height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#c7c7cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: '#34c759', borderColor: '#34c759' },
  checkMark: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  rowText: { fontSize: 14, color: '#1d1d1f', flex: 1 },
  rowTextDone: { color: '#a1a1a6' },

  detailLink: { paddingHorizontal: 8 },
  detailLinkText: { fontSize: 22, color: '#c7c7cc' },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  deleteText: { fontSize: 15, color: '#ff3b30' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#86868b' },
});
