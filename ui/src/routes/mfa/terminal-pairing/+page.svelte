<script lang="ts">
  import { confirmDevicePairing } from '$lib/auth/device-pairing-client';
  import PairingConfirmCard from '$lib/components/auth/PairingConfirmCard.svelte';
  import { TERMINAL_DEVICE_ID } from '$lib/ops/device-presence-api';
</script>

<PairingConfirmCard
  kickerKey="terminal.pairingMfaKicker"
  titleKey="terminal.pairingMfaTitle"
  leadKey="terminal.pairingMfaLead"
  codeLabelKey="terminal.pairingCodeLabel"
  submitKey="terminal.pairingConfirmSubmit"
  submittingKey="terminal.pairingConfirmSubmitting"
  successKey="terminal.pairingConfirmSuccess"
  errorKey="terminal.pairingConfirmError"
  deviceId={TERMINAL_DEVICE_ID}
  confirm={(code) => confirmDevicePairing('terminal', code)}
/>
