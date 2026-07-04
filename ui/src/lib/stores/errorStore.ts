import { randomId } from '$lib/utils/random-id';
import { writable } from 'svelte/store';

export type AppError = {
  id: string;
  message: string;
  code?: string;
  details?: unknown;
};

function createErrorStore() {
  const { subscribe, update } = writable<AppError[]>([]);

  return {
    subscribe,
    push: (error: Omit<AppError, 'id'>) => {
      const entry: AppError = { id: randomId(), ...error };
      update((list) => [...list, entry]);
      return entry.id;
    },
    remove: (id: string) => update((list) => list.filter((item) => item.id !== id)),
    clear: () => update(() => []),
  };
}

export const errorStore = createErrorStore();
