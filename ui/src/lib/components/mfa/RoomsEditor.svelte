<script lang="ts">
  import Button from '$lib/components/forms/Button.svelte';
  import RoomEditorModal from '$lib/components/mfa/RoomEditorModal.svelte';
  import { fetchMfaQueue } from '$lib/mfa/queue-stream';
  import type { PracticeRoomWithPanel, PracticeTopicSetting, RoomPanelMode } from '$lib/queue/ops-settings-api';
  import { ensureSingleDefaultCallTarget, generateRoomId, roomPanelSettingsOrDefault } from '$lib/queue/ops-settings-api';
  import {
    formatQueueTicketLabels,
    formatTopicLabels,
    queueTicketsOccupyingRoom,
    queueTicketsUsingRoom,
    topicsUsingRoom,
  } from '$lib/queue/room-removal-guard';
  import { getDevicePresenceStatus } from '$lib/mfa/ops-stream-store.svelte';
  import { deviceStatusLabel } from '$lib/ops/device-presence-labels';
  import { roomPanelDeviceId } from '$lib/ops/device-presence-api';
  import { resolveRoomMaxOccupancy } from '$lib/queue/room-capacity';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    rooms: PracticeRoomWithPanel[];
    topics?: PracticeTopicSetting[];
    busy?: boolean;
    onChange?: (rooms: PracticeRoomWithPanel[]) => void;
    onPersist?: () => void | Promise<boolean>;
  }

  let {
    rooms,
    topics = [],
    busy = false,
    onChange,
    onPersist,
  }: Props = $props();

  let editorOpen = $state(false);
  let editorMode = $state<'add' | 'edit'>('add');
  let editorIndex = $state<number | null>(null);
  let draft = $state<PracticeRoomWithPanel>(emptyRoom());
  let editorRoomIdsTaken = $state<Set<string>>(new Set());

  function emptyRoom(): PracticeRoomWithPanel {
    return {
      roomId: '',
      roomLabel: '',
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
    };
  }

  function openAdd() {
    const roomLabel = t('mfa.settings.roomDefaultLabel');
    editorMode = 'add';
    editorIndex = null;
    const roomIdsTaken = new Set(rooms.map((room) => room.roomId));
    editorRoomIdsTaken = roomIdsTaken;
    draft = {
      roomId: generateRoomId(roomIdsTaken),
      roomLabel,
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: null,
    };
    editorOpen = true;
  }

  function openEdit(index: number) {
    const room = rooms[index];
    if (!room) {
      return;
    }
    editorMode = 'edit';
    editorIndex = index;
    editorRoomIdsTaken = new Set(rooms.map((r) => r.roomId).filter((id) => id !== room.roomId));
    draft = { ...room };
    editorOpen = true;
  }

  async function guardRoomRelease(
    roomId: string,
    options: { checkTopics: boolean; queueContext: 'remove' | 'disable' },
  ): Promise<boolean> {
    if (options.checkTopics) {
      const linkedTopics = topicsUsingRoom(topics, roomId);
      if (linkedTopics.length > 0) {
        toastStore.error(
          tf('mfa.settings.roomRemoveBlockedTopics', { topics: formatTopicLabels(linkedTopics) }),
        );
        return false;
      }
    }

    const queueResult = await fetchMfaQueue();
    if (!queueResult.ok) {
      toastStore.error(queueResult.error.message || t('mfa.settings.roomRemoveQueueCheckError'));
      return false;
    }

    const linkedTickets = queueTicketsUsingRoom(queueResult.data.items, roomId);
    if (linkedTickets.length > 0) {
      const messageKey =
        options.queueContext === 'disable'
          ? 'mfa.settings.roomDisableBlockedQueue'
          : 'mfa.settings.roomRemoveBlockedQueue';
      toastStore.error(tf(messageKey, { tickets: formatQueueTicketLabels(linkedTickets) }));
      return false;
    }

    return true;
  }

  async function guardRoomCapacity(roomId: string, maxOccupancy: number | null | undefined): Promise<boolean> {
    if (maxOccupancy == null) {
      return true;
    }

    const queueResult = await fetchMfaQueue();
    if (!queueResult.ok) {
      toastStore.error(queueResult.error.message || t('mfa.settings.roomRemoveQueueCheckError'));
      return false;
    }

    const linkedTickets = queueTicketsOccupyingRoom(queueResult.data.items, roomId);
    if (linkedTickets.length > maxOccupancy) {
      toastStore.error(
        tf('mfa.settings.roomCapacityBlockedQueue', {
          tickets: formatQueueTicketLabels(linkedTickets),
        }),
      );
      return false;
    }

    return true;
  }

  async function applyDraft(next: PracticeRoomWithPanel) {
    if (editorMode === 'edit' && editorIndex != null) {
      const previous = rooms[editorIndex];
      if (previous) {
        if (!next.enabled && previous.enabled) {
          if (!(await guardRoomRelease(previous.roomId, { checkTopics: false, queueContext: 'disable' }))) {
            return;
          }
        }
        if (next.roomId !== previous.roomId) {
          if (!(await guardRoomRelease(previous.roomId, { checkTopics: true, queueContext: 'remove' }))) {
            return;
          }
        }
      }
    }

    if (!(await guardRoomCapacity(next.roomId, next.maxOccupancy))) {
      return;
    }

    const preferredDefaultId = next.defaultCallTarget ? next.roomId : null;
    let updated: PracticeRoomWithPanel[];
    if (editorMode === 'add') {
      updated = ensureSingleDefaultCallTarget([...rooms, next], preferredDefaultId);
    } else if (editorIndex != null) {
      updated = ensureSingleDefaultCallTarget(
        rooms.map((room, i) => (i === editorIndex ? next : room)),
        preferredDefaultId,
      );
    } else {
      return;
    }
    onChange?.(updated);
    await onPersist?.();
  }

  async function deleteFromModal() {
    if (editorIndex == null || rooms.length <= 1) {
      return;
    }
    const room = rooms[editorIndex];
    if (!room) {
      return;
    }

    if (!(await guardRoomRelease(room.roomId, { checkTopics: true, queueContext: 'remove' }))) {
      return;
    }

    onChange?.(ensureSingleDefaultCallTarget(rooms.filter((_, i) => i !== editorIndex)));
    editorOpen = false;
    editorIndex = null;
    await onPersist?.();
  }

  function roomPanelModeLabel(panelMode: RoomPanelMode): string {
    return {
      display_only: t('mfa.settings.roomPanelMode_display_only'),
      arrival: t('mfa.settings.roomPanelMode_arrival'),
      staff_full: t('mfa.settings.roomPanelMode_staff_full'),
    }[panelMode];
  }
