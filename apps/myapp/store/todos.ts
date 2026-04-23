import { createStore } from 'iex/store';

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

interface TodoState {
  todos: Todo[];
  nextId: number;
}

export const { Provider: TodoProvider, useStore: useTodoStore, useSelector: useTodoSelector } = createStore<TodoState>({
  todos: [
    { id: '1', text: 'Build the iExpo framework', done: true, createdAt: Date.now() - 86400000 },
    { id: '2', text: 'Implement file-system routing', done: true, createdAt: Date.now() - 3600000 },
    { id: '3', text: 'Add dynamic routes', done: false, createdAt: Date.now() },
  ],
  nextId: 4,
});

export function useTodos() {
  const [state, setState] = useTodoStore();

  return {
    todos: state.todos,

    addTodo: (text: string) => {
      setState(s => ({
        nextId: s.nextId + 1,
        todos: [{ id: String(s.nextId), text, done: false, createdAt: Date.now() }, ...s.todos],
      }));
    },

    toggleTodo: (id: string) => {
      setState(s => ({ ...s, todos: s.todos.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
    },

    removeTodo: (id: string) => {
      setState(s => ({ ...s, todos: s.todos.filter(t => t.id !== id) }));
    },

    getTodo: (id: string) => state.todos.find(t => t.id === id),
  };
}
