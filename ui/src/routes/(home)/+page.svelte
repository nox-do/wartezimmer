<script lang="ts">
  import StaffSettingsShell from '$lib/components/shared/StaffSettingsShell.svelte';
  import HomeLinkCards from '$lib/components/home/HomeLinkCards.svelte';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import { HOME_QUICK_LINKS } from '$lib/home/nav';

  const cards = $derived(
    HOME_QUICK_LINKS.map((link) => ({
      id: link.id,
      href: link.href,
      title: t(link.labelKey),
      subtitle: link.leadKey ? t(link.leadKey) : undefined,
    })),
  );
</script>

<StaffSettingsShell title={t('home.navQuick')} lead={t('home.quickLead')}>
  <HomeLinkCards items={cards} ariaLabel={t('home.navQuick')} />
</StaffSettingsShell>
