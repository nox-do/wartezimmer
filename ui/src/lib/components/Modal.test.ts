// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { stubDialogs, requestDialogClose } from './__tests__/dialog';
import { get } from 'svelte/store';
import { topModal } from '$lib/actions/modal-layer';
import { toastStore } from '$lib/stores/toastStore';
import Harness from './__tests__/ModalHarness.svelte';

let app: {
  setOpen: (value: boolean) => void;
  setBusy: (value: boolean) => void;
  setNested: (value: boolean) => void;
};
let host: HTMLElement;
let onClose: ReturnType<typeof vi.fn>;
let onNestedClose: ReturnType<typeof vi.fn>;
const dialogs = () => [...host.querySelectorAll('dialog')];

beforeEach(stubDialogs);

beforeEach(() => {
  host = document.createElement('main');
  host.tabIndex = -1;
  document.body.append(host);
  onClose = vi.fn();
  onNestedClose = vi.fn();
  app = mount(Harness, { target: host, props: { onClose, onNestedClose } });
  flushSync();
});

afterEach(async () => {
  await unmount(app);
  host.remove();
  toastStore.clear();
});

describe('native Modal', () => {
  it('synchronizes native close and bound state exactly once', async () => {
    flushSync(() => app.setOpen(true));
    const [dialog] = dialogs();
    expect(dialog.open).toBe(true);
    requestDialogClose(dialog);
    await tick();
    expect(host.querySelector('output')?.textContent).toBe('false');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(get(topModal)).toBeNull();
  });

  it('does not report controlled success as cancellation, including quick reopen', async () => {
    flushSync(() => app.setOpen(true));
    flushSync(() => app.setOpen(false));
    flushSync(() => app.setOpen(true));
    await tick();
    expect(dialogs()[0].open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    dialogs()[0].close();
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('protects Escape and X while busy and allows successful controlled close', async () => {
    flushSync(() => {
      app.setOpen(true);
      app.setBusy(true);
    });
    const [dialog] = dialogs();
    expect(requestDialogClose(dialog).defaultPrevented).toBe(true);
    expect(dialog.querySelector<HTMLButtonElement>('.close-button')?.disabled).toBe(true);
    expect(dialog.open).toBe(true);
    dialog.close();
    await tick();
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    flushSync(() => app.setOpen(false));
    await tick();
    expect(dialog.open).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps nested names, close rules and toast ownership separate', async () => {
    flushSync(() => app.setOpen(true));
    flushSync(() => app.setNested(true));
    const [parent, child] = dialogs();
    expect(parent.getAttribute('aria-labelledby')).not.toBe(child.getAttribute('aria-labelledby'));
    expect(document.getElementById(parent.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Parent',
    );
    expect(get(topModal)).toBe(child);
    toastStore.error('Request failed');
    flushSync();
    expect(child.querySelector('[role="alert"]')?.textContent).toContain('Request failed');
    expect(parent.querySelectorAll('.toast-container')).toHaveLength(1);
    requestDialogClose(child);
    await tick();
    expect(parent.open).toBe(true);
    expect(get(topModal)).toBe(parent);
    expect(onClose).not.toHaveBeenCalled();
    expect(onNestedClose).toHaveBeenCalledTimes(1);
  });

  it('restores a stable focus target when the invoker was removed by a queue refresh', async () => {
    const invoker = host.querySelector('button')!;
    invoker.focus();
    flushSync(() => app.setOpen(true));
    invoker.remove();
    dialogs()[0].close();
    await tick();
    expect(document.activeElement).toBe(host);
  });

  it('only light-dismisses when both pointer endpoints are outside, respecting busy', async () => {
    flushSync(() => app.setOpen(true));
    const dialog = dialogs()[0];
    dialog.getBoundingClientRect = () =>
      ({ left: 10, top: 10, right: 100, bottom: 100 }) as DOMRect;
    function pointer(type: string, x: number) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 50 });
      dialog.dispatchEvent(event);
    }
    pointer('pointerdown', 50);
    pointer('pointerup', 0);
    expect(dialog.open).toBe(true);
    flushSync(() => app.setBusy(true));
    pointer('pointerdown', 0);
    pointer('pointerup', 0);
    expect(dialog.open).toBe(true);
    flushSync(() => app.setBusy(false));
    pointer('pointerdown', 0);
    pointer('pointerup', 0);
    await tick();
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
