export function buildTvKioskLinuxCommand(tvUrl: string): string {
  return `chromium \\
  --kiosk \\
  --noerrdialogs \\
  --disable-session-crashed-bubble \\
  --autoplay-policy=no-user-gesture-required \\
  "${tvUrl}"`;
}

export function buildTvKioskWindowsCommand(tvUrl: string): string {
  return `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ^
  --kiosk --noerrdialogs --autoplay-policy=no-user-gesture-required ^
  "${tvUrl}"`;
}
