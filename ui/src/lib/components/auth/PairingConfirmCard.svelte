<script lang="ts">
  import PairingConfirmForm from '$lib/components/auth/PairingConfirmForm.svelte';
  import type { DevicePairingConfirmResponse } from '$lib/auth/device-pairing-client';
  import type { Result } from '$lib/types/result';

  type Props = {
    kickerKey: string;
    titleKey: string;
    leadKey: string;
    codeLabelKey: string;
    submitKey: string;
    submittingKey: string;
    successKey: string;
    errorKey: string;
    connectingKey?: string;
    deviceId?: string;
    confirm: (code: string) => Promise<Result<DevicePairingConfirmResponse>>;
  };

  let {
    kickerKey,
    titleKey,
    leadKey,
    codeLabelKey,
    submitKey,
    submittingKey,
    successKey,
    errorKey,
    connectingKey,
    deviceId,
    confirm,
  }: Props = $props();
</script>

<PairingConfirmForm
  variant="page"
  {kickerKey}
  {titleKey}
  {leadKey}
  {codeLabelKey}
  {submitKey}
  {submittingKey}
  {successKey}
  {errorKey}
  {connectingKey}
  {deviceId}
  {confirm}
/>
