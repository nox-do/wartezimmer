<script lang="ts">
  import type { Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { resolvedHref } from '$lib/navigation/kit-paths';
  import { t } from '$lib/i18n/i18nStore.svelte';
  import type { TranslationKey } from '$lib/i18n/core/translation-keys';
  import { PRODUCT_NAME } from '$lib/brand';
  import ProductMark from './ProductMark.svelte';
  import {
    isStaffSettingsHrefActive,
    isStaffSettingsItemActive,
    type StaffSettingsFooterLink,
    type StaffSettingsNavGroup,
  } from '$lib/staff/settings-nav';

  interface Props {
    subtitleKey: TranslationKey;
    backHref?: string;
    backLabelKey?: TranslationKey;
    nav: StaffSettingsNavGroup[];
    footer?: StaffSettingsFooterLink;
    /** Optional meta line in the sidebar footer (e.g. stack version). */
    footerMeta?: string | null;
    children: Snippet;
  }

  let {
    subtitleKey,
    backHref,
    backLabelKey,
    nav,
    footer,
    footerMeta = null,
    children,
  }: Props = $props();
  let mainEl = $state<HTMLElement | null>(null);

  const pathname = $derived(page.url.pathname);
  const showFooter = $derived(Boolean(footer) || Boolean(footerMeta));

  function displayLabel(entry: { labelKey?: TranslationKey; label?: string }): string {
    if (entry.label) {
      return entry.label;
    }
    if (entry.labelKey) {
      return t(entry.labelKey);
    }
    return '';
  }

  function linkAttrs(external?: boolean) {
    if (!external) {
      return {};
    }
    return { target: '_blank', rel: 'noopener noreferrer' } as const;
  }

  function isGroupActive(group: StaffSettingsNavGroup): boolean {
    if (!group.href) {
      return false;
    }
    if (group.children.length > 0) {
      return pathname === group.href;
    }
    return isStaffSettingsHrefActive(pathname, group.href);
  }

  afterNavigate(({ to, from }) => {
    if (!mainEl || !to || to.url.pathname === from?.url.pathname) {
      return;
    }
    mainEl.scrollTop = 0;
  });
</script>

<div class="staff-settings-layout">
  <aside class="staff-settings-sidebar" aria-label={t(subtitleKey)}>
    <header class="staff-settings-sidebar__top">
      {#if backHref && backLabelKey}
        <!-- resolvedHref() wraps $app/paths resolve(); ESLint only recognizes resolve() in .svelte templates. -->
        <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
        <a class="staff-settings-sidebar__back" href={resolvedHref(backHref)}>
          <span aria-hidden="true">←</span>
          {t(backLabelKey)}
        </a>
      {/if}

      <div class="staff-settings-sidebar__brand">
        <ProductMark />
        <div>
          <strong class="staff-settings-sidebar__title">{PRODUCT_NAME}</strong>
          <span class="staff-settings-sidebar__subtitle">{t(subtitleKey)}</span>
        </div>
      </div>
    </header>

    <nav class="staff-settings-nav">
      {#each nav as group (group.id)}
        {@const groupActive = isGroupActive(group)}
        <div class="staff-settings-nav__group">
          {#if group.href}
            <!-- resolvedHref() wraps $app/paths resolve(); ESLint only recognizes resolve() in .svelte templates. -->
            <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
            <a class="staff-settings-nav__group-link" class:staff-settings-nav__group-link--active={groupActive} href={resolvedHref(group.href)} aria-current={pathname === group.href ? 'page' : undefined} {...linkAttrs(group.external)}>
              {displayLabel(group)}
            </a>
          {:else}
            <div class="staff-settings-nav__heading">{displayLabel(group)}</div>
          {/if}

          {#if group.children.length > 0}
            <ul class="staff-settings-nav__children">
              {#each group.children as item (item.id)}
                {@const itemActive = isStaffSettingsItemActive(pathname, item.href)}
                <li>
                  <!-- resolvedHref() wraps $app/paths resolve(); ESLint only recognizes resolve() in .svelte templates. -->
                  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                  <a class="staff-settings-nav__child-link" class:staff-settings-nav__child-link--active={itemActive} href={resolvedHref(item.href)} aria-current={itemActive ? 'page' : undefined} {...linkAttrs(item.external)}>
                    {displayLabel(item)}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </nav>

    {#if showFooter}
      <footer class="staff-settings-sidebar__footer">
        {#if footer}
          <!-- resolvedHref() wraps $app/paths resolve(); ESLint only recognizes resolve() in .svelte templates. -->
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a class="staff-settings-sidebar__footer-link" href={resolvedHref(footer.href)} {...linkAttrs(footer.external)} aria-label={footer.ariaLabelKey ? t(footer.ariaLabelKey) : undefined}>
            {t(footer.labelKey)}
          </a>
        {/if}
        {#if footerMeta}
          <span class="staff-settings-sidebar__footer-meta">{footerMeta}</span>
        {/if}
      </footer>
    {/if}
  </aside>

  <div class="staff-settings-main" bind:this={mainEl}>
    {@render children()}
  </div>
</div>
