import type { WebContents } from 'electron';

type GuardedWebContents = Pick<WebContents, 'getURL' | 'on' | 'setWindowOpenHandler'>;

export function rendererNavigationAllowed(currentUrl: string, targetUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    if (current.protocol === 'http:' || current.protocol === 'https:') {
      // Keep Vite's same-origin reload/navigation working in development.
      return target.origin === current.origin;
    }
    // Packaged renderer uses file:. Do not treat every local file as the same
    // origin; only a reload of the exact renderer document is legitimate.
    return target.href === current.href;
  } catch {
    return false;
  }
}

/**
 * The renderer is a single-page local UI. Legitimate external navigation goes
 * through the validated IPC handler and shell.openExternal instead.
 */
export function installNavigationGuards(webContents: GuardedWebContents): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    if (!rendererNavigationAllowed(webContents.getURL(), url)) {
      event.preventDefault();
    }
  });
}
