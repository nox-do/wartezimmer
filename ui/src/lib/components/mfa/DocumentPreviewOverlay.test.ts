// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { stubDialogs, requestDialogClose } from '../__tests__/dialog';
import { initI18n } from '$lib/i18n/i18nStore.svelte';
import type { MfaDocument } from '$lib/documents/types';
import { renameDocument } from '$lib/documents/document-api';
import Preview from './DocumentPreviewOverlay.svelte';

vi.mock('$lib/navigation/kit-paths', () => ({ resolvedHref: (href: string) => href }));
vi.mock('@lucide/svelte', () => {
  const icon = () => {};
  return { ChevronLeft: icon, ChevronRight: icon, Pencil: icon, X: icon };
});
vi.mock('$lib/documents/document-api', () => ({
  previewDocument: vi.fn(async (id: string) => ({
    ok: true,
    data: { id, status: 'preview_requested', preview: { status: 'ready', embedUrl: '/fixture' } },
  })),
  renameDocument: vi.fn(),
  discardDocument: vi.fn(),
  exportDocument: vi.fn(),
  fetchDocumentsForVisit: vi.fn(),
}));

let app: Record<string, never>;
let host: HTMLElement;
let onClose: ReturnType<typeof vi.fn>;
const items = [{ id: 'doc', fileName: 'Test.pdf', status: 'preview_requested' }] as MfaDocument[];

function escape(element: Element) {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  flushSync();
}

beforeEach(stubDialogs);

beforeEach(async () => {
  await initI18n('de-DE');
  host = document.createElement('main');
  document.body.append(host);
  onClose = vi.fn();
  app = mount(Preview, {
    target: host,
    props: {
      initialItems: items,
      onClose,
      context: {
        visitId: 'visit',
        laneCode: 'A',
        number: 1,
        topicId: 'topic',
        topicLabel: 'Test',
        activeDocumentId: 'doc',
      },
    },
  });
  flushSync();
  await tick();
});
afterEach(async () => {
  await unmount(app);
  host.remove();
  vi.clearAllMocks();
});

it('ends rename editing on the first Escape and closes on the next native cancel', async () => {
  host.querySelector<HTMLButtonElement>('.doc-preview-rename-btn')!.click();
  flushSync();
  escape(host.querySelector('input')!);
  await tick();
  expect(host.querySelector('input')).toBeNull();
  expect(document.activeElement).toBe(host.querySelector('.doc-preview-rename-btn'));
  expect(host.querySelector('dialog')?.open).toBe(true);
  requestDialogClose(host.querySelector('dialog')!);
  await tick();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps a pending rename alive through native cancel and X, then applies success', async () => {
  let resolve!: (result: Awaited<ReturnType<typeof renameDocument>>) => void;
  vi.mocked(renameDocument).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  host.querySelector<HTMLButtonElement>('.doc-preview-rename-btn')!.click();
  flushSync();
  const input = host.querySelector('input')!;
  input.value = 'Renamed';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
  );
  flushSync();
  expect(requestDialogClose(host.querySelector('dialog')!).defaultPrevented).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.doc-preview-close-btn')?.disabled).toBe(true);
  resolve({ ok: true, data: { ...items[0], fileName: 'Renamed.pdf' } });
  await tick();
  expect(host.textContent).toContain('Renamed');
  expect(host.querySelector('input')).toBeNull();
  expect(host.querySelector('dialog')?.open).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
});
