<script lang="ts">
  import QueueDropZone from './QueueDropZone.svelte';
  import QueueEntry from './QueueEntry.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { buildActiveRoomBoard } from '$lib/queue/active-room-board';
  import { roomOccupancyLabel } from '$lib/queue/room-capacity';
  import type { PracticeRoom } from '$lib/queue/ops-settings-api';
  import type { QueueItem } from '$lib/queue/types';

  interface Props {
    active: QueueItem[];
    rooms: PracticeRoom[];
    dragEnabled?: boolean;
    activeDropTargetId?: string | null;
    queueDragging?: boolean;
    busyVisitId?: string | null;
    nowMs?: number;
    onCheckIn: (visitId: string) => void;
    onStart: (visitId: string) => void;
    onContinue: (visitId: string) => void;
    onReassign: (visitId: string) => void;
    onCheckOut: (visitId: string) => void;
    onCancelVisit: (visitId: string) => void;
    onReturnToWaiting: (visitId: string) => void;
    onMarkAway: (visitId: string) => void;
    onOpenDocuments: (item: QueueItem) => void;
    onCycleTriage: (visitId: string) => void;
  }

  let {
    active,
    rooms,
    dragEnabled = false,
    activeDropTargetId = null,
    queueDragging = false,
    busyVisitId = null,
    nowMs = Date.now(),
    onCheckIn,
    onStart,
    onContinue,
    onReassign,
    onCheckOut,
    onCancelVisit,
    onReturnToWaiting,
    onMarkAway,
    onOpenDocuments,
    onCycleTriage,
  }: Props = $props();

  const board = $derived(buildActiveRoomBoard(active, rooms));

  function isBusy(visitId: string): boolean {
    return busyVisitId === visitId;
  }
</script>

<div class="active-room-board">
  <section class="active-room-group active-room-group--underway" aria-label={t('mfa.zoneUnderwayTitle')}>
    <div class="active-room-group-head">
      <h3 class="active-room-group-title">{t('mfa.zoneUnderwayTitle')}</h3>
    </div>
    <p class="active-room-group-note">{t('mfa.zoneUnderwayDesc')}</p>
    {#if board.underway.length === 0}
      <p class="active-room-group-empty">{t('mfa.zoneUnderwayEmpty')}</p>
    {:else}
      <ul class="queue-list">
        {#each board.underway as item (`${item.visitId}:${item.status}`)}
          <QueueEntry
            {item}
            zone="active"
            dragEnabled={dragEnabled && !isBusy(item.visitId)}
            dragZone="active"
            {queueDragging}
            {nowMs}
            busy={isBusy(item.visitId)}
            onCheckIn={() => onCheckIn(item.visitId)}
            onReassign={() => onReassign(item.visitId)}
            onCancelVisit={() => onCancelVisit(item.visitId)}
            onReturnToWaiting={() => onReturnToWaiting(item.visitId)}
            onMarkAway={() => onMarkAway(item.visitId)}
            onOpenDocuments={onOpenDocuments}
            onCycleTriage={() => onCycleTriage(item.visitId)}
          />
        {/each}
      </ul>
    {/if}
  </section>

  {#each board.groups as group (group.roomId)}
    <QueueDropZone
      dropId={`room:${group.roomId}`}
      target={{ kind: 'room', roomId: group.roomId, roomLabel: group.roomLabel }}
      dropLabel={group.roomLabel}
      dropDisabled={group.isAtCapacity}
      highlighted={activeDropTargetId === `room:${group.roomId}`}
      class="active-room-group{group.isAtCapacity ? ' active-room-group--full' : ''}"
    >
      <div class="active-room-group-head">
        <h3 class="active-room-group-title">{group.roomLabel}</h3>
        {#if roomOccupancyLabel(group.occupantCount, group.maxOccupancy)}
          <span class="pill pill--ok" class:pill--bad={group.isAtCapacity}>
            {roomOccupancyLabel(group.occupantCount, group.maxOccupancy)}
          </span>
        {/if}
      </div>
      {#if group.tickets.length === 0}
        <p class="active-room-group-empty">{t('mfa.zoneActiveRoomEmpty')}</p>
      {:else}
        <ul class="queue-list">
          {#each group.tickets as item (`${item.visitId}:${item.roomId ?? 'none'}`)}
            <QueueEntry
              {item}
              zone="active"
              dragEnabled={dragEnabled && !isBusy(item.visitId)}
              dragZone="active"
              {queueDragging}
              {nowMs}
              busy={isBusy(item.visitId)}
              onCheckIn={() => onCheckIn(item.visitId)}
              onStart={() => onStart(item.visitId)}
              onContinue={() => onContinue(item.visitId)}
              onReassign={() => onReassign(item.visitId)}
              onCheckOut={() => onCheckOut(item.visitId)}
              onReturnToWaiting={() => onReturnToWaiting(item.visitId)}
              onOpenDocuments={onOpenDocuments}
              onCycleTriage={() => onCycleTriage(item.visitId)}
            />
          {/each}
        </ul>
      {/if}
    </QueueDropZone>
  {/each}

  {#if board.unassigned.length > 0}
    <section class="active-room-group active-room-group--unassigned" aria-label={t('mfa.zoneActiveUnassigned')}>
      <h3 class="active-room-group-title">{t('mfa.zoneActiveUnassigned')}</h3>
      <ul class="queue-list">
        {#each board.unassigned as item (`${item.visitId}:${item.roomId ?? 'none'}`)}
          <QueueEntry
            {item}
            zone="active"
            dragEnabled={dragEnabled && !isBusy(item.visitId)}
            dragZone="active"
            {queueDragging}
            {nowMs}
            busy={isBusy(item.visitId)}
            onCheckIn={() => onCheckIn(item.visitId)}
            onStart={() => onStart(item.visitId)}
            onContinue={() => onContinue(item.visitId)}
            onReassign={() => onReassign(item.visitId)}
            onCheckOut={() => onCheckOut(item.visitId)}
            onReturnToWaiting={() => onReturnToWaiting(item.visitId)}
            onOpenDocuments={onOpenDocuments}
            onCycleTriage={() => onCycleTriage(item.visitId)}
          />
        {/each}
      </ul>
    </section>
  {/if}
</div>
