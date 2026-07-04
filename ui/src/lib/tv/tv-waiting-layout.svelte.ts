import { tick } from 'svelte';
import {
  buildWaitingListLayout,
  WAITING_PAGE_MS,
  type WaitingListLayout,
} from '$lib/tv/waiting-list-layout';
import { tvDisplay } from '$lib/tv/tv-display.svelte';
import type { TvWaitingRow } from '$lib/tv/tv-queue';

export const tvWaitingLayout = $state({
  layout: { columns: 1, pages: [[]] } as WaitingListLayout<TvWaitingRow>,
  pageIndex: 0,
});

let layoutSyncGeneration = 0;
let previousWaitingCount = -1;

export function getVisibleWaiting() {
  return tvWaitingLayout.layout.pages[tvWaitingLayout.pageIndex] ?? [];
}

export function getWaitingPageCount() {
  return tvWaitingLayout.layout.pages.length;
}

export function getWaitingPaginated() {
  return getWaitingPageCount() > 1;
}

async function syncWaitingLayout(generation: number, viewportEl: HTMLDivElement | null) {
  await tick();
  if (generation !== layoutSyncGeneration) {
    return;
  }

  const waiting = tvDisplay.waiting;

  if (!viewportEl || waiting.length === 0) {
    tvWaitingLayout.layout = { columns: 1, pages: [[]] };
    tvWaitingLayout.pageIndex = 0;
    return;
  }

  tvWaitingLayout.layout = { columns: 1, pages: [waiting] };
  await tick();
  if (generation !== layoutSyncGeneration) {
    return;
  }

  const viewportHeight = viewportEl.clientHeight;
  let itemHeight = viewportEl.querySelector('.tv-num-item')?.getBoundingClientRect().height ?? 0;
  let layout = buildWaitingListLayout(waiting, viewportHeight, itemHeight);

  if (layout.columns === 2) {
    tvWaitingLayout.layout = { columns: 2, pages: [waiting] };
    await tick();
    if (generation !== layoutSyncGeneration) {
      return;
    }
    itemHeight =
      viewportEl.querySelector('.tv-num-item')?.getBoundingClientRect().height ?? itemHeight;
    layout = buildWaitingListLayout(waiting, viewportHeight, itemHeight);
  }

  if (generation !== layoutSyncGeneration) {
    return;
  }

  tvWaitingLayout.layout = layout;
  if (tvWaitingLayout.pageIndex >= layout.pages.length) {
    tvWaitingLayout.pageIndex = 0;
  }
}

export function requestWaitingLayoutSync(resetPage: boolean, viewportEl: HTMLDivElement | null) {
  if (resetPage) {
    tvWaitingLayout.pageIndex = 0;
  }
  layoutSyncGeneration += 1;
  void syncWaitingLayout(layoutSyncGeneration, viewportEl);
}

export function resetTvWaitingLayout() {
  tvWaitingLayout.layout = { columns: 1, pages: [[]] };
  tvWaitingLayout.pageIndex = 0;
  layoutSyncGeneration = 0;
  previousWaitingCount = -1;
}

type TvWaitingLayoutRefs = {
  getPanelEl: () => HTMLElement | null;
  getViewportEl: () => HTMLDivElement | null;
};

export function mountTvWaitingLayout(refs: TvWaitingLayoutRefs): () => void {
  resetTvWaitingLayout();

  const stopLayoutEffects = $effect.root(() => {
    $effect(() => {
      const panel = refs.getPanelEl();
      const viewport = refs.getViewportEl();
      const waitingCount = tvDisplay.waiting.length;
      const isLoading = tvDisplay.loading;
      const resetPage = previousWaitingCount !== waitingCount;

      previousWaitingCount = waitingCount;
      requestWaitingLayoutSync(resetPage, viewport);

      if (!panel || !viewport || isLoading) {
        return;
      }

      const onLayoutChange = () => {
        requestWaitingLayoutSync(false, refs.getViewportEl());
      };

      const layoutObserver = new ResizeObserver(onLayoutChange);
      layoutObserver.observe(panel);
      layoutObserver.observe(viewport);
      window.addEventListener('resize', onLayoutChange);

      return () => {
        layoutObserver.disconnect();
        window.removeEventListener('resize', onLayoutChange);
      };
    });

    $effect(() => {
      if (!getWaitingPaginated()) {
        return;
      }

      const timer = setInterval(() => {
        tvWaitingLayout.pageIndex = (tvWaitingLayout.pageIndex + 1) % getWaitingPageCount();
      }, WAITING_PAGE_MS);

      return () => {
        clearInterval(timer);
      };
    });
  });

  return () => {
    stopLayoutEffects();
    resetTvWaitingLayout();
  };
}
