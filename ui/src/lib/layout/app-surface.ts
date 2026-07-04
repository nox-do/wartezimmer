export type AppSurface = 'mfa' | 'terminal' | 'portal' | 'tv' | 'room-panel';

export function getAppSurface(pathname: string): AppSurface | null {
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
