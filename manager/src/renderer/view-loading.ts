/** Lightweight loading overlay while a deferred view init runs. */
export function createViewLoadingOverlay(root: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.className = 'view-loading-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.textContent = 'Wird geladen …';
  root.prepend(overlay);

  return {
    setLoading(loading: boolean): void {
      overlay.hidden = !loading;
      root.setAttribute('aria-busy', loading ? 'true' : 'false');
    },
  };
}
