<script lang="ts">
  import { confirmDevicePairing } from '$lib/auth/device-pairing-client';
  import PairingConfirmCard from '$lib/components/auth/PairingConfirmCard.svelte';
  import { WAITING_ROOM_DEVICE_ID } from '$lib/ops/device-presence-api';
</script>

<PairingConfirmCard
  kickerKey="tv.pairingMfaKicker"
  titleKey="tv.pairingMfaTitle"
  leadKey="tv.pairingMfaLead"
  codeLabelKey="tv.pairingCodeLabel"
  submitKey="tv.pairingConfirmSubmit"
  submittingKey="tv.pairingConfirmSubmitting"
  successKey="tv.pairingConfirmSuccess"
  errorKey="tv.pairingConfirmError"
  deviceId={WAITING_ROOM_DEVICE_ID}
  confirm={(code) => confirmDevicePairing('tv', code)}
/>
