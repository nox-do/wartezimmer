<script lang="ts">
  import PrivacyNoticeModal from '$lib/components/shared/PrivacyNoticeModal.svelte';
  import type { PrivacyNotice } from '$lib/privacy/types';

  interface Props {
    open?: boolean;
    notice: PrivacyNotice;
    onClose?: () => void;
  }

  let { open = $bindable(false), notice, onClose }: Props = $props();
</script>

<PrivacyNoticeModal bind:open {notice} closeLabelKey="terminal.privacyModalClose" {onClose} />
