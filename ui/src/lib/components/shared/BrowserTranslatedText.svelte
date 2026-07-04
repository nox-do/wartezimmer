<script lang="ts">
  import { locale } from '$lib/i18n/i18nStore.svelte';
  import { translateDynamicLabelsWithRetry, translatorReadyTick } from '$lib/i18n/browser-translator';

  interface Props {
    /** Original text from backend (typically German). */
    text: string;
  }

  let { text }: Props = $props();

  let displayText = $state('');

  $effect(() => {
    const source = text;
    const currentLocale = $locale;
    void $translatorReadyTick;

    if (!source.trim()) {
      displayText = source;
      return;
    }

    let cancelled = false;
    displayText = source;

    void translateDynamicLabelsWithRetry([source], currentLocale, () => cancelled).then((map) => {
      if (!cancelled) {
        displayText = map.get(source) ?? source;
      }
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<span>{displayText}</span>
