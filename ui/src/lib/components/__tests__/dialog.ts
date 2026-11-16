import { flushSync } from 'svelte';

// jsdom lacks these methods. Stub only the API boundary, not browser focus or Escape.
export function stubDialogs() {
  const prototype = HTMLDialogElement.prototype;
  const originals = Object.getOwnPropertyDescriptors(prototype);
  prototype.showModal = function () {
    this.open = true;
  };
  prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    queueMicrotask(() => this.dispatchEvent(new Event('close')));
  };
  return () => {
    for (const method of ['showModal', 'close']) {
      if (originals[method]) Object.defineProperty(prototype, method, originals[method]);
      else Reflect.deleteProperty(prototype, method);
    }
  };
}

export function requestDialogClose(dialog: HTMLDialogElement) {
  const event = new Event('cancel', { cancelable: true });
  if (dialog.dispatchEvent(event)) dialog.close();
  flushSync();
  return event;
}
