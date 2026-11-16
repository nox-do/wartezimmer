import { writable } from 'svelte/store';

// Only the current modal may host toasts: everything outside it is inert.
const layers: HTMLDialogElement[] = [];
export const topModal = writable<HTMLDialogElement | null>(null);

export function enterModalLayer(dialog: HTMLDialogElement) {
  const fallback = dialog.closest('main') ?? document.querySelector('main');
  layers.push(dialog);
  topModal.set(dialog);
  return () => {
    const index = layers.indexOf(dialog);
    if (index < 0) return;
    layers.splice(index, 1);
    topModal.set(layers.at(-1) ?? null);
    // Native focus return handles surviving invokers, including nested dialogs.
    // Queue refreshes can remove the invoker; don't leave focus on a detached node/body.
    queueMicrotask(() => {
      if (dialog.open) return;
      const active = document.activeElement;
      if (active && active !== document.body && !dialog.contains(active)) return;
      const target =
        layers.at(-1)?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)') ??
        fallback;
      if (target instanceof HTMLElement && target.isConnected)
        target.focus({ preventScroll: true });
    });
  };
}
