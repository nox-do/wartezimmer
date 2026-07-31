<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import StaffSettingsLayout from '$lib/components/shared/StaffSettingsLayout.svelte';
  import { fetchRoutingCapabilities, type RoutingCapabilities } from '$lib/mfa/practice-ops-api';
  import { buildMfaSettingsNav } from '$lib/mfa/settings-nav';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
  let routingCapabilities = $state<RoutingCapabilities | null>(null);
  const settingsNav = $derived(buildMfaSettingsNav(routingCapabilities));

  onMount(() => {
    void fetchRoutingCapabilities().then((result) => {
      if (result.ok) {
        routingCapabilities = result.data;
      }
    });
  });
</script>

<StaffSettingsLayout
  subtitleKey="mfa.settings.hubTitle"
  backHref="/mfa"
  backLabelKey="mfa.settings.navBack"
  nav={settingsNav}
  footer={{
    href: '/ops/practice',
    labelKey: 'mfa.settings.hubOpsLink',
    ariaLabelKey: 'mfa.settings.hubOpsLinkAria',
    external: true,
  }}
>
  {@render children()}
</StaffSettingsLayout>
