import { randomId } from '$lib/utils/random-id';
import { writable } from 'svelte/store';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export type Toast = {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  /** Milliseconds until auto-dismiss; `null` keeps the toast until closed manually. */
  timeout: number | null;
};

function createToastStore() {
  const { subscribe, update } = writable<Toast[]>([]);
  const DEFAULT_TIMEOUT_MS = 6000;

  function add(toast: Omit<Partial<Toast>, 'id'> & { message: string }): string {
    const id = randomId();
    const timeout = toast.timeout === undefined ? DEFAULT_TIMEOUT_MS : toast.timeout;
    const full: Toast = {
      id,
      title: toast.title ?? '',
      message: toast.message,
      type: toast.type ?? 'info',
      timeout,
    };
    update((list) => [...list, full]);
    if (timeout != null && timeout > 0) {
      setTimeout(() => remove(id), timeout);
    }
    return id;
  }

  function remove(id: string) {
    update((list) => list.filter((item) => item.id !== id));
  }

  return {
    subscribe,
    add,
    remove,
    clear: () => update(() => []),
    success: (message: string, title?: string) => add({ message, title, type: 'success' }),
    error: (message: string, title?: string) => add({ message, title, type: 'error' }),
    info: (message: string, title?: string) => add({ message, title, type: 'info' }),
    warning: (message: string, title?: string) => add({ message, title, type: 'warning' }),
    persistent: (
      message: string,
      options?: { title?: string; type?: Exclude<ToastType, 'success'> },
    ) =>
      add({
        message,
        title: options?.title,
        type: options?.type ?? 'warning',
        timeout: null,
      }),
  };
}

export const toastStore = createToastStore();
