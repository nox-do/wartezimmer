/** Supported host platforms; runtime audits remain mandatory. */
export function restrictedPlatformSupported(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

export function restrictedPlatformMessage(platform: string): string {
  if (platform === 'win32') return 'Der separate Patientenzugang wird unter Windows unterstützt.';
  if (platform === 'darwin')
    return 'Der separate Patientenzugang wird unter macOS unterstützt; reale Zwei-NIC-Abnahme bleibt erforderlich.';
  return 'Der separate Patientenzugang wird auf dieser Hostplattform nicht unterstützt.';
}
