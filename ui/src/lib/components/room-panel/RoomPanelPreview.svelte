<script lang="ts">
  import { onMount } from 'svelte';
  import { DoorOpen, LogIn, MapPin, PhoneOutgoing, User, UserCheck, UserX } from '@lucide/svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import type { RoomPanelSnapshot } from '$lib/queue/openapi-types';
  import { tf, t } from '$lib/i18n/i18nStore.svelte';
import { formatRoomPanelDisplayText } from '$lib/room-panel/room-panel-text';
import {
  formatRoomPanelTicketCode,
  resolveRoomPanelLeadLabel,
  resolveRoomPanelLeadState,
  roomPanelCallAnnouncementReachable,
  roomPanelCallCandidates,
  roomPanelCandidateDisplayName,
  roomPanelItemDisplayName,
  roomPanelItemTicketCodes,
  shouldRenderRoomPanelCallSection,
} from '$lib/room-panel/room-panel-snapshot-view';
  import {
    getRoomPanelPageCount,
    getRoomPanelPaginated,
    getVisibleRoomPanelTickets,
    mountRoomPanelQueueLayout,
    roomPanelQueueLayout,
  } from '$lib/room-panel/room-panel-queue-layout.svelte';

  interface Props {
    snapshot: RoomPanelSnapshot;
    busyVisitId?: string | null;
    onArrive?: (visitId: string) => void;
    onCheckOut?: (visitId: string) => void;
    onCall?: (visitId: string) => void;
  }

  let {
    snapshot,
    busyVisitId = null,
    onArrive,
    onCheckOut,
    onCall,
  }: Props = $props();

  let panelEl = $state<HTMLElement | null>(null);
  let viewportEl = $state<HTMLDivElement | null>(null);

  const title = $derived(snapshot.roomLabel.trim() || t('roomPanel.roomFallback'));
  const placement = $derived(snapshot.panel.placement);
  const mayShowPatientNames = $derived(snapshot.capabilities.mayShowPatientNames);
  const panelItems = $derived(snapshot.items);
  const callCandidates = $derived(roomPanelCallCandidates(snapshot));
  const callAnnouncementReachable = $derived(roomPanelCallAnnouncementReachable(snapshot));
  const callOfflineHint = $derived(t('roomPanel.callAnnouncementOffline'));
  const calledLeadText = $derived(
    formatRoomPanelDisplayText(
      snapshot.panel.calledTextPreset,
      snapshot.panel.calledTextCustom,
      'please_enter',
      t,
    ),
  );
  const arrivedLeadText = $derived(
    formatRoomPanelDisplayText(
      snapshot.panel.arrivedTextPreset,
      snapshot.panel.arrivedTextCustom,
      'please_wait_here',
      t,
    ),
  );
  const showCallSection = $derived(shouldRenderRoomPanelCallSection(snapshot));
  const leadState = $derived(resolveRoomPanelLeadState(panelItems));
  const stateLabel = $derived(
    resolveRoomPanelLeadLabel(leadState, {
      called: calledLeadText,
      arrived: arrivedLeadText,
      waiting: t('roomPanel.noTickets'),
    }),
  );
  const StateIcon = $derived(leadState === 'enter' ? DoorOpen : leadState === 'arrival' ? LogIn : MapPin);
  const queueTicketCodes = $derived(roomPanelItemTicketCodes(panelItems));
  const itemByCode = $derived(
    new Map(
      panelItems.map((item) => [formatRoomPanelTicketCode(item.laneCode, item.number), item]),
    ),
  );
  const visibleItems = $derived(
    getVisibleRoomPanelTickets()
      .map((code) => itemByCode.get(code))
      .filter((item): item is (typeof panelItems)[number] => Boolean(item)),
  );
  const pageCount = $derived(getRoomPanelPageCount());
  const paginated = $derived(getRoomPanelPaginated());

  onMount(() =>
    mountRoomPanelQueueLayout({
      getPanelEl: () => panelEl,
      getViewportEl: () => viewportEl,
      getTicketCodes: () => queueTicketCodes,
    }),
  );
</script>

<section
  bind:this={panelEl}
  class="room-panel-preview"
  data-state={leadState}
  data-live="true"
  data-queue-count={queueTicketCodes.length}
  aria-label={title}
