<script lang="ts">
  import { t } from '$lib/i18n/i18nStore.svelte';

  type TriageLevel = 'red' | 'yellow' | 'green' | null;

  interface Props {
    level?: TriageLevel;
    disabled?: boolean;
    onclick?: () => void;
  }

  let { level = null, disabled = false, onclick }: Props = $props();

  const tooltipKey = $derived(
    level === 'red'
      ? 'mfa.triageRed'
      : level === 'yellow'
        ? 'mfa.triageYellow'
        : level === 'green'
          ? 'mfa.triageGreen'
          : 'mfa.triageNone',
  );
</script>

<button
  type="button"
  class="btn-staff-sm btn-staff-sm--icon btn-staff-sm--triage"
  class:btn-staff-sm--triage-red={level === 'red'}
  class:btn-staff-sm--triage-yellow={level === 'yellow'}
  class:btn-staff-sm--triage-green={level === 'green'}
  class:btn-staff-sm--triage-none={level == null}
  {disabled}
  aria-label={t(tooltipKey)}
  title={t(tooltipKey)}
  {onclick}
></button>
