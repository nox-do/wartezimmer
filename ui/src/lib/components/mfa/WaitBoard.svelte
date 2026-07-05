<script lang="ts">
  import { DragDropProvider, PointerSensor } from '@dnd-kit/svelte';
  import { isInteractiveElement } from '@dnd-kit/dom/utilities';
  import ActiveRoomBoard from './ActiveRoomBoard.svelte';
  import QueueDropZone from './QueueDropZone.svelte';
  import QueueEntry from './QueueEntry.svelte';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { computeWaitMs, isLongWait, LONG_WAIT_THRESHOLD_MINUTES } from '$lib/queue/format-wait-duration';
  import { listEnabledRooms, type PracticeRoom } from '$lib/queue/ops-settings-api';
  import { readQueueDropTarget, type QueueDropTarget } from '$lib/queue/queue-drop-resolver';
  import type { QueueItem } from '$lib/queue/types';

  interface Props {
    active: QueueItem[];
    away: QueueItem[];
    waiting: QueueItem[];
    rooms?: PracticeRoom[];
    callRoomOverrideId?: string | null;
    busyVisitId?: string | null;
    nowMs?: number;
    callAnnouncementReachable?: boolean;
    onCall: (visitId: string) => void;
    onCheckIn: (visitId: string) => void;
    onReassign: (visitId: string) => void;
    onCheckOut: (visitId: string) => void;
    onReturnToWaiting: (visitId: string) => void;
    onRecall: (visitId: string) => void;
    onFixRecallNotify: (visitId: string) => void;
    onMarkAway: (visitId: string) => void;
    onOpenDocuments: (item: QueueItem) => void;
    onCycleTriage: (visitId: string) => void;
    onQueueDrop: (visitId: string, target: QueueDropTarget) => void;
  }

  let {
    active,
    away,
    waiting,
    rooms = [],
    callRoomOverrideId = null,
    busyVisitId = null,
    nowMs = Date.now(),
    callAnnouncementReachable = true,
    onCall,
    onCheckIn,
    onReassign,
    onCheckOut,
    onReturnToWaiting,
    onRecall,
    onFixRecallNotify,
    onMarkAway,
    onOpenDocuments,
    onCycleTriage,
    onQueueDrop,
  }: Props = $props();

  const enabledRooms = $derived(listEnabledRooms(rooms));
  const queueDragEnabled = $derived(enabledRooms.length > 0);
  const waitingDropLabel = $derived(t('mfa.zoneWaitingTitle'));

  function isBusy(visitId: string): boolean {
    return busyVisitId === visitId;
  }

  type WaitingRow =
    | { kind: 'item'; item: QueueItem }
    | { kind: 'divider' };

  const waitingRows = $derived.by((): WaitingRow[] => {
    const longWait = waiting.filter((item) =>
      isLongWait(computeWaitMs(item.arrivedAt, nowMs)),
    );
    const shortWait = waiting.filter(
      (item) => !isLongWait(computeWaitMs(item.arrivedAt, nowMs)),
    );
    const rows: WaitingRow[] = [];

    for (const item of longWait) {
      rows.push({ kind: 'item', item });
    }
    if (longWait.length > 0 && shortWait.length > 0) {
      rows.push({ kind: 'divider' });
    }
    for (const item of shortWait) {
      rows.push({ kind: 'item', item });
    }

    return rows;
  });

  const waitThresholdMinutes = LONG_WAIT_THRESHOLD_MINUTES;

  const queueDragSensors = [
    PointerSensor.configure({
      preventActivation: (event, source) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return false;
        }
        if (target.closest('.queue-entry-actions') || target.closest('.queue-name-input')) {
          return true;
        }
        if (target.closest('.queue-info--name-editable')) {
          return true;
        }
        if (target === source.element || target === source.handle) {
          return false;
        }
        if (source.handle?.contains(target)) {
          return false;
        }
        return isInteractiveElement(target);
      },
    }),
  ];

  let isQueueDragging = $state(false);
  let activeDropTargetId = $state<string | null>(null);

  function handleDragStart() {
    isQueueDragging = true;
  }

  function handleDragOver(event: {
    operation: {
      target: { id: unknown } | null;
    };
  }) {
    const targetId = event.operation.target?.id;
    activeDropTargetId = targetId != null ? String(targetId) : null;
  }

  function readTicketIdFromDragSource(source: { id?: string; data?: unknown }): string | null {
    const data = source.data as { visitId?: string } | undefined;
    if (typeof data?.visitId === 'string') {
      return data.visitId;
    }
    if (source.id?.startsWith('visit:')) {
      const rest = source.id.slice('visit:'.length);
      const visitId = rest.split(':')[0]?.trim();
      return visitId ? visitId : null;
    }
    return null;
  }

  function handleDragEnd(event: {
    canceled: boolean;
    operation: {
      source: { id: unknown; data?: unknown } | null;
      target: { data?: unknown } | null;
    };
  }) {
    try {
      if (event.canceled) {
        return;
      }

      const source = event.operation.source;
      const target = event.operation.target;
      if (!source || !target) {
        return;
      }

      const visitId = readTicketIdFromDragSource({
        id: typeof source.id === 'string' ? source.id : String(source.id ?? ''),
        data: source.data,
      });
      const dropTarget = readQueueDropTarget(target.data);
      if (!visitId || !dropTarget) {
        return;
      }

      onQueueDrop(visitId, dropTarget);
    } finally {
      isQueueDragging = false;
      activeDropTargetId = null;
    }
  }
