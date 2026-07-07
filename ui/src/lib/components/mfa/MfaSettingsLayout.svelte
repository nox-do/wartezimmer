<script lang="ts">
  import type { Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import {
    MFA_SETTINGS_NAV,
    isMfaSettingsItemActive,
  } from '$lib/mfa/settings-nav';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
  let mainEl = $state<HTMLElement | null>(null);

  const pathname = $derived(page.url.pathname);

  afterNavigate(({ to, from }) => {
    if (!mainEl || !to || to.url.pathname === from?.url.pathname) {
      return;
    }
    mainEl.scrollTop = 0;
  });
</script>

<div class="mfa-settings-layout">
  <aside class="mfa-settings-sidebar" aria-label={t('mfa.settings.hubTitle')}>
    <header class="mfa-settings-sidebar__top">
      <a class="mfa-settings-sidebar__back" href="/mfa">
        <span aria-hidden="true">←</span>
        {t('mfa.settings.navBack')}
      </a>

      <div class="mfa-settings-sidebar__brand">
        <span class="mfa-settings-sidebar__mark" aria-hidden="true"></span>
        <div>
          <strong class="mfa-settings-sidebar__title">Praxis Flow</strong>
          <span class="mfa-settings-sidebar__subtitle">{t('mfa.settings.hubTitle')}</span>
        </div>
      </div>
    </header>

    <nav class="mfa-settings-nav">
      {#each MFA_SETTINGS_NAV as group (group.id)}
        <div class="mfa-settings-nav__group">
          <a
            class="mfa-settings-nav__group-link"
            class:mfa-settings-nav__group-link--active={pathname === group.href}
            href={group.href}
            aria-current={pathname === group.href ? 'page' : undefined}
          >
            {t(group.labelKey)}
          </a>

          {#if group.children.length > 0}
            <ul class="mfa-settings-nav__children">
              {#each group.children as item (item.id)}
                {@const itemActive = isMfaSettingsItemActive(pathname, item.href)}
                <li>
                  <a
                    class="mfa-settings-nav__child-link"
                    class:mfa-settings-nav__child-link--active={itemActive}
                    href={item.href}
                    aria-current={itemActive ? 'page' : undefined}
                  >
                    {t(item.labelKey)}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </nav>

    <footer class="mfa-settings-sidebar__footer">
      <a
        class="mfa-settings-sidebar__footer-link"
        href="/ops"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('mfa.settings.hubOpsLinkAria')}
      >
        {t('mfa.settings.hubOpsLink')}
      </a>
    </footer>
  </aside>

  <div class="mfa-settings-main" bind:this={mainEl}>
    {@render children()}
  </div>
</div>
