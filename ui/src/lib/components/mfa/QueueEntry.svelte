<script lang="ts">
  import { createDraggable } from '@dnd-kit/svelte';
  import type { Snippet } from 'svelte';
  import { ArrowRight, FileText, LogOut, MapPin, Megaphone, Navigation, Pause, Pencil, Play, RotateCcw, Send, Trash2, Users } from '@lucide/svelte';
  import MfaActionButton from '$lib/components/mfa/MfaActionButton.svelte';
  import QueueTriageButton from '$lib/components/mfa/QueueTriageButton.svelte';
  import { setIdentityRefVisit } from '$lib/queue/queue-actions';
  import { applyMfaQueueIdentityRef } from '$lib/mfa/mfa-queue-display.svelte';
  import { toastStore } from '$lib/stores/toastStore';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { queueEntryPrimary, queueEntrySecondary } from '$lib/queue/entry-copy';
  import { mfaPracticeContext } from '$lib/mfa/mfa-practice-context.svelte';
  import { getTopicAccentColor } from '$lib/queue/practice-catalog';
  import TopicLaneBadge from '$lib/components/topics/TopicLaneBadge.svelte';
  import { formatReturnCountdown, returnCountdownRemainingMs } from '$lib/queue/format-return-countdown';
  import { computeWaitMs, formatWaitDuration, isLongWait } from '$lib/queue/format-wait-duration';
  import { formatClockTime } from '$lib/queue/format-time';
  import {
    canMfaCallVisit,
    isMfaPickupActionPending,
    resolveMfaCallBlockedReason,
  } from '$lib/queue/mfa-call-gate';
  import { resolveMfaInRoomPrimaryAction } from '$lib/queue/mfa-primary-action';
  import type { QueueItem } from '$lib/queue/types';
  import type { QueueDragZone } from '$lib/queue/queue-drop-resolver';

  type Zone = 'active' | 'away' | 'waiting';

  interface Props {
    item: QueueItem;
    zone: Zone;
    dragEnabled?: boolean;
    dragZone?: QueueDragZone | null;
    queueDragging?: boolean;
    nowMs?: number;
    busy?: boolean;
    /** SSE hint only — button stays enabled; server decides on call. */
    callAnnouncementOffline?: boolean;
    onCall?: () => void;
    onCheckIn?: () => void;
    onStart?: () => void;
    onContinue?: () => void;
    onReassign?: () => void;
    onCheckOut?: () => void;
    onCancelVisit?: () => void;
    onReturnToWaiting?: () => void;
    onRecall?: () => void;
    onMarkAway?: () => void;
    onFixRecallNotify?: () => void;
    onOpenDocuments?: (item: QueueItem) => void;
    onCycleTriage?: () => void;
    onSupersedeTopic?: () => void;
  }

  let {
    item,
    zone,
    dragEnabled = false,
    dragZone = null,
    queueDragging = false,
    nowMs = Date.now(),
    busy = false,
    callAnnouncementOffline = false,
    onCall,
    onCheckIn,
    onStart,
    onContinue,
    onReassign,
    onCheckOut,
    onCancelVisit,
    onReturnToWaiting,
    onRecall,
    onMarkAway,
    onFixRecallNotify,
    onOpenDocuments,
    onCycleTriage,
    onSupersedeTopic,
  }: Props = $props();

  let nameEditing = $state(false);
  let nameDraft = $state('');
  let nameSaving = $state(false);
  let nameInputRef = $state<HTMLInputElement | null>(null);

  const nameEditZone = $derived(
    zone === 'waiting' || (zone === 'active' && item.status === 'directed'),
  );
  const nameEditable = $derived(nameEditZone && item.identityRefEditable === true);
  const canNameEdit = $derived(nameEditable && !busy && !nameSaving);

  const liveWaitMs = $derived(computeWaitMs(item.arrivedAt, nowMs));
  const showLongWait = $derived(
    zone === 'waiting' && isLongWait(liveWaitMs),
  );
  const hasDocuments = $derived(item.documentCount > 0);
  const inRoomPrimary = $derived(resolveMfaInRoomPrimaryAction(item));
  const callAllowed = $derived(canMfaCallVisit(item, mfaPracticeContext.practiceRooms));
  const callBlockedReason = $derived(
    resolveMfaCallBlockedReason(item, mfaPracticeContext.practiceRooms),
  );
  const callBlockedTitle = $derived.by(() => {
    const reason = callBlockedReason;
    if (!reason) {
      return undefined;
    }
    if (reason.kind === 'room_required') {
      return t('mfa.callBlockedRoomRequired');
    }
    if (reason.kind === 'directed') {
      return reason.roomLabel
        ? tf('mfa.callBlockedDirected', { room: reason.roomLabel })
        : t('mfa.callBlockedDirectedNoRoom');
    }
    if (reason.kind === 'pickup') {
      return reason.roomLabel
        ? tf('mfa.callBlockedPickup', { room: reason.roomLabel })
        : t('mfa.callBlockedPickupNoRoom');
    }
    return t('mfa.callBlockedOther');
  });
  const callButtonTitle = $derived(
    callBlockedTitle ?? (callAnnouncementOffline ? t('mfa.callAnnouncementOffline') : undefined),
  );
  const showCall = $derived(zone === 'waiting' && Boolean(onCall));
  const showPickupAction = $derived(
    isMfaPickupActionPending(item) && Boolean(onCheckIn),
  );
  const showDirectedWaitingActions = $derived(zone === 'active' && item.status === 'directed');
  const showCancelVisit = $derived(
    (zone === 'waiting' || zone === 'away' || showDirectedWaitingActions) &&
      Boolean(onCancelVisit),
  );
  const returnActive = $derived(zone === 'away' && item.status === 'absent_return_later' && !!item.returnUntil);
  const recallPending = $derived(
    zone === 'away' && (item.status !== 'absent_return_later' || !item.returnUntil),
  );
  const returnRemainingMs = $derived(
    returnActive && item.returnUntil ? returnCountdownRemainingMs(item.returnUntil, nowMs) : 0,
  );
  const returnUntilLabel = $derived(item.returnUntil ? formatClockTime(item.returnUntil) : '–');
  const recallNotifyFailed = $derived(Boolean(item.recallNotifyErrorCode?.trim()));
  const laneAccentColor = $derived.by(() => {
    void mfaPracticeContext.practiceTopics;
    return getTopicAccentColor(item.topicId, item.laneCode);
  });
  const triageLevel = $derived(
    item.triageLevel === 'red' || item.triageLevel === 'yellow' || item.triageLevel === 'green'
      ? item.triageLevel
      : null,
  );
  const showNeedsAssistance = $derived(Boolean(item.needsAssistance));
  const showPickupMark = $derived(
    isMfaPickupActionPending(item),
  );
  /** Staff-attention mark: assistance and pickup both mean someone must go to the patient. */
  const showStaffAttentionMark = $derived(showNeedsAssistance || showPickupMark);
  const showDirectedMark = $derived(zone === 'active' && item.status === 'directed');
  const movementRoomLabel = $derived(
    item.destinationRoomLabel?.trim() || item.roomLabel?.trim() || '',
  );
  const staffAttentionTitle = $derived.by(() => {
    if (showPickupMark) {
      return movementRoomLabel
        ? tf('mfa.entryPickupMark', { room: movementRoomLabel })
        : t('mfa.entryPickupMarkNoRoom');
    }
    return t('mfa.entryNeedsAssistance');
  });
  const directedMarkTitle = $derived(
    movementRoomLabel
      ? tf('mfa.entryDirectedMark', { room: movementRoomLabel })
      : t('mfa.entryDirectedMarkNoRoom'),
  );

  const canDrag = $derived(dragEnabled && dragZone != null && !busy && !nameEditing);
  const canSupersedeTopic = $derived(
    zone === 'waiting' && Boolean(onSupersedeTopic) && !busy && !nameEditing,
  );

  function handleSupersedeDoubleClick(event: MouseEvent) {
    if (!canSupersedeTopic) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSupersedeTopic?.();
  }

  function handleSupersedePointerDown(event: PointerEvent) {
    if (!canSupersedeTopic || event.detail < 2) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function handleSupersedeKeydown(event: KeyboardEvent) {
    if (!canSupersedeTopic) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSupersedeTopic?.();
  }

  const { attach, attachHandle, isDragging } = createDraggable({
    get id() {
      const roomKey = item.roomId?.trim() || 'none';
      return `ticket:${item.visitId}:${zone}:${roomKey}`;
    },
    get data() {
      return { visitId: item.visitId };
    },
    get disabled() {
      return !canDrag;
    },
  });

  const showDragging = $derived(isDragging && queueDragging);

  function handleOpenDocuments(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    onOpenDocuments?.(item);
  }

  async function commitName() {
    if (nameSaving) {
      return;
    }
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      cancelNameEdit();
      return;
    }
    if (!canNameEdit) {
      nameEditing = false;
      return;
    }
    nameSaving = true;
    const result = await setIdentityRefVisit(item.visitId, trimmed);
    nameSaving = false;
    if (result.error) {
      toastStore.error(result.error.message);
      return;
    }
    applyMfaQueueIdentityRef(item.visitId, result.data.identityRef);
    nameEditing = false;
  }

  function cancelNameEdit() {
    nameDraft = item.identityRef?.trim() ?? '';
    nameEditing = false;
  }

  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitName();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelNameEdit();
    }
  }

  function startNameEdit(event?: Event) {
    if (!canNameEdit || nameEditing) {
      return;
    }
    event?.preventDefault();
    event?.stopPropagation();
    nameDraft = item.identityRef?.trim() ?? '';
    nameEditing = true;
    queueMicrotask(() => {
      nameInputRef?.focus();
      nameInputRef?.select();
    });
  }

  function handleNameDoubleClick(event: MouseEvent) {
    startNameEdit(event);
  }

  function handleNamePointerDown(event: PointerEvent) {
    if (!canNameEdit || nameEditing || event.detail < 2) {
      return;
    }
    startNameEdit(event);
  }