</script>

<DragDropProvider
  sensors={queueDragSensors}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  <div class="wait-board-columns" class:wait-board-columns--dragging={isQueueDragging}>
    <div class="wait-board-stack">
      {#if queueDragEnabled}
        <QueueDropZone
          dropId="zone:waiting"
          target={{ kind: 'waiting' }}
          dropLabel={waitingDropLabel}
          highlighted={activeDropTargetId === 'zone:waiting'}
          variant="waiting"
          class="wait-zone wait-zone--waiting"
        >
          <h2 class="wait-zone-title">{t('mfa.zoneWaitingTitle')}</h2>
          <p class="wait-zone-desc">{t('mfa.zoneWaitingDesc')}</p>
          {#if waiting.length === 0}
            <p class="wait-zone-empty">{t('mfa.zoneWaitingEmpty')}</p>
          {:else}
            <ul class="queue-list">
              {#each waitingRows as row, index (row.kind === 'divider' ? `divider-${index}` : row.item.visitId)}
                {#if row.kind === 'divider'}
                  <li
                    class="wait-soll-divider"
                    aria-label={tf('mfa.waitThresholdAria', { minutes: waitThresholdMinutes })}
                  >
                    <span class="wait-soll-divider-line"></span>
                    <span class="wait-soll-divider-label">
                      {tf('mfa.waitThresholdDivider', { minutes: waitThresholdMinutes })}
                    </span>
                    <span class="wait-soll-divider-line"></span>
                  </li>
                {:else}
                  <QueueEntry
                    item={row.item}
                    zone="waiting"
                    dragEnabled={!isBusy(row.item.visitId)}
                    dragZone="waiting"
                    queueDragging={isQueueDragging}
                    {nowMs}
                    busy={isBusy(row.item.visitId)}
                    callDisabled={!callAnnouncementReachable}
                    onCall={() => onCall(row.item.visitId)}
                    onMarkAway={() => onMarkAway(row.item.visitId)}
                    onOpenDocuments={onOpenDocuments}
                    onCycleTriage={() => onCycleTriage(row.item.visitId)}
                  />
                {/if}
              {/each}
            </ul>
          {/if}
        </QueueDropZone>
      {:else}
        <section class="wait-zone wait-zone--waiting">
          <h2 class="wait-zone-title">{t('mfa.zoneWaitingTitle')}</h2>
          <p class="wait-zone-desc">{t('mfa.zoneWaitingDesc')}</p>
          {#if waiting.length === 0}
            <p class="wait-zone-empty">{t('mfa.zoneWaitingEmpty')}</p>
          {:else}
            <ul class="queue-list">
              {#each waitingRows as row, index (row.kind === 'divider' ? `divider-${index}` : row.item.visitId)}
                {#if row.kind === 'divider'}
                  <li
                    class="wait-soll-divider"
                    aria-label={tf('mfa.waitThresholdAria', { minutes: waitThresholdMinutes })}
                  >
                    <span class="wait-soll-divider-line"></span>
                    <span class="wait-soll-divider-label">
                      {tf('mfa.waitThresholdDivider', { minutes: waitThresholdMinutes })}
                    </span>
                    <span class="wait-soll-divider-line"></span>
                  </li>
                {:else}
                  <QueueEntry
                    item={row.item}
                    zone="waiting"
                    queueDragging={isQueueDragging}
                    {nowMs}
                    busy={isBusy(row.item.visitId)}
                    callDisabled={!callAnnouncementReachable}
                    onCall={() => onCall(row.item.visitId)}
                    onMarkAway={() => onMarkAway(row.item.visitId)}
                    onOpenDocuments={onOpenDocuments}
                    onCycleTriage={() => onCycleTriage(row.item.visitId)}
                  />
                {/if}
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      <section class="wait-zone wait-zone--away">
        <h2 class="wait-zone-title">{t('mfa.zoneAwayTitle')}</h2>
        <p class="wait-zone-desc">{t('mfa.zoneAwayDesc')}</p>
        {#if away.length === 0}
          <p class="wait-zone-empty">{t('mfa.zoneAwayEmpty')}</p>
        {:else}
          <ul class="queue-list">
            {#each away as item (item.visitId)}
              <QueueEntry
                {item}
                zone="away"
                {nowMs}
                busy={isBusy(item.visitId)}
                onRecall={() => onRecall(item.visitId)}
                onFixRecallNotify={() => onFixRecallNotify(item.visitId)}
                onOpenDocuments={onOpenDocuments}
                onCycleTriage={() => onCycleTriage(item.visitId)}
              />
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <section class="wait-zone wait-zone--active">
      <h2 class="wait-zone-title">{t('mfa.zoneActiveTitle')}</h2>
      <p class="wait-zone-desc">{t('mfa.zoneActiveDesc')}</p>
      {#if enabledRooms.length === 0}
        {#if active.length === 0}
          <p class="wait-zone-empty">{t('mfa.zoneActiveEmpty')}</p>
        {:else}
          <ul class="queue-list">
            {#each active as item (`${item.visitId}:${item.roomId ?? 'none'}`)}
              <QueueEntry
                {item}
                zone="active"
                queueDragging={isQueueDragging}
                {nowMs}
                busy={isBusy(item.visitId)}
                onCheckIn={() => onCheckIn(item.visitId)}
                onReassign={() => onReassign(item.visitId)}
                onCheckOut={() => onCheckOut(item.visitId)}
                onReturnToWaiting={() => onReturnToWaiting(item.visitId)}
                onOpenDocuments={onOpenDocuments}
                onCycleTriage={() => onCycleTriage(item.visitId)}
              />
            {/each}
          </ul>
        {/if}
      {:else}
        <ActiveRoomBoard
          {active}
          rooms={enabledRooms}
          {callRoomOverrideId}
          dragEnabled={queueDragEnabled}
          {activeDropTargetId}
          queueDragging={isQueueDragging}
          {busyVisitId}
          {nowMs}
          {onCheckIn}
          {onReassign}
          {onCheckOut}
          {onReturnToWaiting}
          {onOpenDocuments}
          {onCycleTriage}
        />
      {/if}
    </section>
  </div>
</DragDropProvider>

