<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { DoorClosed, DoorOpen, Settings, UserPlus } from '@lucide/svelte';
  import {
    confirmDevicePairing,
    type DevicePairingKind,
  } from '$lib/auth/device-pairing-client';
  import { resolve } from '$app/paths';
  import PairingConfirmForm from '$lib/components/auth/PairingConfirmForm.svelte';
  import WaitingListFilters from '$lib/components/mfa/WaitingListFilters.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';
  import {
    getDevicePresenceStatus,
    getDeviceQuicksettingsPhase,
  } from '$lib/mfa/ops-stream-store.svelte';
  import { deviceStatusLabel } from '$lib/ops/device-presence-labels';
  import {
    roomPanelDeviceId,
    TERMINAL_DEVICE_ID,
    WAITING_ROOM_DEVICE_ID,
  } from '$lib/ops/device-presence-api';
  import {
    fetchDeviceAuthorizations,
    revokeDeviceAuthorization,
    type DeviceAuthorizationListItem,
  } from '$lib/mfa/device-authorizations-api';
  import TerminalLockToggle from '$lib/components/mfa/TerminalLockToggle.svelte';
  import { handleClockEasterEggClick } from '$lib/mfa/clock-easter-egg';
  import { spawnMfaEsheep } from '$lib/mfa/esheep';
  import type { QueueItem } from '$lib/queue/types';

  /** Entkoppeln in Quicksettings vorübergehend aus — API bleibt für spätere Settings. */
  const QUICKSETTINGS_UNPAIR_ENABLED = false;

  interface Props {
    clockLabel?: string | null;
    checkinLocked: boolean;
    terminalLockBusy?: boolean;
    needsDayStartHint?: boolean;
    filterItems?: QueueItem[];
    rooms?: Array<{ roomId: string; roomLabel: string }>;
    searchQuery?: string;
    laneCode?: string | null;
    onTerminalLockToggle?: (nextLocked: boolean) => void;
    onOpenMfaCheckin?: () => void;
  }

  let {
    clockLabel = null,
    checkinLocked,
    terminalLockBusy = false,
    needsDayStartHint = false,
    filterItems = [],
    rooms = [],
    searchQuery = $bindable(''),
    laneCode = $bindable<string | null>(null),
    onTerminalLockToggle,
    onOpenMfaCheckin,
  }: Props = $props();

  const terminalDisplayLocked = $derived(needsDayStartHint || checkinLocked);

  const tvStatus = $derived(getDevicePresenceStatus(WAITING_ROOM_DEVICE_ID));
  const terminalStatus = $derived(getDevicePresenceStatus(TERMINAL_DEVICE_ID));
  const terminalPhase = $derived(getDeviceQuicksettingsPhase(TERMINAL_DEVICE_ID, 'terminal'));
  const tvPhase = $derived(getDeviceQuicksettingsPhase(WAITING_ROOM_DEVICE_ID, 'tv'));

  let authorizations = $state<DeviceAuthorizationListItem[]>([]);
  let unpairBusyId = $state<string | null>(null);
  let grantWatchGeneration = { tv: 0, terminal: 0 };

  const GRANT_WATCH_MS = 60_000;
  const GRANT_WATCH_INTERVAL_MS = 500;

  const terminalGrant = $derived(
    authorizations.find((row) => row.role === 'terminal' && row.deviceId === TERMINAL_DEVICE_ID),
  );
  const tvGrant = $derived(
    authorizations.find((row) => row.role === 'tv' && row.deviceId === WAITING_ROOM_DEVICE_ID),
  );
  const panelGrants = $derived(authorizations.filter((row) => row.role === 'room-panel'));

  function formatGrantCreatedAt(iso: string): string {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) {
      return iso;
    }
    return new Date(ms).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  function roomLabel(roomId: string | null): string {
    if (!roomId) {
      return '—';
    }
    return rooms.find((room) => room.roomId === roomId)?.roomLabel?.trim() || roomId;
  }

  function panelPresenceStatus(grant: DeviceAuthorizationListItem) {
    if (!grant.roomId || !grant.placement) {
      return 'offline' as const;
    }
    return getDevicePresenceStatus(roomPanelDeviceId(grant.roomId, grant.placement));
  }

  function panelTooltip(grant: DeviceAuthorizationListItem): string {
    const placement =
      grant.placement === 'inside' ? t('mfa.devicePanelInside') : t('mfa.devicePanelOutside');
    return `${grant.roomId ?? '—'} · ${placement} · ${formatGrantCreatedAt(grant.createdAt)}`;
  }

  async function loadAuthorizations() {
    const result = await fetchDeviceAuthorizations();
    if (result.ok) {
      authorizations = result.data.authorizations;
      return result.data.authorizations;
    }
    return authorizations;
  }

  function hasGrant(
    rows: DeviceAuthorizationListItem[],
    kind: DevicePairingKind,
    deviceId: string,
  ): boolean {
    return rows.some((row) => row.role === kind && row.deviceId === deviceId);
  }

  function watchForGrant(kind: DevicePairingKind, deviceId: string) {
    const generation = ++grantWatchGeneration[kind];
    void (async () => {
      const deadline = Date.now() + GRANT_WATCH_MS;
      while (generation === grantWatchGeneration[kind] && Date.now() < deadline) {
        const rows = await loadAuthorizations();
        if (generation !== grantWatchGeneration[kind]) {
          return;
        }
        if (hasGrant(rows, kind, deviceId)) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, GRANT_WATCH_INTERVAL_MS));
      }
    })();
  }

  async function confirmAndWatch(kind: DevicePairingKind, deviceId: string, code: string) {
    const result = await confirmDevicePairing(kind, code);
    if (result.ok) {
      watchForGrant(kind, deviceId);
    }
    return result;
  }

  async function unpair(authorizationId: string) {
    if (unpairBusyId) {
      return;
    }
    unpairBusyId = authorizationId;
    const result = await revokeDeviceAuthorization(authorizationId);
    unpairBusyId = null;
    if (!result.ok) {
      toastStore.add({
        type: 'error',
        message: t('mfa.deviceUnpairError'),
        timeout: 4000,
      });
      return;
    }
    await loadAuthorizations();
  }

  onMount(() => {
    void loadAuthorizations();
  });

  onDestroy(() => {
    grantWatchGeneration.tv += 1;
    grantWatchGeneration.terminal += 1;
  });

  function handleOpenMfaCheckin() {
    if (terminalDisplayLocked) {
      toastStore.add({
        type: 'warning',
        message: needsDayStartHint
          ? t('mfa.settings.terminalLockBlockedByDayReset')
          : t('mfa.settings.terminalLockedToast'),
        timeout: 4000,
      });
      return;
    }
    onOpenMfaCheckin?.();
  }
