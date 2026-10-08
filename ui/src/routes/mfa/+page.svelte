<script lang="ts">
  import { onMount } from 'svelte';
  import CheckOutConfirmModal from '$lib/components/mfa/CheckOutConfirmModal.svelte';
  import AssistancePlacementConfirmModal from '$lib/components/mfa/AssistancePlacementConfirmModal.svelte';
  import DayStartBanner from '$lib/components/mfa/DayStartBanner.svelte';
  import DayStartConfirmModal from '$lib/components/mfa/DayStartConfirmModal.svelte';
  import MfaCheckinModal from '$lib/components/mfa/MfaCheckinModal.svelte';
  import MarkAwayPhoneModal from '$lib/components/mfa/MarkAwayPhoneModal.svelte';
  import ReassignRoomModal from '$lib/components/mfa/ReassignRoomModal.svelte';
  import MfaQuicksettings from '$lib/components/mfa/MfaQuicksettings.svelte';
  import WaitBoard from '$lib/components/mfa/WaitBoard.svelte';
  import {
    closeMfaDocumentPreview,
    mfaDocumentPreview,
    openMfaDocumentPreview,
    syncMfaDocumentPreviewWithQueue,
  } from '$lib/mfa/mfa-document-preview.svelte';
  import {
    confirmMfaDayStart,
    handleMfaTerminalLockToggle,
    mfaDayOps,
    openMfaDayStartConfirm,
  } from '$lib/mfa/mfa-day-ops.svelte';
  import { mountMfaDashboard } from '$lib/mfa/mfa-dashboard.svelte';
  import {
    mfaPracticeContext,
    toggleMfaCallRoomOverride,
  } from '$lib/mfa/mfa-practice-context.svelte';
  import {
    callMfaTicket,
    cancelMfaAssistancePlacement,
    cancelMfaPhoneCorrection,
    cancelMfaReassign,
    checkInMfaTicket,
    cancelMfaCheckOut,
    confirmMfaCheckOut,
    confirmMfaAssistancePlacement,
    continueMfaJourney,
    handleMfaCancelVisit,
    handleMfaCheckOut,
    confirmMfaPhoneCorrection,
    confirmMfaReassign,
    cycleMfaTriage,
    handleMfaFixRecallNotify,
    handleMfaMarkAway,
    handleMfaQueueDrop,
    handleMfaRecall,
    handleMfaRetryRecallNotify,
    handleMfaReassign,
    handleMfaSupersede,
    cancelMfaSupersede,
    mfaQueueActions,
    returnMfaTicketToWaiting,
    startMfaTicket,
  } from '$lib/mfa/mfa-queue-actions.svelte';
  import {
    getMfaClockLabel,
    getMfaZones,
    mfaQueueDisplay,
  } from '$lib/mfa/mfa-queue-display.svelte';
  import { isQueueCallAnnouncementReachable } from '$lib/queue/call-announcement';
  import { filterWaitingList } from '$lib/queue/waiting-list-filter';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import MfaSupersedeModal from '$lib/components/mfa/MfaSupersedeModal.svelte';
  import type { QueueItem } from '$lib/queue/types';

  onMount(mountMfaDashboard);

  const mfaZones = $derived(getMfaZones());
  const mfaClockLabel = $derived(getMfaClockLabel());
  const callAnnouncementReachable = $derived(isQueueCallAnnouncementReachable());
  const effectiveCallRoomTargetId = $derived(
    mfaPracticeContext.callRoomOverrideId ?? mfaPracticeContext.postWaitingCallTargetId,
  );
  let mfaCheckinModalOpen = $state(false);
  let queueSearchQuery = $state('');
  let queueLaneCode = $state<string | null>(null);

  const queueFilter = $derived({
    searchQuery: queueSearchQuery,
    laneCode: queueLaneCode,
  });
  const queueFilterActive = $derived(
    Boolean(queueSearchQuery.trim() || queueLaneCode),
  );
  const filteredWaiting = $derived(filterWaitingList(mfaZones.waiting, queueFilter));
  const filteredAway = $derived(filterWaitingList(mfaZones.away, queueFilter));
  const filteredActive = $derived(filterWaitingList(mfaZones.active, queueFilter));
  const queueFilterItems = $derived([
    ...mfaZones.waiting,
    ...mfaZones.away,
    ...mfaZones.active,
  ]);

  $effect(() => {
    const queue = mfaQueueDisplay.queue;
    if (!queue) {
      return;
    }
    syncMfaDocumentPreviewWithQueue(queue.items);
  });
</script>

