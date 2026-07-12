<script lang="ts">
  import { Settings, UserPlus } from '@lucide/svelte';
  import { confirmDevicePairing } from '$lib/auth/device-pairing-client';
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
  import { TERMINAL_DEVICE_ID, WAITING_ROOM_DEVICE_ID } from '$lib/ops/device-presence-api';
  import TerminalLockToggle from '$lib/components/mfa/TerminalLockToggle.svelte';
  import { handleClockEasterEggClick } from '$lib/mfa/clock-easter-egg';
  import { spawnMfaEsheep } from '$lib/mfa/esheep';
  import type { QueueItem } from '$lib/queue/types';

  interface Props {
    clockLabel?: string | null;
    checkinLocked: boolean;
    terminalLockBusy?: boolean;
    needsDayStartHint?: boolean;
    filterItems?: QueueItem[];
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
        confirm={(code) => confirmDevicePairing('terminal', code)}
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
        confirm={(code) => confirmDevicePairing('tv', code)}
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
  </section>

  <div class="qs-divider" role="separator"></div>

  <button type="button" class="qs-action-btn" onclick={handleOpenMfaCheckin}>
    <UserPlus size={18} aria-hidden="true" />
    <span>{t('mfa.checkinQuickAction')}</span>
  </button>

  <WaitingListFilters
    items={filterItems}
    bind:searchQuery
    bind:laneCode
    alwaysShow={true}
    compact={true}
  />
</aside>
