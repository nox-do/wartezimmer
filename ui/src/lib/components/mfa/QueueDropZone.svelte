<script lang="ts">
  import { createDroppable } from '@dnd-kit/svelte';
  import type { Snippet } from 'svelte';
  import { tf } from '$lib/i18n/i18nStore.svelte';
  import type { QueueDropTarget } from '$lib/queue/queue-drop-resolver';

  interface Props {
    dropId: string;
    target: QueueDropTarget;
    dropLabel: string;
    highlighted?: boolean;
    dropDisabled?: boolean;
    variant?: 'room' | 'waiting' | 'away';
    class?: string;
    children?: Snippet;
  }

  let {
    dropId,
    target,
    dropLabel,
    highlighted = false,
    dropDisabled = false,
    variant = 'room',
    class: className = '',
    children,
  }: Props = $props();

  const { attach, isDropTarget } = createDroppable({
    get id() {
      return dropId;
    },
    get data() {
      return dropDisabled ? undefined : target;
    },
    get disabled() {
      return dropDisabled;
    },
    collisionPriority: 100,
  });

  const showTarget = $derived(!dropDisabled && (isDropTarget || highlighted));
</script>

<section
  {@attach attach}
  class="queue-drop-zone queue-drop-zone--{variant} {className}"
  class:queue-drop-zone--active={showTarget}
  class:queue-drop-zone--disabled={dropDisabled}
  data-drop-target={dropLabel}
>
  {#if showTarget}
    <div class="queue-drop-zone-banner" role="status" aria-live="polite">
      <span class="queue-drop-zone-banner-label">{tf('mfa.dropTargetHint', { target: dropLabel })}</span>
    </div>
  {/if}

  {@render children?.()}
</section>