>
  <header class="room-panel-preview__header">
    <span class="room-panel-preview__room">{title}</span>
    <span class="room-panel-preview__mode">
      {t(`mfa.settings.roomPanelPlacementShort_${placement}`)}
    </span>
  </header>

  <div class="room-panel-preview__lead">
    <div class="room-panel-preview__icon" aria-hidden="true">
      <StateIcon size={40} strokeWidth={1.8} />
    </div>
    <p class="room-panel-preview__state">{stateLabel}</p>
  </div>

  <div class="room-panel-preview__main">
    {#if showCallSection}
      <section class="room-panel-call-section" aria-label={t('roomPanel.callSectionAria')}>
        <h2 class="room-panel-call-section__title">{t('roomPanel.callSectionTitle')}</h2>
        {#if callCandidates.length === 0}
          <p class="room-panel-call-section__empty">{t('roomPanel.noCallCandidates')}</p>
        {:else}
          <ul class="room-panel-call-section__list" role="list">
            {#each callCandidates as candidate (candidate.visitId)}
              {@const ticketCode = formatRoomPanelTicketCode(candidate.laneCode, candidate.number)}
              {@const displayName = roomPanelCandidateDisplayName(candidate, mayShowPatientNames)}
              <li class="room-panel-call-section__item" role="listitem">
                <span class="room-panel-call-section__code">{ticketCode}</span>
                {#if displayName}
                  <span class="room-panel-call-section__name">
                    <User size={18} aria-hidden="true" />
                    <span>{displayName}</span>
                  </span>
                {/if}
                {#if candidate.actions.canCall}
                  <span
                    class="room-panel-call-section__action-wrap"
                    title={callAnnouncementReachable ? undefined : callOfflineHint}
                  >
                    <Button
                      class="room-panel-call-section__action"
                      variant="primary"
                      fullWidth
                      loading={busyVisitId === candidate.visitId}
                      disabled={
                        !callAnnouncementReachable ||
                        (busyVisitId !== null && busyVisitId !== candidate.visitId)
                      }
                    ariaLabel={callAnnouncementReachable
                      ? t('roomPanel.actionCall')
                      : t('roomPanel.actionCallOfflineHint')}
                      onclick={() => onCall?.(candidate.visitId)}
                    >
                      <PhoneOutgoing size={18} aria-hidden="true" />
                      {t('roomPanel.actionCall')}
                    </Button>
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <section class="room-panel-items-section" aria-label={t('roomPanel.itemsSectionAria')}>
      {#if showCallSection}
        <h2 class="room-panel-items-section__title">{t('roomPanel.itemsSectionTitle')}</h2>
      {/if}

      {#if panelItems.length === 0}
        <p class="room-panel-items-section__empty">{t('roomPanel.noRoomItems')}</p>
      {:else}
        <div class="room-panel-preview__queue-viewport" bind:this={viewportEl}>
          <ul
            class="room-panel-preview__queue"
            class:room-panel-preview__queue--cols-2={roomPanelQueueLayout.layout.columns === 2}
            class:room-panel-preview__queue--paginated={paginated}
          >
            {#each visibleItems as item (item.visitId)}
              {@const ticketCode = formatRoomPanelTicketCode(item.laneCode, item.number)}
              {@const displayName = roomPanelItemDisplayName(item, mayShowPatientNames)}
              <li
                class="room-panel-preview__queue-item"
                class:room-panel-preview__queue-item--next={item.status === 'called' || item.status === 'directed'}
              >
                <span class="room-panel-preview__queue-code">{ticketCode}</span>
                {#if displayName}
                  <span class="room-panel-preview__queue-name">
                    <User size={20} aria-hidden="true" />
                    <span>{displayName}</span>
                  </span>
                {/if}
                {#if item.actions.canArrive}
                  <Button
                    class="room-panel-preview__queue-action"
                    variant="primary"
                    fullWidth
                    loading={busyVisitId === item.visitId}
                    disabled={busyVisitId !== null && busyVisitId !== item.visitId}
                    onclick={() => onArrive?.(item.visitId)}
                  >
                    <UserCheck size={18} aria-hidden="true" />
                    {placement === 'outside'
                      ? t('roomPanel.actionIAmHere')
                      : t('roomPanel.actionArrived')}
                  </Button>
                {/if}
                {#if item.actions.canCheckOut}
                  <Button
                    class="room-panel-preview__queue-action"
                    variant="secondary"
                    fullWidth
                    loading={busyVisitId === item.visitId}
                    disabled={busyVisitId !== null && busyVisitId !== item.visitId}
                    onclick={() => onCheckOut?.(item.visitId)}
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
    </section>
  </div>
</section>
