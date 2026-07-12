<script lang="ts">
  import { onMount } from 'svelte';
  import { DoorOpen, LogIn, MapPin, User, UserCheck, UserX } from '@lucide/svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import type { PracticeRoomWithPanels } from '$lib/queue/ops-settings-api';
  import {
    DEFAULT_ROOM_PANELS_SETTINGS,
    roomPanelConfigForPlacement,
  } from '$lib/queue/ops-settings-api';
  import type { RoomPanelPlacement } from '@praxis-flow/domain';
  import { tf, t } from '$lib/i18n/i18nStore.svelte';
  import {
    getRoomPanelPageCount,
    getRoomPanelPaginated,
    getVisibleRoomPanelTickets,
    mountRoomPanelQueueLayout,
    roomPanelQueueLayout,
  } from '$lib/room-panel/room-panel-queue-layout.svelte';

  export type RoomPanelQueueEntry = {
    visitId: string;
    ticketCode: string;
    patientName?: string | null;
    status: 'called' | 'in_room' | 'directed';
  };

  interface Props {
    room: PracticeRoomWithPanels;
    placement?: RoomPanelPlacement;
    queueEntries?: RoomPanelQueueEntry[];
    state?: 'waiting' | 'enter' | 'arrival';
    stateLabelOverride?: string;
    preview?: boolean;
    busyVisitId?: string | null;
    onCheckIn?: (visitId: string) => void;
    onCheckOut?: (visitId: string) => void;
  }

  let {
    room,
    placement = 'outside',
    queueEntries = [
      {
        visitId: 'preview',
        ticketCode: 'A-042',
        patientName: 'Muster',
        status: 'called',
      },
    ],
    state: panelState = 'waiting',
    stateLabelOverride,
    preview = true,
    busyVisitId = null,
    onCheckIn,
    onCheckOut,
  }: Props = $props();

  let panelEl = $state<HTMLElement | null>(null);
  let viewportEl = $state<HTMLDivElement | null>(null);

  const panel = $derived(roomPanelConfigForPlacement(room, placement));
  const title = $derived(room.roomLabel.trim() || t('roomPanel.roomFallback'));
  const showNames = $derived(placement === 'inside' && panel.showPatientNames);
  const arrivedText = $derived(panelText(panel.arrivedTextPreset, panel.arrivedTextCustom, 'please_wait_here'));
  const calledText = $derived(panelText(panel.calledTextPreset, panel.calledTextCustom, 'please_enter'));
  const stateLabel = $derived(
    stateLabelOverride?.trim() ||
      (panelState === 'enter'
        ? calledText
        : panelState === 'arrival'
          ? arrivedText
          : t('roomPanel.noTickets')),
  );
  const StateIcon = $derived(panelState === 'enter' ? DoorOpen : panelState === 'arrival' ? LogIn : MapPin);
  const queueTicketCodes = $derived(
    queueEntries.map((entry) => entry.ticketCode).filter((code) => code.trim() && code !== '—'),
  );
  const entryByCode = $derived(new Map(queueEntries.map((entry) => [entry.ticketCode, entry])));
  const visibleEntries = $derived(
    getVisibleRoomPanelTickets()
      .map((code) => entryByCode.get(code))
      .filter((entry): entry is RoomPanelQueueEntry => Boolean(entry)),
  );
  const pageCount = $derived(getRoomPanelPageCount());
  const paginated = $derived(getRoomPanelPaginated());
  const showCheckIn = $derived(!preview && panel.mode !== 'display_only' && Boolean(onCheckIn));
  const showCheckOut = $derived(!preview && panel.mode === 'staff_full' && Boolean(onCheckOut));

  onMount(() =>
    mountRoomPanelQueueLayout({
      getPanelEl: () => panelEl,
      getViewportEl: () => viewportEl,
      getTicketCodes: () => queueTicketCodes,
    }),
  );

  function panelText(
    preset: typeof panel.calledTextPreset,
    customText: string | null,
    fallbackPreset: typeof panel.calledTextPreset,
  ): string {
    const texts = {
      you_are_right: t('roomPanel.text_you_are_right'),
      please_wait_here: t('roomPanel.text_please_wait_here'),
      please_enter: t('roomPanel.text_please_enter'),
      go_to_reception: t('roomPanel.text_go_to_reception'),
      custom: '',
    };
    return preset === 'custom' ? customText?.trim() || texts[fallbackPreset] : texts[preset];
  }
</script>

<section
  bind:this={panelEl}
  class="room-panel-preview"
  data-state={panelState}
  data-live={preview ? undefined : 'true'}
  data-queue-count={queueTicketCodes.length}
  aria-label={preview ? t('roomPanel.previewAria') : title}
>
  <header class="room-panel-preview__header">
    <span class="room-panel-preview__room">{title}</span>
    {#if preview}
      <span class="room-panel-preview__mode">{t('roomPanel.previewBadge')}</span>
    {/if}
  </header>

  <div class="room-panel-preview__lead">
    <div class="room-panel-preview__icon" aria-hidden="true">
      <StateIcon size={40} strokeWidth={1.8} />
    </div>
    <p class="room-panel-preview__state">{stateLabel}</p>
  </div>

  <div class="room-panel-preview__main">
    {#if queueTicketCodes.length > 0}
      <div class="room-panel-preview__queue-viewport" bind:this={viewportEl}>
        <ul
          class="room-panel-preview__queue"
          class:room-panel-preview__queue--cols-2={roomPanelQueueLayout.layout.columns === 2}
          class:room-panel-preview__queue--paginated={paginated}
          aria-label={t('roomPanel.moreTicketsAria')}
        >
          {#each visibleEntries as entry (entry.visitId)}
            <li
              class="room-panel-preview__queue-item"
              class:room-panel-preview__queue-item--next={entry.status === 'called' || entry.status === 'directed'}
            >
              <span class="room-panel-preview__queue-code">{entry.ticketCode}</span>
              {#if showNames && entry.patientName?.trim()}
                <span class="room-panel-preview__queue-name">
                  <User size={20} aria-hidden="true" />
                  <span>{entry.patientName}</span>
                </span>
              {/if}
              {#if showCheckIn && (entry.status === 'called' || entry.status === 'directed')}
                <Button
                  class="room-panel-preview__queue-action"
                  variant="primary"
                  fullWidth
                  loading={busyVisitId === entry.visitId}
                  onclick={() => onCheckIn?.(entry.visitId)}
                >
                  <UserCheck size={18} aria-hidden="true" />
                  {placement === 'outside'
                    ? t('roomPanel.actionIAmHere')
                    : t('roomPanel.actionArrived')}
                </Button>
              {/if}
              {#if showCheckOut && entry.status === 'in_room'}
                <Button
                  class="room-panel-preview__queue-action"
                  variant="secondary"
                  fullWidth
                  loading={busyVisitId === entry.visitId}
                  onclick={() => onCheckOut?.(entry.visitId)}
                >
                  <UserX size={18} aria-hidden="true" />
                  {t('roomPanel.actionDone')}
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
      {#if paginated}
        <p class="room-panel-preview__pages" aria-live="polite">
          {tf('tv.pageIndicator', {
            current: roomPanelQueueLayout.pageIndex + 1,
            total: pageCount,
          })}
        </p>
      {/if}
    {/if}
  </div>
</section>
