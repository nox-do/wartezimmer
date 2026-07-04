export function probeLabel(id: string): string {
  if (id === 'app.health.local') {
    return 'App (lokal)';
  }
  if (id === 'app.health.lan') {
    return 'App (LAN)';
  }
  return id;
}
