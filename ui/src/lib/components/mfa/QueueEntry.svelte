<script lang="ts">
  import { createDraggable } from '@dnd-kit/svelte';
  import type { Snippet } from 'svelte';
  import { ArrowRight, FileText, LogOut, MapPin, Megaphone, RotateCcw, Send, TreePalm } from '@lucide/svelte';
  import MfaActionButton from '$lib/components/mfa/MfaActionButton.svelte';
  import QueueTriageButton from '$lib/components/mfa/QueueTriageButton.svelte';
  import { setIdentityRefTicket } from '$lib/queue/queue-actions';
  import { applyMfaQueueIdentityRef } from '$lib/mfa/mfa-queue-display.svelte';
  import { toastStore } from '$lib/stores/toastStore';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { queueEntryPrimary, queueEntrySecondary } from '$lib/queue/entry-copy';
  import { getTopicAccentColor } from '$lib/queue/practice-catalog';
  import TopicLaneBadge from '$lib/components/topics/TopicLaneBadge.svelte';
  import { formatReturnCountdown, returnCountdownRemainingMs } from '$lib/queue/format-return-countdown';
  import { computeWaitMs, formatWaitDuration, isLongWait } from '$lib/queue/format-wait-duration';
  import { formatClockTime } from '$lib/queue/format-time';
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
    callDisabled?: boolean;
    onCall?: () => void;
    onCheckIn?: () => void;
    onReassign?: () => void;
    onCheckOut?: () => void;
    onReturnToWaiting?: () => void;
    onRecall?: () => void;
    onMarkAway?: () => void;
    onFixRecallNotify?: () => void;
    onOpenDocuments?: (item: QueueItem) => void;
    onCycleTriage?: () => void;
  }

  let {
    item,
    zone,
    dragEnabled = false,
    dragZone = null,
    queueDragging = false,
    nowMs = Date.now(),
    busy = false,
    callDisabled = false,
    onCall,
    onCheckIn,
    onReassign,
    onCheckOut,
    onReturnToWaiting,
    onRecall,
    onMarkAway,
    onFixRecallNotify,
    onOpenDocuments,
    onCycleTriage,
  }: Props = $props();

  let nameEditing = $state(false);
  let nameDraft = $state('');
  let nameSaving = $state(false);
  let nameInputRef = $state<HTMLInputElement | null>(null);

  const canNameEdit = $derived(zone === 'waiting' && !item.identityRef?.trim() && !busy && !nameSaving);

  const liveWaitMs = $derived(computeWaitMs(item.arrivedAt, nowMs));
  const showLongWait = $derived(
    zone === 'waiting' && isLongWait(liveWaitMs),
  );
  const hasDocuments = $derived(item.documentCount > 0);
  const returnActive = $derived(zone === 'away' && item.status === 'absent_return_later' && !!item.returnUntil);
  const recallPending = $derived(
    zone === 'away' && (item.status !== 'absent_return_later' || !item.returnUntil),
  );
  const returnRemainingMs = $derived(
    returnActive && item.returnUntil ? returnCountdownRemainingMs(item.returnUntil, nowMs) : 0,
  );
  const returnUntilLabel = $derived(item.returnUntil ? formatClockTime(item.returnUntil) : '–');
  const recallNotifyFailed = $derived(Boolean(item.recallNotifyErrorCode?.trim()));
  const laneAccentColor = $derived(getTopicAccentColor(item.topicId, item.laneCode));
  const triageLevel = $derived(
    item.triageLevel === 'red' || item.triageLevel === 'yellow' || item.triageLevel === 'green'
      ? item.triageLevel
      : null,
  );

  const canDrag = $derived(dragEnabled && dragZone != null && !busy && !nameEditing);

  const { attach, attachHandle, isDragging } = createDraggable({
    get id() {
      const roomKey = item.roomId?.trim() || 'none';
      return `ticket:${item.ticketId}:${zone}:${roomKey}`;
    },
    get data() {
      return { ticketId: item.ticketId };
    },
    get disabled() {
      return !canDrag;
    },
  });

  const showDragging = $derived(isDragging && queueDragging);

  function attachDragSurface(node: HTMLElement) {
    const cleanupElement = attach(node);
    const cleanupHandle = attachHandle(node);
    return () => {
      cleanupElement();
      cleanupHandle();
    };
  }

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
    const result = await setIdentityRefTicket(item.ticketId, trimmed);
    nameSaving = false;
    if (result.error) {
      toastStore.error(result.error.message);
      return;
    }
    applyMfaQueueIdentityRef(item.ticketId, result.data.identityRef);
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

{#snippet queueTicket()}
  <div class="queue-ticket">
    <TopicLaneBadge laneCode={item.laneCode} accentColor={laneAccentColor} title={item.laneCode} />
    <span class="queue-num">{String(item.number).padStart(3, '0')}</span>
  </div>
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
      {#snippet children()}<ArrowRight aria-hidden="true" />{/snippet}
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
      {#snippet children()}<RotateCcw aria-hidden="true" />{/snippet}
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
      {@attach attachDragSurface}
    >
      {#if canDrag}
        <span class="queue-drag-grip" aria-hidden="true" title={t('mfa.dragHandleAria')}>
          <span></span><span></span><span></span><span></span>
        </span>
      {/if}

      {@render queueTicket()}
    </div>

    <div class="queue-entry-body">
      {@render queueInfo()}
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
        {#snippet children()}<FileText aria-hidden="true" />{/snippet}
      </MfaActionButton>
    {/if}

    {#if zone === 'waiting' && onCall}
      <MfaActionButton
        icon
        disabled={busy || callDisabled}
        ariaLabel={callDisabled ? t('mfa.actionCallDisabledOffline') : t('mfa.actionCall')}
        title={callDisabled ? t('mfa.callAnnouncementOffline') : undefined}
        onclick={onCall}
      >
        {#snippet children()}<Megaphone aria-hidden="true" />{/snippet}
      </MfaActionButton>
      {#if onMarkAway}
        <MfaActionButton
          variant="ghost"
          icon
          disabled={busy}
          ariaLabel={t('mfa.actionMarkAway')}
          onclick={onMarkAway}
        >
          {#snippet children()}<TreePalm aria-hidden="true" />{/snippet}
        </MfaActionButton>
      {/if}
    {:else if zone === 'active' && item.status === 'called' && onCheckIn}
      <MfaActionButton icon disabled={busy} ariaLabel={t('mfa.actionCheckIn')} onclick={onCheckIn}>
        {#snippet children()}<MapPin aria-hidden="true" />{/snippet}
      </MfaActionButton>
      {@render roomManagementActions()}
    {:else if zone === 'active' && item.status === 'in_room'}
      {#if onCheckOut}
        <MfaActionButton
          variant="ghost"
          icon
          disabled={busy}
          ariaLabel={t('mfa.actionCheckOut')}
          onclick={onCheckOut}
        >
          {#snippet children()}<LogOut aria-hidden="true" />{/snippet}
        </MfaActionButton>
      {/if}
      {@render roomManagementActions()}
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
            {#snippet children()}
              {t('mfa.actionFixRecallNotify')}
            {/snippet}
          </MfaActionButton>
        {/if}
      </div>
    {:else if zone === 'away' && recallPending && onRecall}
      <MfaActionButton disabled={busy} onclick={onRecall}>
        {#snippet children()}
          <Send aria-hidden="true" />
          {t('mfa.actionRecall')}
        {/snippet}
      </MfaActionButton>
    {/if}
    </div>
  </div>
</li>
