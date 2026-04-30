import { createStore } from 'iex/store';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  notes?: string;
}

interface TodoState {
  todos: Todo[];
  nextId: number;
}

const SEED: TodoState = {
  todos: [
    { id: '1', text: 'Build the iExpo framework', done: true, createdAt: Date.now() - 86400000 },
    { id: '2', text: 'Implement file-system routing', done: true, createdAt: Date.now() - 3600000 },
    { id: '3', text: 'Add dynamic routes', done: false, createdAt: Date.now() },
  ],
  nextId: 4,
};

export const {
  Provider: TodoProvider,
  useStore: useTodoStore,
  useSelector: useTodoSelector,
  reset: resetTodos,
} = createStore<TodoState>(
  SEED,
  { persist: { key: 'iex.myapp.todos', throttle: 200 } }
);

export function useTodos() {
  const [state, setState] = useTodoStore();

  return {
    todos: state.todos,

    addTodo: (text: string): string => {
      let newId = '';
      setState(s => {
        newId = String(s.nextId);
        return {
          nextId: s.nextId + 1,
          todos: [{ id: newId, text, done: false, createdAt: Date.now() }, ...s.todos],
        };
      });
      return newId;
    },

    toggleTodo: (id: string) => {
      setState(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
    },

    updateTodo: (id: string, patch: Partial<Pick<Todo, 'text' | 'notes' | 'done'>>) => {
      setState(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, ...patch } : t) }));
    },

    removeTodo: (id: string) => {
      setState(s => ({ ...s, todos: s.todos.filter(t => t.id !== id) }));
    },

    reorderTodo: (from: number, to: number) => {
      setState(s => {
        if (from === to || from < 0 || to < 0) return s;
        const next = s.todos.slice();
        const [moved] = next.splice(from, 1);
        next.splice(Math.min(to, next.length), 0, moved);
        return { ...s, todos: next };
      });
    },

    getTodo: (id: string) => state.todos.find(t => t.id === id),
  };
}