</script>

<div class="panel rooms-editor-panel">
  <div class="mfa-editor-head">
    <div>
      <h2 class="panel__title">{t('mfa.settings.roomsPanelTitle')}</h2>
      <p class="text-desc">{t('mfa.settings.roomsPanelDesc')}</p>
    </div>
    <Button variant="outline" size="sm" disabled={busy} onclick={openAdd}>
      {t('mfa.settings.roomAdd')}
    </Button>
  </div>

  {#if rooms.length === 0}
    <p class="mfa-editor-empty">{t('mfa.settings.roomsEmpty')}</p>
  {:else}
    <ul class="mfa-editor-list" role="list">
      {#each rooms as room, index (`room-row-${index}`)}
        {@const panelSettings = roomPanelSettingsOrDefault(room)}
        <li class="mfa-editor-list-item" class:mfa-editor-list-item--inactive={!room.enabled} role="listitem">
          <div class="mfa-editor-list-item__main">
            <span class="mfa-editor-list-item__icon" aria-hidden="true">⌂</span>
            <div class="mfa-editor-list-item__text">
              <span class="mfa-editor-list-item__label">
                {room.roomLabel.trim() || t('mfa.settings.roomDefaultLabel')}
              </span>
              <span class="mfa-editor-list-item__meta">
                {#if resolveRoomMaxOccupancy(rooms, room.roomId) == null}
                  {t('mfa.settings.roomCapacityUnlimited')}
                {:else}
                  {tf('mfa.settings.roomCapacityLimited', {
                    count: resolveRoomMaxOccupancy(rooms, room.roomId) ?? 0,
                  })}
                {/if}
                {#if panelSettings.enabled}
                  · {roomPanelModeLabel(panelSettings.mode)}
                {/if}
              </span>
            </div>
          </div>
          <div class="mfa-editor-list-item__actions">
            {#if room.defaultCallTarget && room.enabled}
              <span class="pill pill--info">{t('mfa.settings.roomDefaultCallTargetBadge')}</span>
            {/if}
            {#if panelSettings.enabled}
              {@const panelStatus = getDevicePresenceStatus(roomPanelDeviceId(room.roomId))}
              <span
                class="pill"
                class:pill--on={panelStatus === 'online'}
                class:pill--warn={panelStatus === 'stale'}
                class:pill--off={panelStatus === 'offline'}
              >
                {deviceStatusLabel(panelStatus)}
              </span>
              <span class="pill pill--ok">{t('mfa.settings.roomPanelBadge')}</span>
            {/if}
            {#if !room.enabled}
              <span class="pill pill--caps">{t('mfa.settings.roomInactive')}</span>
            {/if}
            <Button variant="outline" size="sm" disabled={busy} onclick={() => openEdit(index)}>
              {t('mfa.settings.roomEdit')}
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<RoomEditorModal
  bind:open={editorOpen}
  mode={editorMode}
  bind:draft
  roomIdsTaken={editorRoomIdsTaken}
  canDelete={editorMode === 'edit' && rooms.length > 1}
  {busy}
  onApply={applyDraft}
  onDelete={deleteFromModal}
/>
