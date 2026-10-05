/** Windows is enabled for the diagnostic beta; runtime audits remain mandatory. */
export function restrictedPlatformSupported(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

export function restrictedPlatformMessage(platform: string): string {
  if (platform === 'win32')
    return 'Windows-Beta: Separater Patientenzugang zum Erproben freigegeben. Abnahme aus dem Patientennetz erforderlich. Diagnoseprotokolle: logs/restricted-beta.jsonl im Installationsverzeichnis.';
  if (platform === 'darwin')
    return 'Der separate Patientenzugang wird unter macOS unterstützt; reale Zwei-NIC-Abnahme bleibt erforderlich.';
  return 'Der separate Patientenzugang wird auf dieser Hostplattform nicht unterstützt.';
}