{#if mfaDayOps.dayLifecycle?.needsDayStartHint && !mfaQueueDisplay.backendUnreachable}
  <DayStartBanner
    lastResetBusinessDay={mfaDayOps.dayLifecycle.lastResetBusinessDay}
    lastDayStats={mfaDayOps.dayLifecycle.lastDayStats}
    busy={mfaDayOps.dayStartBusy}
    onStartDay={openMfaDayStartConfirm}
  />
{/if}

{#if mfaQueueDisplay.loading}
  <p class="text-muted">{t('ui.loading')}</p>
{:else if mfaQueueDisplay.errorMessage}
  <div class="alert alert--error mfa-dashboard-error" role="alert">
    <p class="mfa-dashboard-error__title">{mfaQueueDisplay.errorMessage}</p>
    {#if mfaQueueDisplay.backendUnreachable}
      <p class="mfa-dashboard-error__tips">{t('mfa.backendUnreachableTip')}</p>
    {/if}
  </div>
{:else if mfaQueueDisplay.queue}
  <div class="mfa-dashboard-layout">
    <WaitBoard
      active={filteredActive}
      away={filteredAway}
      waiting={filteredWaiting}
      rooms={mfaPracticeContext.practiceRooms}
      busyVisitId={mfaQueueActions.busyVisitId}
      nowMs={mfaQueueDisplay.countdownNowMs}
      callAnnouncementReachable={callAnnouncementReachable}
      queueFilterActive={queueFilterActive}
      separateUnderway={mfaPracticeContext.routingMode === 'complex'}
      callRoomTargetId={effectiveCallRoomTargetId}
      showCallRoomTargetControls={mfaPracticeContext.routingMode === 'simple'}
      onSelectCallRoomTarget={toggleMfaCallRoomOverride}
      onCall={callMfaTicket}
      onCheckIn={checkInMfaTicket}
      onStart={startMfaTicket}
      onContinue={continueMfaJourney}
      onReassign={handleMfaReassign}
      onCheckOut={handleMfaCheckOut}
      onCancelVisit={handleMfaCancelVisit}
      onReturnToWaiting={returnMfaTicketToWaiting}
      onRecall={(visitId) => void handleMfaRecall(visitId)}
      onFixRecallNotify={handleMfaFixRecallNotify}
      onRetryRecallNotify={handleMfaRetryRecallNotify}
      onMarkAway={handleMfaMarkAway}
      onOpenDocuments={openMfaDocumentPreview}
      onCycleTriage={cycleMfaTriage}
      onSupersedeTopic={handleMfaSupersede}
      onQueueDrop={handleMfaQueueDrop}
    />

    <MfaQuicksettings
      clockLabel={mfaClockLabel}
      checkinLocked={mfaQueueDisplay.queue.checkinLocked}
      terminalLockBusy={mfaDayOps.terminalLockBusy}
      needsDayStartHint={mfaDayOps.dayLifecycle?.needsDayStartHint ?? false}
      filterItems={queueFilterItems}
      rooms={mfaPracticeContext.practiceRooms}
      bind:searchQuery={queueSearchQuery}
      bind:laneCode={queueLaneCode}
      onTerminalLockToggle={(nextLocked) => void handleMfaTerminalLockToggle(nextLocked)}
      onOpenMfaCheckin={() => (mfaCheckinModalOpen = true)}
    />
  </div>

  <MfaCheckinModal open={mfaCheckinModalOpen} onClose={() => (mfaCheckinModalOpen = false)} />

  {@const supersedeItem = mfaQueueActions.supersedeVisit
    ? ({
        visitId: mfaQueueActions.supersedeVisit.visitId,
        laneCode: mfaQueueActions.supersedeVisit.laneCode,
        number: mfaQueueActions.supersedeVisit.number,
        topicId: mfaQueueActions.supersedeVisit.topicId,
        topicLabel: mfaQueueActions.supersedeVisit.topicLabel,
      } as QueueItem)
    : null}
  <MfaSupersedeModal item={supersedeItem} onClose={cancelMfaSupersede} />

  <DayStartConfirmModal
    open={mfaDayOps.dayStartConfirmOpen}
    busy={mfaDayOps.dayStartBusy}
    onCancel={() => (mfaDayOps.dayStartConfirmOpen = false)}
    onConfirm={() => void confirmMfaDayStart()}
  />

  {@const phoneModalVisit = mfaQueueActions.phoneCorrectionVisit}
  {@const phoneModalPurpose = phoneModalVisit?.purpose ?? 'markAway'}

  <MarkAwayPhoneModal
    ticket={phoneModalVisit}
    purpose={phoneModalPurpose}
    busy={phoneModalVisit != null && mfaQueueActions.busyVisitId === phoneModalVisit.visitId}
    onConfirm={(phoneNumber, consentConfirmed) => void confirmMfaPhoneCorrection(phoneNumber, consentConfirmed)}
    onCancel={cancelMfaPhoneCorrection}
  />

  <ReassignRoomModal
    ticket={mfaQueueActions.reassignVisit}
    rooms={mfaPracticeContext.practiceRooms}
    activeItems={mfaZones.active}
    busy={mfaQueueActions.reassignVisit != null && mfaQueueActions.busyVisitId === mfaQueueActions.reassignVisit.visitId}
    onConfirm={(roomId, roomLabel) => void confirmMfaReassign(roomId, roomLabel)}
    onCancel={cancelMfaReassign}
  />

  <AssistancePlacementConfirmModal
    ticket={mfaQueueActions.assistancePlacementVisit}
    busy={mfaQueueActions.assistancePlacementVisit != null && mfaQueueActions.busyVisitId === mfaQueueActions.assistancePlacementVisit.visitId}
    onConfirm={() => void confirmMfaAssistancePlacement()}
    onCancel={cancelMfaAssistancePlacement}
  />

  <CheckOutConfirmModal
    ticket={mfaQueueActions.checkOutVisit}
    busy={mfaQueueActions.checkOutVisit != null && mfaQueueActions.busyVisitId === mfaQueueActions.checkOutVisit.visitId}
    onConfirm={() => void confirmMfaCheckOut()}
    onCancel={cancelMfaCheckOut}
  />

{/if}