</script>

<aside class="mfa-quicksettings" aria-label={t('mfa.quicksettingsAria')}>
  <div class="qs-time-row">
    {#if clockLabel}
      <button
        type="button"
        class="qs-time-badge"
        onclick={(event) => {
          handleClockEasterEggClick(event.currentTarget, () => {
            void spawnMfaEsheep();
          });
        }}
      >
        {clockLabel}
      </button>
    {/if}
    <a
      class="qs-settings-icon-btn"
      href={resolve('/mfa/settings')}
      aria-label={t('mfa.settings.hubTitle')}
      title={t('mfa.settings.hubTitle')}
    >
      <Settings size={18} aria-hidden="true" />
    </a>
  </div>

  <TerminalLockToggle
    checkinLocked={terminalDisplayLocked}
    busy={terminalLockBusy}
    compact={true}
    hideStatus={true}
    toggleDisabled={needsDayStartHint}
    onToggle={onTerminalLockToggle}
  />

  <button type="button" class="qs-action-btn" onclick={handleOpenMfaCheckin}>
    <UserPlus size={18} aria-hidden="true" />
    <span>{t('mfa.checkinQuickAction')}</span>
  </button>

  <h3 class="qs-section-title">{t('mfa.qsFilter')}</h3>

  <WaitingListFilters
    items={filterItems}
    bind:searchQuery
    bind:laneCode
    alwaysShow={true}
    compact={true}
  />

  <div class="qs-divider" role="separator"></div>

  <section class="panel panel--sm panel--muted">
    <h3 class="panel__title panel__title--compact">{t('mfa.qsTerminal')}</h3>
    <span
      class="pill"
      class:pill--on={terminalStatus === 'online'}
      class:pill--warn={terminalStatus === 'stale'}
      class:pill--off={terminalStatus === 'offline'}
    >
      {deviceStatusLabel(terminalStatus)}
    </span>
    {#if needsDayStartHint}
      <p class="qs-panel-desc">{t('mfa.settings.terminalLockBlockedByDayReset')}</p>
    {/if}
    {#if terminalPhase === 'pairing'}
      <PairingConfirmForm
        variant="inline"
        codeLabelKey="terminal.pairingCodeLabel"
        submitKey="terminal.pairingConfirmSubmit"
        submittingKey="terminal.pairingConfirmSubmitting"
        successKey="terminal.pairingConfirmSuccess"
        errorKey="terminal.pairingConfirmError"
        deviceId={TERMINAL_DEVICE_ID}
        showSuccessMessage={false}
        confirm={(code) => confirmAndWatch('terminal', TERMINAL_DEVICE_ID, code)}
      />
    {:else if terminalPhase === 'connecting'}
      <p class="qs-panel-desc qs-connecting" aria-live="polite" aria-busy="true">
        <span class="spinner" aria-hidden="true"></span>
        {t('mfa.pairingConnecting')}
      </p>
    {:else if terminalPhase === 'disconnected' && !needsDayStartHint}
      <p class="qs-panel-desc">{t('mfa.deviceDisconnectedHint')}</p>
    {:else if terminalPhase === 'unpaired'}
      <p class="qs-panel-desc">{t('mfa.deviceUnpairedHintTerminal')}</p>
    {/if}
    {#if QUICKSETTINGS_UNPAIR_ENABLED && terminalGrant}
      <button
        type="button"
        class="qs-panel-desc"
        disabled={unpairBusyId === terminalGrant.authorizationId}
        onclick={() => void unpair(terminalGrant.authorizationId)}
      >
        {unpairBusyId === terminalGrant.authorizationId
          ? t('mfa.deviceUnpairBusy')
          : t('mfa.deviceUnpair')}
      </button>
    {/if}
  </section>

  <section class="panel panel--sm panel--muted">
    <h3 class="panel__title panel__title--compact">{t('mfa.qsTv')}</h3>
    <span
      class="pill"
      class:pill--on={tvStatus === 'online'}
      class:pill--warn={tvStatus === 'stale'}
      class:pill--off={tvStatus === 'offline'}
    >
      {deviceStatusLabel(tvStatus)}
    </span>
    {#if tvPhase === 'pairing'}
      <PairingConfirmForm
        variant="inline"
        codeLabelKey="tv.pairingCodeLabel"
        submitKey="tv.pairingConfirmSubmit"
        submittingKey="tv.pairingConfirmSubmitting"
        successKey="tv.pairingConfirmSuccess"
        errorKey="tv.pairingConfirmError"
        deviceId={WAITING_ROOM_DEVICE_ID}
        showSuccessMessage={false}
        confirm={(code) => confirmAndWatch('tv', WAITING_ROOM_DEVICE_ID, code)}
      />
    {:else if tvPhase === 'connecting'}
      <p class="qs-panel-desc qs-connecting" aria-live="polite" aria-busy="true">
        <span class="spinner" aria-hidden="true"></span>
        {t('mfa.pairingConnecting')}
      </p>
    {:else if tvPhase === 'disconnected'}
      <p class="qs-panel-desc">{t('mfa.deviceDisconnectedHint')}</p>
    {:else if tvPhase === 'unpaired'}
      <p class="qs-panel-desc">{t('mfa.deviceUnpairedHintTv')}</p>
    {/if}
    {#if QUICKSETTINGS_UNPAIR_ENABLED && tvGrant}
      <button
        type="button"
        class="qs-panel-desc"
        disabled={unpairBusyId === tvGrant.authorizationId}
        onclick={() => void unpair(tvGrant.authorizationId)}
      >
        {unpairBusyId === tvGrant.authorizationId ? t('mfa.deviceUnpairBusy') : t('mfa.deviceUnpair')}
      </button>
    {/if}
  </section>

  {#if panelGrants.length > 0}
    <section class="panel panel--sm panel--muted">
      <h3 class="panel__title panel__title--compact">{t('mfa.qsPanels')}</h3>
      {#each panelGrants as grant (grant.authorizationId)}
        {@const status = panelPresenceStatus(grant)}
        <div class="qs-panel-grant mfa-action-tooltip" data-tooltip={panelTooltip(grant)}>
          <span class="qs-panel-grant__identity">
            {#if grant.placement === 'inside'}
              <DoorOpen size={16} aria-hidden="true" />
            {:else}
              <DoorClosed size={16} aria-hidden="true" />
            {/if}
            <span>{roomLabel(grant.roomId)}</span>
          </span>
          <span
            class="pill"
            class:pill--on={status === 'online'}
            class:pill--warn={status === 'stale'}
            class:pill--off={status === 'offline'}
          >
            {deviceStatusLabel(status)}
          </span>
          {#if QUICKSETTINGS_UNPAIR_ENABLED}
            <button
              type="button"
              class="qs-panel-desc"
              disabled={unpairBusyId === grant.authorizationId}
              onclick={() => void unpair(grant.authorizationId)}
            >
              {unpairBusyId === grant.authorizationId ? t('mfa.deviceUnpairBusy') : t('mfa.deviceUnpair')}
            </button>
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</aside>
