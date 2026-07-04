<script lang="ts">
  import PrivacyNoticeModal from '$lib/components/shared/PrivacyNoticeModal.svelte';
  import type { FormPrivacyNotice } from '$lib/portal/patient-document-api';

  interface Props {
    open?: boolean;
    notice: FormPrivacyNotice | null;
    translatedTitle?: string | null;
    translatedParagraphs?: string[];
    onClose?: () => void;
  }

  let {
    open = $bindable(false),
    notice,
    translatedTitle = null,
    translatedParagraphs = [],
    onClose,
  }: Props = $props();
</script>

<PrivacyNoticeModal
  bind:open
  {notice}
  title={translatedTitle}
  paragraphs={translatedParagraphs}
  closeLabelKey="portal.anamnesePrivacyModalClose"
  {onClose}
/>
