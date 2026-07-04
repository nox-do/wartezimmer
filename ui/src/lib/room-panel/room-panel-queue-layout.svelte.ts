import { tick } from 'svelte';
import {
  buildWaitingListLayout,
  rowsThatFit,
  WAITING_PAGE_MS,
  type WaitingListLayout,
} from '$lib/tv/waiting-list-layout';

export const roomPanelQueueLayout = $state({
  layout: { columns: 1, pages: [[]] } as WaitingListLayout<string>,
  pageIndex: 0,
});

let layoutSyncGeneration = 0;
let previousTicketCount = -1;

export function getVisibleRoomPanelTickets(): string[] {
  return roomPanelQueueLayout.layout.pages[roomPanelQueueLayout.pageIndex] ?? [];
}

export function getRoomPanelPageCount(): number {
  return roomPanelQueueLayout.layout.pages.length;
}

export function getRoomPanelPaginated(): boolean {
  return getRoomPanelPageCount() > 1;
}

function readQueueMetrics(viewportEl: HTMLDivElement): {
  itemHeight: number;
  itemGap: number;
  minColumnWidth: number;
} {
  const queueEl = viewportEl.querySelector('.room-panel-preview__queue');
  const itemGap = queueEl ? parseFloat(getComputedStyle(queueEl).rowGap) || 0 : 0;
  let itemHeight = 0;

  viewportEl.querySelectorAll('.room-panel-preview__queue-item').forEach((el) => {
    itemHeight = Math.max(itemHeight, el.getBoundingClientRect().height);
  });

  const codeEl = viewportEl.querySelector('.room-panel-preview__queue-code');
  const minColumnWidth = codeEl ? Math.ceil(codeEl.scrollWidth + 24) : 128;

  return { itemHeight, itemGap, minColumnWidth };
}

function pageOverflows(viewportEl: HTMLDivElement): boolean {
  const queueEl = viewportEl.querySelector('.room-panel-preview__queue');
  if (!queueEl) {
    return false;
  }
  return queueEl.scrollHeight > viewportEl.clientHeight + 1;
}

async function syncRoomPanelQueueLayout(
  generation: number,
  viewportEl: HTMLDivElement | null,
  ticketCodes: string[],
) {
  await tick();
  if (generation !== layoutSyncGeneration) {
    return;
  }

  if (!viewportEl || ticketCodes.length === 0) {
    roomPanelQueueLayout.layout = { columns: 1, pages: [[]] };
    roomPanelQueueLayout.pageIndex = 0;
    return;
  }

  roomPanelQueueLayout.layout = { columns: 1, pages: [ticketCodes] };
  await tick();
  if (generation !== layoutSyncGeneration) {
    return;
  }

  const viewportHeight = viewportEl.clientHeight;
  const viewportWidth = viewportEl.clientWidth;
  let { itemHeight, itemGap, minColumnWidth } = readQueueMetrics(viewportEl);

  const layoutOptions = {
    viewportWidth,
    minColumnWidth,
    itemGap,
  };

  let layout = buildWaitingListLayout(ticketCodes, viewportHeight, itemHeight, layoutOptions);

  if (layout.columns === 2) {
    roomPanelQueueLayout.layout = { columns: 2, pages: [ticketCodes] };
    await tick();
    if (generation !== layoutSyncGeneration) {
      return;
    }
    ({ itemHeight, itemGap, minColumnWidth } = readQueueMetrics(viewportEl));
    layout = buildWaitingListLayout(ticketCodes, viewportHeight, itemHeight, {
      ...layoutOptions,
      itemGap,
      minColumnWidth,
    });
  }

  roomPanelQueueLayout.layout = layout;
  roomPanelQueueLayout.pageIndex = Math.min(
    roomPanelQueueLayout.pageIndex,
    Math.max(0, layout.pages.length - 1),
  );
  await tick();
  if (generation !== layoutSyncGeneration) {
    return;
  }

  let rows = rowsThatFit(viewportHeight, itemHeight, itemGap);
  roomPanelQueueLayout.pageIndex = 0;
  while (pageOverflows(viewportEl) && rows > 1) {
    rows -= 1;
    layout = buildWaitingListLayout(ticketCodes, viewportHeight, itemHeight, {
      ...layoutOptions,
      itemGap,
      minColumnWidth,
      maxRowsPerPage: rows,
    });
    roomPanelQueueLayout.layout = layout;
    roomPanelQueueLayout.pageIndex = Math.min(
      roomPanelQueueLayout.pageIndex,
      Math.max(0, layout.pages.length - 1),
    );
    await tick();
    if (generation !== layoutSyncGeneration) {
      return;
    }
  }

  if (generation !== layoutSyncGeneration) {
    return;
  }

  if (roomPanelQueueLayout.pageIndex >= layout.pages.length) {
    roomPanelQueueLayout.pageIndex = 0;
  }
}

export function requestRoomPanelQueueLayoutSync(
  resetPage: boolean,
  viewportEl: HTMLDivElement | null,
  ticketCodes: string[],
) {
  if (resetPage) {
    roomPanelQueueLayout.pageIndex = 0;
  }
  layoutSyncGeneration += 1;
  void syncRoomPanelQueueLayout(layoutSyncGeneration, viewportEl, ticketCodes);
}

export function resetRoomPanelQueueLayout() {
  roomPanelQueueLayout.layout = { columns: 1, pages: [[]] };
  roomPanelQueueLayout.pageIndex = 0;
  layoutSyncGeneration = 0;
  previousTicketCount = -1;
}

type RoomPanelQueueLayoutRefs = {
  getPanelEl: () => HTMLElement | null;
  getViewportEl: () => HTMLDivElement | null;
  getTicketCodes: () => string[];
};

export function mountRoomPanelQueueLayout(refs: RoomPanelQueueLayoutRefs): () => void {
  resetRoomPanelQueueLayout();

  const stopLayoutEffects = $effect.root(() => {
    $effect(() => {
      const panel = refs.getPanelEl();
      const viewport = refs.getViewportEl();
      const ticketCodes = refs.getTicketCodes();
      const resetPage = previousTicketCount !== ticketCodes.length;

      previousTicketCount = ticketCodes.length;
      requestRoomPanelQueueLayoutSync(resetPage, viewport, ticketCodes);

      if (!panel || !viewport) {
        return;
      }

      const onLayoutChange = () => {
        requestRoomPanelQueueLayoutSync(false, refs.getViewportEl(), refs.getTicketCodes());
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
      if (!getRoomPanelPaginated()) {
        return;
      }

      const timer = setInterval(() => {
        roomPanelQueueLayout.pageIndex =
          (roomPanelQueueLayout.pageIndex + 1) % getRoomPanelPageCount();
      }, WAITING_PAGE_MS);

      return () => {
        clearInterval(timer);
      };
    });
  });

  return () => {
    stopLayoutEffects();
    resetRoomPanelQueueLayout();
  };
}
