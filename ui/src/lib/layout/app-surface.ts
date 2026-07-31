export type AppSurface = 'mfa' | 'terminal' | 'portal' | 'tv' | 'room-panel' | 'settings';

export function getAppSurface(pathname: string): AppSurface | null {
  if (pathname === '/' || pathname.startsWith('/panels')) {
    return 'settings';
  }
  if (pathname.startsWith('/mfa/settings')) {
    return 'settings';
  }
  // Ops setup uses StaffSettingsShell without the sidebar layout — keep default chrome.
  if (pathname.startsWith('/ops') && !pathname.startsWith('/ops/setup')) {
    return 'settings';
  }
  if (pathname.startsWith('/mfa')) {
    return 'mfa';
  }
  if (pathname.startsWith('/terminal')) {
    return 'terminal';
  }
  if (pathname.startsWith('/portal')) {
    return 'portal';
  }
  if (pathname.startsWith('/tv')) {
    return 'tv';
  }
  if (pathname.startsWith('/room-panel')) {
    return 'room-panel';
  }
  return null;
}
