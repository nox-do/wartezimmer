import { tick } from 'svelte';
import {
  buildWaitingListLayout,
  rowsThatFit,
  WAITING_PAGE_MS,
  type WaitingListLayout,
} from '$lib/tv/waiting-list-layout';

const SINGLE_COLUMN_OPTIONS = { viewportWidth: 0, minColumnWidth: 1 } as const;

export type TvPanelLayoutModel<T> = {
  layout: WaitingListLayout<T>;
  pageIndex: number;
};

type TvPanelLayoutConfig<T> = {
  getItems: () => T[];
  getPanelEl: () => HTMLElement | null;
  getViewportEl: () => HTMLDivElement | null;
  getPaused?: () => boolean;
  allowTwoColumns?: boolean;
  shrinkOnOverflow?: boolean;
};

function pageOverflows(viewportEl: HTMLDivElement): boolean {
  const listEl = viewportEl.querySelector('[data-tv-list]');
  if (!listEl) {
    return false;
  }
  return listEl.scrollHeight > viewportEl.clientHeight + 1;
}

async function syncPanelLayout<T>(
  generation: number,
  isCurrent: (generation: number) => boolean,
  model: TvPanelLayoutModel<T>,
  viewportEl: HTMLDivElement | null,
  items: T[],
  options: { allowTwoColumns: boolean; shrinkOnOverflow: boolean },
) {
  await tick();
  if (!isCurrent(generation)) {
    return;
  }

  if (!viewportEl || items.length === 0) {
    model.layout = { columns: 1, pages: [[]] };
    model.pageIndex = 0;
    return;
  }

  model.layout = { columns: 1, pages: [items] };
  await tick();
  if (!isCurrent(generation)) {
    return;
  }

  const viewportHeight = viewportEl.clientHeight;
  let itemHeight = viewportEl.querySelector('.tv-num-item')?.getBoundingClientRect().height ?? 0;
  const layoutOptions = options.allowTwoColumns ? {} : SINGLE_COLUMN_OPTIONS;
  let layout = buildWaitingListLayout(items, viewportHeight, itemHeight, layoutOptions);

  if (options.allowTwoColumns && layout.columns === 2) {
    model.layout = { columns: 2, pages: [items] };
    await tick();
    if (!isCurrent(generation)) {
      return;
    }
    itemHeight =
      viewportEl.querySelector('.tv-num-item')?.getBoundingClientRect().height ?? itemHeight;
    layout = buildWaitingListLayout(items, viewportHeight, itemHeight);
  }

  model.layout = layout;
  model.pageIndex = Math.min(model.pageIndex, Math.max(0, layout.pages.length - 1));

  if (options.shrinkOnOverflow) {
    await tick();
    if (!isCurrent(generation)) {
      return;
    }

    let rows = rowsThatFit(viewportHeight, itemHeight);
    while (pageOverflows(viewportEl) && rows > 1) {
      rows -= 1;
      layout = buildWaitingListLayout(items, viewportHeight, itemHeight, {
        ...SINGLE_COLUMN_OPTIONS,
        maxRowsPerPage: rows,
      });
      model.layout = layout;
      model.pageIndex = Math.min(model.pageIndex, Math.max(0, layout.pages.length - 1));
      await tick();
      if (!isCurrent(generation)) {
        return;
      }
    }
  }

  if (!isCurrent(generation)) {
    return;
  }

  if (model.pageIndex >= layout.pages.length) {
    model.pageIndex = 0;
  }
}

export function mountTvPanelLayout<T>(
  model: TvPanelLayoutModel<T>,
  config: TvPanelLayoutConfig<T>,
): () => void {
  let layoutSyncGeneration = 0;
  let previousItemCount = -1;

  const allowTwoColumns = config.allowTwoColumns ?? false;
  const shrinkOnOverflow = config.shrinkOnOverflow ?? false;
  const isCurrent = (generation: number) => generation === layoutSyncGeneration;

  const requestSync = (resetPage: boolean) => {
    if (resetPage) {
      model.pageIndex = 0;
    }
    layoutSyncGeneration += 1;
    void syncPanelLayout(
      layoutSyncGeneration,
      isCurrent,
      model,
      config.getViewportEl(),
      config.getItems(),
      { allowTwoColumns, shrinkOnOverflow },
    );
  };

  const reset = () => {
    model.layout = { columns: 1, pages: [[]] };
    model.pageIndex = 0;
    layoutSyncGeneration = 0;
    previousItemCount = -1;
  };

  reset();

  const stopLayoutEffects = $effect.root(() => {
    $effect(() => {
      const panel = config.getPanelEl();
      const viewport = config.getViewportEl();
      const itemCount = config.getItems().length;
      const paused = config.getPaused?.() ?? false;
      const resetPage = previousItemCount !== itemCount;

      previousItemCount = itemCount;
      requestSync(resetPage);

      if (!panel || !viewport || paused) {
        return;
      }

      let layoutFrame: number | null = null;
      const onLayoutChange = () => {
        if (layoutFrame !== null) {
          return;
        }
        // Layout writes must run outside ResizeObserver's current delivery cycle.
        layoutFrame = requestAnimationFrame(() => {
          layoutFrame = null;
          requestSync(false);
        });
      };

      const layoutObserver = new ResizeObserver(onLayoutChange);
      layoutObserver.observe(panel);
      layoutObserver.observe(viewport);
      window.addEventListener('resize', onLayoutChange);

      return () => {
        layoutObserver.disconnect();
        window.removeEventListener('resize', onLayoutChange);
        if (layoutFrame !== null) {
          cancelAnimationFrame(layoutFrame);
        }
      };
    });

    $effect(() => {
      const pageCount = model.layout.pages.length;
      if (pageCount <= 1) {
        return;
      }

      const timer = setInterval(() => {
        model.pageIndex = (model.pageIndex + 1) % pageCount;
      }, WAITING_PAGE_MS);

      return () => {
        clearInterval(timer);
      };
    });
  });

  return () => {
    stopLayoutEffects();
    reset();
  };
}
