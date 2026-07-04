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
    callRoomOverrideId?: string | null;
    dragEnabled?: boolean;
    activeDropTargetId?: string | null;
    queueDragging?: boolean;
    busyTicketId?: string | null;
    nowMs?: number;
    onCheckIn: (ticketId: string) => void;
    onReassign: (ticketId: string) => void;
    onCheckOut: (ticketId: string) => void;
    onReturnToWaiting: (ticketId: string) => void;
    onOpenDocuments: (item: QueueItem) => void;
    onCycleTriage: (ticketId: string) => void;
  }

  let {
    active,
    rooms,
    callRoomOverrideId = null,
    dragEnabled = false,
    activeDropTargetId = null,
    queueDragging = false,
    busyTicketId = null,
    nowMs = Date.now(),
    onCheckIn,
    onReassign,
    onCheckOut,
    onReturnToWaiting,
    onOpenDocuments,
    onCycleTriage,
  }: Props = $props();

  const board = $derived(buildActiveRoomBoard(active, rooms));

  function isBusy(ticketId: string): boolean {
    return busyTicketId === ticketId;
  }
</script>

<div class="active-room-board">
  {#each board.groups as group (group.roomId)}
    <QueueDropZone
      dropId={`room:${group.roomId}`}
      target={{ kind: 'room', roomId: group.roomId, roomLabel: group.roomLabel }}
      dropLabel={group.roomLabel}
      dropDisabled={group.isAtCapacity}
      highlighted={activeDropTargetId === `room:${group.roomId}`}
      class="active-room-group{callRoomOverrideId === group.roomId ? ' active-room-group--selected' : ''}{group.isAtCapacity ? ' active-room-group--full' : ''}"
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
          {#each group.tickets as item (`${item.ticketId}:${item.roomId ?? 'none'}`)}
            <QueueEntry
              {item}
              zone="active"
              dragEnabled={dragEnabled && !isBusy(item.ticketId)}
              dragZone="active"
              {queueDragging}
              {nowMs}
              busy={isBusy(item.ticketId)}
              onCheckIn={() => onCheckIn(item.ticketId)}
              onReassign={() => onReassign(item.ticketId)}
              onCheckOut={() => onCheckOut(item.ticketId)}
              onReturnToWaiting={() => onReturnToWaiting(item.ticketId)}
              onOpenDocuments={onOpenDocuments}
              onCycleTriage={() => onCycleTriage(item.ticketId)}
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
        {#each board.unassigned as item (`${item.ticketId}:${item.roomId ?? 'none'}`)}
          <QueueEntry
            {item}
            zone="active"
            dragEnabled={dragEnabled && !isBusy(item.ticketId)}
            dragZone="active"
            {queueDragging}
            {nowMs}
            busy={isBusy(item.ticketId)}
            onCheckIn={() => onCheckIn(item.ticketId)}
            onReassign={() => onReassign(item.ticketId)}
            onCheckOut={() => onCheckOut(item.ticketId)}
            onReturnToWaiting={() => onReturnToWaiting(item.ticketId)}
            onOpenDocuments={onOpenDocuments}
            onCycleTriage={() => onCycleTriage(item.ticketId)}
          />
        {/each}
      </ul>
    </section>
  {/if}
</div>

