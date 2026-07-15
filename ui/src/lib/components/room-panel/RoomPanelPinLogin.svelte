<script lang="ts">
  import { LogIn } from '@lucide/svelte';
  import TerminalDobNumpad from '$lib/components/terminal/TerminalDobNumpad.svelte';
  import Button from '$lib/components/forms/Button.svelte';
  import type { RoomPanelRoom } from '$lib/room-panel/room-panel-api';
  import { roomPanelLoginKey } from '$lib/room-panel/room-panel-login-key';
  import { t } from '$lib/i18n/i18nStore.svelte';

  const PIN_MIN_LENGTH = 4;
  const PIN_MAX_LENGTH = 12;

  interface Props {
    rooms: RoomPanelRoom[];
    selectedLoginKey?: string;
    pin?: string;
    pinRequired?: boolean;
    loading?: boolean;
    submitting?: boolean;
    errorMessage?: string | null;
    onSubmit?: () => void;
  }

  let {
    rooms,
    selectedLoginKey = $bindable(''),
    pin = $bindable(''),
    pinRequired = true,
    loading = false,
    submitting = false,
    errorMessage = null,
    onSubmit,
  }: Props = $props();

  const canSubmit = $derived(
    Boolean(selectedLoginKey) && (pinRequired ? pin.length >= PIN_MIN_LENGTH : true) && !submitting,
  );

  function appendDigit(digit: string) {
    if (submitting || !/^\d$/.test(digit) || pin.length >= PIN_MAX_LENGTH) {
      return;
    }
    pin += digit;
  }

  function backspace() {
    if (submitting) {
      return;
    }
    pin = pin.slice(0, -1);
  }

  function clearPin() {
    if (submitting) {
      return;
    }
    pin = '';
  }

  function submit() {
    if (!canSubmit) {
      return;
    }
    onSubmit?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (submitting || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      appendDigit(event.key);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      backspace();
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      clearPin();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<form
  class="room-panel-login__form room-panel-pin-login"
  onsubmit={(event) => {
    event.preventDefault();
    submit();
  }}
>
  {#if loading}
    <p class="text-muted">{t('ui.loading')}</p>
  {:else if rooms.length === 0}
    <p class="room-panel-login__error">{t('roomPanel.noRooms')}</p>
  {:else}
    <label class="modal-form-field">
      <span>{t('roomPanel.roomLabel')}</span>
      <select class="form-select" bind:value={selectedLoginKey} disabled={submitting}>
        {#each rooms as room (roomPanelLoginKey(room))}
          <option value={roomPanelLoginKey(room)}>
            {room.roomLabel} – {t(`mfa.settings.roomPanelPlacementShort_${room.placement}`)}
          </option>
        {/each}
      </select>
    </label>

    {#if pinRequired}
      <div class="room-panel-pin-login__pin-field">
        <span class="room-panel-pin-login__pin-label">{t('auth.pinLabel')}</span>
        <div
          class="room-panel-pin-login__pin-display"
          class:room-panel-pin-login__pin-display--empty={pin.length === 0}
          aria-live="polite"
          aria-label={t('auth.pinLabel')}
        >
          {#if pin.length === 0}
            <span class="room-panel-pin-login__pin-placeholder">{t('roomPanel.pinPlaceholder')}</span>
          {:else}
            {#each Array.from({ length: pin.length }) as _, index (index)}
              <span class="room-panel-pin-login__pin-dot" aria-hidden="true">●</span>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    {#if errorMessage}
      <p class="room-panel-login__error" role="alert">{errorMessage}</p>
    {/if}

    {#if pinRequired}
      <TerminalDobNumpad
        disabled={submitting}
        onDigit={appendDigit}
        onClear={clearPin}
        onBackspace={backspace}
      />
    {/if}

    <Button type="submit" variant="primary" fullWidth disabled={!canSubmit} loading={submitting}>
      <LogIn size={18} aria-hidden="true" />
      {t('roomPanel.loginSubmit')}
    </Button>
  {/if}
</form>
