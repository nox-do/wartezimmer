<script lang="ts">
  import Button from '$lib/components/forms/Button.svelte';
  import RoomEditorModal from '$lib/components/mfa/RoomEditorModal.svelte';
  import type { PracticeRoomWithPanels, RoomPanelMode } from '$lib/queue/ops-settings-api';
  import {
    emptyRoomPanels,
    ensureSingleDefaultCallTarget,
    generateRoomId,
    listEnabledRoomPanelPlacements,
    roomHasAnyEnabledPanel,
    roomPanelConfigForPlacement,
  } from '$lib/queue/ops-settings-api';
  import { getDevicePresenceStatus } from '$lib/mfa/ops-stream-store.svelte';
  import { deviceStatusLabel } from '$lib/ops/device-presence-labels';
  import { roomPanelDeviceId } from '$lib/ops/device-presence-api';
  import { resolveRoomMaxOccupancy } from '$lib/queue/room-capacity';
  import type { RoomQueueGuardContext } from '$lib/queue/room-removal-guard';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';

  interface Props {
    rooms: PracticeRoomWithPanels[];
    busy?: boolean;
    onChange?: (rooms: PracticeRoomWithPanels[]) => void;
    /** Persist is authoritative for room remove/disable/capacity guards (server). */
    onPersist?: (options?: { roomQueueGuardContext?: RoomQueueGuardContext }) => void | Promise<boolean>;
  }

  let {
    rooms,
    busy = false,
    onChange,
    onPersist,
  }: Props = $props();

  let editorOpen = $state(false);
  let editorMode = $state<'add' | 'edit'>('add');
  let editorIndex = $state<number | null>(null);
  let draft = $state<PracticeRoomWithPanels>(emptyRoomPanels());
  let editorRoomIdsTaken = $state<Set<string>>(new Set());

  function emptyRoom(): PracticeRoomWithPanels {
    return emptyRoomPanels();
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
      panels: emptyRoomPanels().panels,
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

  function roomQueueGuardContextForEdit(
    previous: PracticeRoomWithPanels,
    next: PracticeRoomWithPanels,
  ): RoomQueueGuardContext | undefined {
    if (next.roomId !== previous.roomId) {
      return 'remove';
    }
    if (!next.enabled && previous.enabled) {
      return 'disable';
    }
    return undefined;
  }

  async function applyDraft(next: PracticeRoomWithPanels) {
    const preferredDefaultId = next.defaultCallTarget ? next.roomId : null;
    let updated: PracticeRoomWithPanels[];
    let roomQueueGuardContext: RoomQueueGuardContext | undefined;

    if (editorMode === 'add') {
      updated = ensureSingleDefaultCallTarget([...rooms, next], preferredDefaultId);
    } else if (editorIndex != null) {
      const previous = rooms[editorIndex];
      if (previous) {
        roomQueueGuardContext = roomQueueGuardContextForEdit(previous, next);
      }
      updated = ensureSingleDefaultCallTarget(
        rooms.map((room, i) => (i === editorIndex ? next : room)),
        preferredDefaultId,
      );
    } else {
      return;
    }

    onChange?.(updated);
    await onPersist?.(roomQueueGuardContext ? { roomQueueGuardContext } : undefined);
  }

  async function deleteFromModal() {
    if (editorIndex == null || rooms.length <= 1) {
      return;
    }
    const room = rooms[editorIndex];
    if (!room) {
      return;
    }

    onChange?.(ensureSingleDefaultCallTarget(rooms.filter((_, i) => i !== editorIndex)));
    editorOpen = false;
    editorIndex = null;
    await onPersist?.({ roomQueueGuardContext: 'remove' });
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
        {@const enabledPlacements = listEnabledRoomPanelPlacements(room)}
        {@const primaryPlacement = enabledPlacements[0]}
        {@const primaryPanel = primaryPlacement
          ? roomPanelConfigForPlacement(room, primaryPlacement)
          : null}
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
                {#if primaryPanel}
                  · {roomPanelModeLabel(primaryPanel.mode)}
                {/if}
              </span>
            </div>
          </div>
          <div class="mfa-editor-list-item__actions">
            {#if room.defaultCallTarget && room.enabled}
              <span class="pill pill--info">{t('mfa.settings.roomDefaultCallTargetBadge')}</span>
            {/if}
            {#if roomHasAnyEnabledPanel(room)}
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
