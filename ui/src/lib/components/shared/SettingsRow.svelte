<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Attachment } from 'svelte/attachments';

  interface Props {
    title: string;
    description?: string | Snippet;
    variant?: 'list' | 'disclosure';
    leading?: Snippet;
    trailing?: Snippet;
    mainClass?: string;
    mainTitle?: string;
    mainAttachment?: Attachment<HTMLElement>;
  }

  let {
    title,
    description,
    variant = 'list',
    leading,
    trailing,
    mainClass = '',
    mainTitle,
    mainAttachment,
  }: Props = $props();
  const element = $derived(variant === 'disclosure' ? 'span' : 'div');
</script>

<svelte:element
  this={element}
  class="settings-row__main {mainClass}"
  class:settings-row__main--disclosure={variant === 'disclosure'}
  title={mainTitle}
  {@attach mainAttachment}
>
  {#if leading}{@render leading()}{/if}
  <svelte:element this={element} class="settings-row__text">
    <span class="settings-row__title">{title}</span>
    {#if description}
      <span class="settings-row__description">
        {#if typeof description === 'string'}{description}{:else}{@render description()}{/if}
      </span>
    {/if}
  </svelte:element>
</svelte:element>
{#if trailing}
  <svelte:element
    this={element}
    class="settings-row__actions"
    class:settings-row__actions--disclosure={variant === 'disclosure'}
  >
    {@render trailing()}
  </svelte:element>
{/if}
