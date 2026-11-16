// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { initI18n } from '$lib/i18n/i18nStore.svelte';
import { emptyRoomPanels, type PracticeRoomWithPanels } from '$lib/queue/ops-settings-api';
import type { QueueItem } from '$lib/queue/types';
import { stubDialogs } from '../__tests__/dialog';
import Reassign from './ReassignRoomModal.svelte';
import Rooms from './RoomsEditor.svelte';
import Icons from './TopicIconPickerModal.svelte';

vi.mock('@lucide/svelte', () => ({ ArrowRight: () => {} }));
vi.mock('$lib/topics/topic-icon-catalog', () => ({
  TOPIC_ICON_CATALOG: [
    { id: 'stethoscope', label: 'Allgemeinmedizin', component: () => {} },
    { id: 'heart-pulse', label: 'Kardiologie', component: () => {} },
  ],
}));

vi.mock('$lib/navigation/kit-paths', () => ({ resolvedHref: (href: string) => href }));
let host: HTMLElement;
const apps: Record<string, unknown>[] = [];
const room = (roomId: string, extra = {}) => ({
  ...emptyRoomPanels(),
  roomId,
  roomLabel: roomId,
  ...extra,
});
const radio = (root: ParentNode, value: string) =>
  root.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
beforeEach(stubDialogs);
beforeEach(async () => {
  await initI18n('de-DE');
  host = document.createElement('main');
  host.tabIndex = -1;
  document.body.append(host);
});
afterEach(async () => {
  for (const app of apps.splice(0)) await unmount(app);
  host.remove();
});

it('retains capacity rules and only reassigns on explicit confirmation', async () => {
  const confirm = vi.fn();
  apps.push(
    mount(Reassign, {
      target: host,
      props: {
        ticket: { visitId: 'visit', laneCode: 'A', number: 1, roomId: 'Current' },
        rooms: [
          room('Current', { maxOccupancy: 0 }),
          room('Full', { maxOccupancy: 1 }),
          room('Free'),
        ],
        activeItems: [{ visitId: 'other', roomId: 'Full', status: 'in_room' }] as QueueItem[],
        onConfirm: confirm,
      },
    }),
  );
  flushSync();
  expect(radio(host, 'Current').checked).toBe(true);
  expect(radio(host, 'Current').disabled).toBe(false);
  expect(radio(host, 'Full').disabled).toBe(true);
  radio(host, 'Free').click();
  await tick();
  expect(confirm).not.toHaveBeenCalled();
  host
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  expect(confirm).toHaveBeenCalledWith('Free', 'Free');
});

it('retains default selection and disables targets during requests', () => {
  apps.push(
    mount(Reassign, {
      target: host,
      props: {
        ticket: { visitId: 'visit', laneCode: 'A', number: 1 },
        rooms: [room('First'), room('Default', { defaultCallTarget: true })],
        busy: true,
      },
    }),
  );
  flushSync();
  expect(radio(host, 'Default').checked).toBe(true);
  expect(
    [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].every(
      (input) => input.disabled,
    ),
  ).toBe(true);
});

it('isolates panel groups and clears calling when the inside mode loses that capability', async () => {
  const initial = room('Room');
  initial.panels = {
    ...initial.panels!,
    outside: { ...initial.panels!.outside, enabled: true, mode: 'display_only' },
    inside: { ...initial.panels!.inside, enabled: true, mode: 'staff_full', allowCalling: true },
  };
  const change = vi.fn();
  for (let index = 0; index < 2; index++)
    apps.push(mount(Rooms, { target: host, props: { rooms: [initial], onChange: change } }));
  flushSync();
  for (const button of host.querySelectorAll<HTMLButtonElement>('.settings-disclosure__trigger'))
    button.click();
  await tick();
  const fields = [...host.querySelectorAll<HTMLFieldSetElement>('.panel-mode-field')];
  expect(fields).toHaveLength(4);
  expect(new Set(fields.map((field) => field.querySelector('input')!.name)).size).toBe(4);
  radio(fields[1], 'display_only').click();
  await tick();
  expect(radio(fields[3], 'staff_full').checked).toBe(true);
  expect(change).not.toHaveBeenCalled();
  host
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const saved = change.mock.calls[0][0] as PracticeRoomWithPanels[];
  expect(saved[0].panels!.inside.mode).toBe('display_only');
  expect(saved[0].panels!.inside.allowCalling).toBe(false);
  expect(saved[0].panels!.outside.mode).toBe('display_only');
});

it('describes the current icon and preserves immediate selection and closing', async () => {
  const pick = vi.fn();
  apps.push(
    mount(Icons, { target: host, props: { open: true, selectedIconId: null, onSelect: pick } }),
  );
  flushSync();
  expect(host.querySelector('[role="listbox"]')).toBeNull();
  const grid = host.querySelector('.topic-icon-grid')!;
  expect(grid.getAttribute('role')).toBe('group');
  const current = grid.querySelector('button')!;
  expect(document.getElementById(current.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Aktuell ausgewählt',
  );
  grid.querySelectorAll<HTMLButtonElement>('button')[1].click();
  await tick();
  expect(pick).toHaveBeenCalledTimes(1);
  expect(typeof pick.mock.calls[0][0]).toBe('string');
  expect(host.querySelector('dialog')!.open).toBe(false);
});
