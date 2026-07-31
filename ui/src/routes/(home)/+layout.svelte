<script lang="ts">
  import { onMount } from 'svelte';
  import '$lib/styles/staff-settings-layout.css';
  import StaffSettingsLayout from '$lib/components/shared/StaffSettingsLayout.svelte';
  import { publicFetch } from '$lib/api/public-fetch';
  import { tf } from '$lib/i18n/i18nStore.svelte';
  import { HOME_NAV } from '$lib/home/nav';

  let { children } = $props();
  let stackVersion = $state<string | null>(null);

  const footerMeta = $derived(
    stackVersion ? tf('home.stackVersion', { version: stackVersion }) : null,
  );

  onMount(() => {
    void loadStackVersion();
  });

  async function loadStackVersion() {
    const result = await publicFetch<{ stackVersion?: string | null }>('/api/v1/ops/health', {
      method: 'GET',
    });
    if (
      result.ok &&
      typeof result.data.stackVersion === 'string' &&
      result.data.stackVersion.trim()
    ) {
      stackVersion = result.data.stackVersion.trim();
    }
  }
</script>

<StaffSettingsLayout subtitleKey="home.subtitle" nav={HOME_NAV} footerMeta={footerMeta}>
  {@render children()}
</StaffSettingsLayout>