</script>

{#snippet queueTicketMarks()}
  <TopicLaneBadge laneCode={item.laneCode} accentColor={laneAccentColor} title={item.laneCode} />
  <span class="queue-num">{String(item.number).padStart(3, '0')}</span>
  {#if showStaffAttentionMark}
    <span class="queue-assist-mark" title={staffAttentionTitle} aria-label={staffAttentionTitle}>
      <Users size={16} aria-hidden="true" />
    </span>
  {/if}
  {#if showDirectedMark}
    <span class="queue-directed-mark" title={directedMarkTitle} aria-label={directedMarkTitle}>
      <Navigation size={16} aria-hidden="true" />
    </span>
  {/if}
{/snippet}

{#snippet queueTicket()}
  {#if canSupersedeTopic}
    <button
      type="button"
      class="queue-ticket queue-ticket--supersede"
      title={t('mfa.supersedeTicketAria')}
      aria-label={t('mfa.supersedeTicketAria')}
      ondblclick={handleSupersedeDoubleClick}
      onpointerdown={handleSupersedePointerDown}
      onkeydown={handleSupersedeKeydown}
    >
      {@render queueTicketMarks()}
    </button>
  {:else}
    <div class="queue-ticket">
      {@render queueTicketMarks()}
    </div>
  {/if}
{/snippet}

{#snippet queueInfo()}
  <div
    class="queue-info"
    class:queue-info--editing={nameEditing}
    class:queue-info--name-editable={canNameEdit && !nameEditing}
    role={canNameEdit && !nameEditing ? 'button' : undefined}
    aria-label={canNameEdit && !nameEditing ? t('mfa.entryNamePlaceholder') : undefined}
    title={canNameEdit && !nameEditing ? t('mfa.entryNamePlaceholder') : undefined}
    ondblclick={canNameEdit && !nameEditing ? handleNameDoubleClick : undefined}
    onpointerdown={canNameEdit && !nameEditing ? handleNamePointerDown : undefined}
  >
    {#if nameEditing}
      <input
        bind:this={nameInputRef}
        class="queue-name-input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        maxlength="160"
        disabled={nameSaving}
        placeholder={t('mfa.entryNamePlaceholder')}
        bind:value={nameDraft}
        onkeydown={handleNameKeydown}
        onblur={commitName}
        onclick={(event) => event.stopPropagation()}
      />
    {:else}
      <span class="queue-info-primary">{queueEntryPrimary(item)}</span>
      <span class="queue-info-secondary">
        {queueEntrySecondary(item, zone)}
        {#if zone === 'waiting' || zone === 'away'}
          ·
          <span class="wait-duration" class:wait-duration--over={showLongWait}>
            {formatWaitDuration(liveWaitMs)}
          </span>
        {/if}
      </span>
    {/if}
  </div>
{/snippet}

{#snippet roomManagementActions()}
  {#if onReassign}
    <MfaActionButton
      variant="ghost"
      icon
      disabled={busy}
      ariaLabel={t('mfa.actionReassign')}
      onclick={onReassign}
    >
      <ArrowRight aria-hidden="true" />
    </MfaActionButton>
  {/if}
  {#if onReturnToWaiting}
    <MfaActionButton
      variant="ghost"
      icon
      disabled={busy}
      ariaLabel={t('mfa.actionReturnWaiting')}
      onclick={onReturnToWaiting}
    >
      <RotateCcw aria-hidden="true" />
    </MfaActionButton>
  {/if}
{/snippet}

<li
  class="queue-entry"
  class:queue-entry--over={showLongWait}
  class:queue-entry--zone-waiting={zone === 'waiting'}
  class:queue-entry--zone-active={zone === 'active'}
  class:queue-entry--zone-away={zone === 'away'}
  class:queue-entry--recall-notify-failed={zone === 'away' && recallNotifyFailed}
  class:queue-entry--dragging={showDragging}
  class:queue-entry--draggable={canDrag}
>
  <div class="queue-entry-card">
    <div
      class="queue-entry-drag-surface"
      class:queue-entry-drag-surface--enabled={canDrag}
      {@attach attach}
    >
      {#if canDrag}
        <span
          class="queue-drag-grip"
          aria-hidden="true"
          title={t('mfa.dragHandleAria')}
          {@attach attachHandle}
        >
          <span></span><span></span><span></span><span></span>
        </span>
      {:else}
        <!-- Keep lane badge aligned with draggable rows (e.g. away zone). -->
        <span class="queue-drag-grip queue-drag-grip--spacer" aria-hidden="true"></span>
      {/if}

      {@render queueTicket()}
    </div>

    <div class="queue-entry-body">
      {@render queueInfo()}
      {#if nameEditable && !nameEditing}
        <button
          type="button"
          class="queue-name-edit-btn"
          disabled={busy || nameSaving}
          aria-label={t('mfa.actionEditName')}
          title={t('mfa.actionEditName')}
          onclick={startNameEdit}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      {/if}
      {#if item.roomLabel && item.status === 'in_room'}
        <span class="queue-room queue-room--here">
          {tf('mfa.entryArrivedHere', { room: item.roomLabel })}
        </span>
      {/if}
    </div>

    <div class="queue-entry-actions">
    {#if onCycleTriage}
      <QueueTriageButton level={triageLevel} disabled={busy} onclick={onCycleTriage} />
    {/if}
    {#if hasDocuments}
      <MfaActionButton
        variant="doc"
        icon
        disabled={busy}
        ariaLabel={tf('mfa.actionDocuments', { count: item.documentCount })}
        count={item.documentCount}
        onclick={handleOpenDocuments}
      >
        <FileText aria-hidden="true" />
      </MfaActionButton>
    {/if}

    {#if zone === 'waiting' && (showCall || showPickupAction || onMarkAway || showCancelVisit)}
      <div class="queue-entry-actions-hover">
        {#if showPickupAction}
          <MfaActionButton
            disabled={busy}
            ariaLabel={t('mfa.assistPickedUp')}
            onclick={onCheckIn}
          >
            <Users aria-hidden="true" />
            {t('mfa.assistPickedUp')}
          </MfaActionButton>
        {/if}
        {#if showCall}
          <span class="mfa-action-tooltip" title={callButtonTitle}>
            <MfaActionButton
              icon
              disabled={busy || !callAllowed}
              ariaLabel={callBlockedTitle
                ? callBlockedTitle
                : callAnnouncementOffline
                  ? t('mfa.actionCallOfflineHint')
                  : t('mfa.actionCall')}
              title={callButtonTitle}
              onclick={onCall}
            >
              <Megaphone aria-hidden="true" />
            </MfaActionButton>
          </span>
        {/if}
        {#if onMarkAway}
          <MfaActionButton
            variant="ghost"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionMarkAway')}
            onclick={onMarkAway}
          >
            <Pause aria-hidden="true" />
          </MfaActionButton>
        {/if}
        {#if showCancelVisit}
          <MfaActionButton
            variant="danger"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionCancelVisit')}
            onclick={onCancelVisit}
          >
            <Trash2 aria-hidden="true" />
          </MfaActionButton>
        {/if}
      </div>
    {:else if zone === 'active' && (item.status === 'called' || item.status === 'directed')}
      <div class="queue-entry-actions-hover">
        {#if onCheckIn}
          <MfaActionButton icon disabled={busy} ariaLabel={t('mfa.actionCheckIn')} onclick={onCheckIn}>
            <MapPin aria-hidden="true" />
          </MfaActionButton>
        {/if}
        {@render roomManagementActions()}
        {#if showDirectedWaitingActions && onMarkAway}
          <MfaActionButton
            variant="ghost"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionMarkAway')}
            onclick={onMarkAway}
          >
            <Pause aria-hidden="true" />
          </MfaActionButton>
        {/if}
        {#if showDirectedWaitingActions && showCancelVisit}
          <MfaActionButton
            variant="danger"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionCancelVisit')}
            onclick={onCancelVisit}
          >
            <Trash2 aria-hidden="true" />
          </MfaActionButton>
        {/if}
      </div>
    {:else if zone === 'active' && item.status === 'in_room'}
      <div class="queue-entry-actions-hover">
        {#if showPickupAction}
          <MfaActionButton disabled={busy} ariaLabel={t('mfa.assistPickedUp')} onclick={onCheckIn}>
            <Users aria-hidden="true" />
            {t('mfa.assistPickedUp')}
          </MfaActionButton>
        {:else if inRoomPrimary === 'continue' && onContinue}
          <MfaActionButton icon disabled={busy} ariaLabel={t('mfa.actionContinue')} onclick={onContinue}>
            <ArrowRight aria-hidden="true" />
          </MfaActionButton>
        {:else if inRoomPrimary === 'start' && onStart}
          <MfaActionButton icon disabled={busy} ariaLabel={t('mfa.actionStart')} onclick={onStart}>
            <Play aria-hidden="true" />
          </MfaActionButton>
        {:else if inRoomPrimary === 'checkout' && onCheckOut}
          <MfaActionButton
            variant="ghost"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionCheckOut')}
            onclick={onCheckOut}
          >
            <LogOut aria-hidden="true" />
          </MfaActionButton>
        {/if}
        {@render roomManagementActions()}
      </div>
    {:else if zone === 'away' && returnActive}
      <div class="queue-entry-away-active">
        <span
          class="pill pill--warn pill--tabular"
          title={tf('mfa.returnUntilTitle', { time: returnUntilLabel })}
        >
          {formatReturnCountdown(returnRemainingMs)}
        </span>
        {#if recallNotifyFailed && returnRemainingMs > 0 && onFixRecallNotify}
          <MfaActionButton disabled={busy} onclick={onFixRecallNotify}>
            {t('mfa.actionFixRecallNotify')}
          </MfaActionButton>
        {/if}
        {#if showCancelVisit}
          <MfaActionButton
            variant="danger"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionCancelVisit')}
            onclick={onCancelVisit}
          >
            <Trash2 aria-hidden="true" />
          </MfaActionButton>
        {/if}
      </div>
    {:else if zone === 'away' && (recallPending || showCancelVisit)}
      <div class="queue-entry-actions-hover">
        {#if recallPending && onRecall}
          <MfaActionButton disabled={busy} onclick={onRecall}>
            <Send aria-hidden="true" />
            {t('mfa.actionRecall')}
          </MfaActionButton>
        {/if}
        {#if showCancelVisit}
          <MfaActionButton
            variant="danger"
            icon
            disabled={busy}
            ariaLabel={t('mfa.actionCancelVisit')}
            onclick={onCancelVisit}
          >
            <Trash2 aria-hidden="true" />
          </MfaActionButton>
        {/if}
      </div>
    {/if}
    </div>
  </div>
</li>
