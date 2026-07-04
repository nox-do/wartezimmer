<script lang="ts">
  import '$lib/styles/terminal.css';
  import { onMount, setContext } from 'svelte';
  import DevicePairingPrompt from '$lib/components/auth/DevicePairingPrompt.svelte';
  import PatientLangPicker from '$lib/components/shared/PatientLangPicker.svelte';
  import { createDevicePairingRuntime } from '$lib/auth/device-pairing-runtime';
  import { TERMINAL_DEVICE_ID } from '$lib/ops/device-presence-api';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { fetchTerminalHeartbeat } from '$lib/terminal/terminal-api';
  import {
    connectTerminalDeviceStream,
    SSE_CLIENT_ERROR,
  } from '$lib/terminal/terminal-device-stream';
  import { portal } from '$lib/actions/portal';
  import TerminalPrintSettingsModal from '$lib/components/terminal/TerminalPrintSettingsModal.svelte';
  import TerminalReceiptPrintHost from '$lib/components/terminal/TerminalReceiptPrintHost.svelte';
  import {
    TERMINAL_OPS_CONTEXT_KEY,
    type TerminalOpsSnapshot,
  } from '$lib/terminal/terminal-ops-context';
  import { DEFAULT_TERMINAL_PATIENT_LOCALES } from '@praxis-flow/domain';
  let { children } = $props();

  let printSettingsOpen = $state(false);
  let printHotspotTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPrintHotspotTimer() {
    if (printHotspotTimer) {
      clearTimeout(printHotspotTimer);
      printHotspotTimer = null;
    }
  }

  function startPrintHotspotPress() {
    clearPrintHotspotTimer();
    printHotspotTimer = setTimeout(() => {
      printHotspotTimer = null;
      printSettingsOpen = true;
    }, 2500);
  }

  let ops = $state<TerminalOpsSnapshot>({
    loading: true,
    deviceAuthorized: false,
    checkinLocked: false,
    emergencyEnabled: false,
    terminalWlanPromoEnabled: false,
    terminalAuthPhoneEnabled: false,
    terminalAuthNameDobEnabled: false,
    terminalAuthEgkEnabled: false,
    terminalPatientLocales: [...DEFAULT_TERMINAL_PATIENT_LOCALES],
    emergencyActive: false,
  });

  setContext(TERMINAL_OPS_CONTEXT_KEY, ops);

  let pairingCode = $state<string | null>(null);
  let pairingExpiresAt = $state<string | null>(null);
  let pairingError = $state<string | null>(null);

  onMount(() => {
    let stopped = false;
    let deviceStreamCleanup: (() => void) | null = null;

    const pairing = createDevicePairingRuntime({
      kind: 'terminal',
      deviceId: TERMINAL_DEVICE_ID,
      messages: {
        startError: t('terminal.pairingStartError'),
        statusError: t('terminal.pairingStatusError'),
        expired: t('terminal.pairingExpired'),
      },
      isStopped: () => stopped,
      onState: (state) => {
        pairingCode = state.code;
        pairingExpiresAt = state.expiresAt;
        pairingError = state.error;
      },
      onPaired: async () => {
        ops.deviceAuthorized = true;
        ensureDeviceStream();
        await refresh();
      },
    });

    function stopDeviceStream() {
      deviceStreamCleanup?.();
      deviceStreamCleanup = null;
    }

    function resetDeviceAuthorization() {
      stopDeviceStream();
      ops.deviceAuthorized = false;
      pairing.clearPairing();
    }

    function ensureDeviceStream() {
      if (deviceStreamCleanup) {
        return;
      }
      startDeviceStream();
    }

    function startDeviceStream() {
      stopDeviceStream();
      deviceStreamCleanup = connectTerminalDeviceStream({
        onError: (message) => {
          if (
            message === SSE_CLIENT_ERROR.unauthorized ||
            message === SSE_CLIENT_ERROR.forbidden
          ) {
            resetDeviceAuthorization();
            void pairing.startPairing();
          }
        },
      });
    }

    async function refresh() {
      const result = await fetchTerminalHeartbeat();
      if (stopped) {
        return false;
      }
      if (!result.ok) {
        ops.loading = false;
        if (result.error.status === 401 || result.error.status === 403) {
          resetDeviceAuthorization();
          void pairing.startPairing();
          return false;
        }
        pairingError = result.error.message;
        return true;
      }

      ops.loading = false;
      ops.deviceAuthorized = true;
      pairingError = null;
      ensureDeviceStream();
      ops.checkinLocked = result.data.checkinLocked;
      ops.emergencyEnabled = result.data.emergencyEnabled;
      ops.terminalWlanPromoEnabled = result.data.terminalWlanPromoEnabled;
      ops.terminalAuthPhoneEnabled = result.data.terminalAuthPhoneEnabled;
      ops.terminalAuthNameDobEnabled = result.data.terminalAuthNameDobEnabled;
      ops.terminalAuthEgkEnabled = result.data.terminalAuthEgkEnabled;
      ops.terminalPatientLocales = result.data.terminalPatientLocales;
      ops.emergencyActive = result.data.emergencyActive;
      return true;
    }

    void refresh().then((authorized) => {
      if (!authorized) {
        void pairing.startPairing();
      }
    });
    const timer = setInterval(() => {
      if (ops.deviceAuthorized) {
        void refresh().then((authorized) => {
          if (!authorized) {
            void pairing.startPairing();
          }
        });
      } else if (pairing.isPairingActive()) {
        void pairing.pollPairing();
      } else {
        void pairing.startPairing();
      }
    }, 1_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh().then((authorized) => {
          if (!authorized) {
            void pairing.startPairing();
          }
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      stopped = true;
      stopDeviceStream();
      pairing.destroy();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
</script>

<div class="terminal-page">
  <PatientLangPicker enabledLocales={ops.terminalPatientLocales} />
  <div class="terminal-print-setup-hotspot-wrap" use:portal={9990}>
    <button
      type="button"
      class="terminal-print-setup-hotspot"
      aria-label={t('terminal.printSettingsHotspotAria')}
      tabindex="-1"
      onpointerdown={startPrintHotspotPress}
      onpointerup={clearPrintHotspotTimer}
      onpointercancel={clearPrintHotspotTimer}
      oncontextmenu={(event) => event.preventDefault()}
    ></button>
  </div>
  <TerminalPrintSettingsModal bind:open={printSettingsOpen} />
  {#if ops.deviceAuthorized}
    <TerminalReceiptPrintHost />
    {@render children()}
  {:else}
    <DevicePairingPrompt
      titleKey="terminal.pairingTitle"
      hintKey="terminal.pairingHint"
      codeLabelKey="terminal.pairingCodeLabel"
      code={pairingCode}
      expiresText={pairingExpiresAt
        ? tf('terminal.pairingExpires', {
            expiresAt: new Date(pairingExpiresAt).toLocaleTimeString(),
          })
        : null}
      error={pairingError}
      loading={ops.loading}
    />
  {/if}
</div>

