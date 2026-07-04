const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function positionFloatingPanel(anchor: HTMLElement, panel: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const maxWidth = window.innerWidth - VIEWPORT_MARGIN * 2;
  const maxHeight = window.innerHeight - VIEWPORT_MARGIN * 2;

  panel.style.width = '';
  panel.style.maxHeight = `${maxHeight}px`;

  const naturalWidth = Math.min(panel.scrollWidth, maxWidth);
  panel.style.width = `${naturalWidth}px`;

  const measuredHeight = Math.min(panel.scrollHeight, maxHeight);

  let top = anchorRect.bottom + ANCHOR_GAP;
  if (top + measuredHeight > window.innerHeight - VIEWPORT_MARGIN) {
    top = anchorRect.top - measuredHeight - ANCHOR_GAP;
  }
  top = clamp(top, VIEWPORT_MARGIN, window.innerHeight - measuredHeight - VIEWPORT_MARGIN);

  let left = anchorRect.right - naturalWidth;
  left = clamp(left, VIEWPORT_MARGIN, window.innerWidth - naturalWidth - VIEWPORT_MARGIN);

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}

export function mountFloatingPanel(anchor: HTMLElement, panel: HTMLElement): () => void {
  panel.classList.add('is-floating');

  const homeParent = panel.parentElement;
  let visible = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const clearHideTimer = (): void => {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hide = (): void => {
    visible = false;
    panel.classList.remove('is-visible');
    if (homeParent && panel.parentElement === document.body) {
      homeParent.append(panel);
    }
  };

  const show = (): void => {
    clearHideTimer();
    if (visible) {
      return;
    }
    visible = true;
    document.body.append(panel);
    panel.classList.add('is-visible');
    positionFloatingPanel(anchor, panel);
  };

  const scheduleHide = (): void => {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      hide();
    }, 120);
  };

  const onViewportChange = (): void => {
    if (visible) {
      positionFloatingPanel(anchor, panel);
    }
  };

  anchor.addEventListener('mouseenter', show);
  anchor.addEventListener('focus', show);
  anchor.addEventListener('mouseleave', scheduleHide);
  anchor.addEventListener('blur', scheduleHide);

  panel.addEventListener('mouseenter', clearHideTimer);
  panel.addEventListener('mouseleave', scheduleHide);

  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);

  return () => {
    clearHideTimer();
    hide();
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('scroll', onViewportChange, true);
  };
}
