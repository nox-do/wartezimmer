<script lang="ts">
  import { formatClockTime } from '$lib/queue/format-time';
  import { acknowledgeEmergency } from '$lib/mfa/emergency-api';
  import { t, tf } from '$lib/i18n/i18nStore.svelte';
  import { toastStore } from '$lib/stores/toastStore';

  interface Props {
    emergencyId: string;
    raisedAt: string;
    onAcknowledged?: () => void;
  }

  let { emergencyId, raisedAt, onAcknowledged }: Props = $props();
  let busy = $state(false);

  const alarmLabel = $derived(tf('mfa.emergencyAlarm', { time: formatClockTime(raisedAt) }));

  async function onAcknowledge() {
    if (busy) {
      return;
    }

    busy = true;
    const result = await acknowledgeEmergency(emergencyId);
    busy = false;

    if (!result.ok) {
      toastStore.error(result.error.message || t('mfa.emergencyAckError'));
      return;
    }

    onAcknowledged?.();
  }
</script>

<div class="alert alert--emergency" role="alert">
  <div>
    <strong>{t('mfa.emergencyTitle')}</strong>
    <p>{alarmLabel}{t('mfa.emergencyRespond')}</p>
  </div>
  <button type="button" class="alert__action" disabled={busy} onclick={() => void onAcknowledge()}>
    {busy ? t('mfa.emergencyAckBusy') : t('mfa.emergencyAck')}
  </button>
</div>

