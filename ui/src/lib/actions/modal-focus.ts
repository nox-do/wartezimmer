const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  );
}

export function modalFocus(node: HTMLElement, enabled: boolean) {
  let previousFocus: HTMLElement | null = null;
  let active = enabled;

  function focusInitial() {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => {
      const candidates = focusableElements(node);
      (candidates[0] ?? node).focus();
    });
  }

  function restoreFocus() {
    previousFocus?.focus?.();
    previousFocus = null;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') {
      return;
    }

    const candidates = focusableElements(node);
    if (candidates.length === 0) {
      event.preventDefault();
      return;
    }

    const first = candidates[0];
    const last = candidates[candidates.length - 1];
    const current = document.activeElement;

    if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function attach() {
    focusInitial();
    node.addEventListener('keydown', handleKeydown);
  }

  function detach() {
    node.removeEventListener('keydown', handleKeydown);
    restoreFocus();
  }

  if (active) {
    attach();
  }

  return {
    update(nextEnabled: boolean) {
      if (nextEnabled === active) {
        return;
      }

      if (nextEnabled) {
        attach();
      } else {
        detach();
      }

      active = nextEnabled;
    },
    destroy() {
      if (active) {
        detach();
      }
    },
  };
}
