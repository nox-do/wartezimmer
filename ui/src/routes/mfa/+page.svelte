<script lang="ts">
  import { onMount } from 'svelte';
  import CheckOutConfirmModal from '$lib/components/mfa/CheckOutConfirmModal.svelte';
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
  import { mfaPracticeContext, toggleMfaCallRoomOverride } from '$lib/mfa/mfa-practice-context.svelte';
  import {
    callMfaTicket,
    cancelMfaMarkAway,
    cancelMfaFixRecallNotify,
    cancelMfaReassign,
    checkInMfaTicket,
    cancelMfaCheckOut,
    confirmMfaCheckOut,
    handleMfaCheckOut,
    confirmMfaFixRecallNotifyWithPhone,
    confirmMfaMarkAwayWithPhone,
    confirmMfaReassign,
    cycleMfaTriage,
    handleMfaFixRecallNotify,
    handleMfaMarkAway,
    handleMfaQueueDrop,
    handleMfaRecall,
    handleMfaReassign,
    mfaQueueActions,
    returnMfaTicketToWaiting,
  } from '$lib/mfa/mfa-queue-actions.svelte';
  import {
    getMfaClockLabel,
    getMfaZones,
    mfaQueueDisplay,
  } from '$lib/mfa/mfa-queue-display.svelte';
  import { isQueueCallAnnouncementReachable } from '$lib/queue/call-announcement';
  import { t } from '$lib/i18n/i18nStore.svelte';

  onMount(mountMfaDashboard);

  const mfaZones = $derived(getMfaZones());
  const mfaClockLabel = $derived(getMfaClockLabel());
  const callAnnouncementReachable = $derived(isQueueCallAnnouncementReachable());
  let mfaCheckinModalOpen = $state(false);

  $effect(() => {
    const queue = mfaQueueDisplay.queue;
    if (!queue) {
      return;
    }
    syncMfaDocumentPreviewWithQueue(queue.items);
  });
</script>

{#if mfaDayOps.dayLifecycle?.needsDayStartHint}
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
      active={mfaZones.active}
      away={mfaZones.away}
      waiting={mfaZones.waiting}
      rooms={mfaPracticeContext.practiceRooms}
      callRoomOverrideId={mfaPracticeContext.callRoomOverrideId}
      busyTicketId={mfaQueueActions.busyTicketId}
      nowMs={mfaQueueDisplay.countdownNowMs}
      callAnnouncementReachable={callAnnouncementReachable}
      onCall={callMfaTicket}
      onCheckIn={checkInMfaTicket}
      onReassign={handleMfaReassign}
      onCheckOut={handleMfaCheckOut}
      onReturnToWaiting={returnMfaTicketToWaiting}
      onRecall={(ticketId) => void handleMfaRecall(ticketId)}
      onFixRecallNotify={handleMfaFixRecallNotify}
      onMarkAway={handleMfaMarkAway}
      onOpenDocuments={openMfaDocumentPreview}
      onCycleTriage={cycleMfaTriage}
      onQueueDrop={handleMfaQueueDrop}
    />

    <MfaQuicksettings
      clockLabel={mfaClockLabel}
      checkinLocked={mfaQueueDisplay.queue.checkinLocked}
      terminalLockBusy={mfaDayOps.terminalLockBusy}
      needsDayStartHint={mfaDayOps.dayLifecycle?.needsDayStartHint ?? false}
      rooms={mfaPracticeContext.practiceRooms}
      callRoomOverrideId={mfaPracticeContext.callRoomOverrideId}
      onToggleRoom={toggleMfaCallRoomOverride}
      onTerminalLockToggle={(nextLocked) => void handleMfaTerminalLockToggle(nextLocked)}
      onOpenMfaCheckin={() => (mfaCheckinModalOpen = true)}
    />
  </div>

  <MfaCheckinModal open={mfaCheckinModalOpen} onClose={() => (mfaCheckinModalOpen = false)} />

  <DayStartConfirmModal
    open={mfaDayOps.dayStartConfirmOpen}
    busy={mfaDayOps.dayStartBusy}
    onCancel={() => (mfaDayOps.dayStartConfirmOpen = false)}
    onConfirm={() => void confirmMfaDayStart()}
  />

  {@const phoneModalTicket = mfaQueueActions.fixRecallNotifyTicket ?? mfaQueueActions.markAwayTicket}
  {@const phoneModalPurpose = mfaQueueActions.fixRecallNotifyTicket ? 'fixRecallNotify' : 'markAway'}

  <MarkAwayPhoneModal
    ticket={phoneModalTicket}
    purpose={phoneModalPurpose}
    busy={phoneModalTicket != null && mfaQueueActions.busyTicketId === phoneModalTicket.ticketId}
    onConfirm={(phoneNumber) =>
      phoneModalPurpose === 'fixRecallNotify'
        ? void confirmMfaFixRecallNotifyWithPhone(phoneNumber)
        : void confirmMfaMarkAwayWithPhone(phoneNumber)}
    onCancel={() => {
      if (phoneModalPurpose === 'fixRecallNotify') {
        cancelMfaFixRecallNotify();
      } else {
        cancelMfaMarkAway();
      }
    }}
  />

  <ReassignRoomModal
    ticket={mfaQueueActions.reassignTicket}
    rooms={mfaPracticeContext.practiceRooms}
    activeItems={mfaZones.active}
    busy={mfaQueueActions.reassignTicket != null && mfaQueueActions.busyTicketId === mfaQueueActions.reassignTicket.ticketId}
    onConfirm={(roomId, roomLabel) => void confirmMfaReassign(roomId, roomLabel)}
    onCancel={cancelMfaReassign}
  />

  <CheckOutConfirmModal
    ticket={mfaQueueActions.checkOutTicket}
    busy={mfaQueueActions.checkOutTicket != null && mfaQueueActions.busyTicketId === mfaQueueActions.checkOutTicket.ticketId}
    onConfirm={() => void confirmMfaCheckOut()}
    onCancel={cancelMfaCheckOut}
  />

{/if}

