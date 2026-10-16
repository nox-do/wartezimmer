/** Persist controlled descriptions, never raw Docker output, env values or request payloads. */
export function summarizeUpdateFailure(errors: string[]): string {
  const text = errors.join('\n');
  const findings: string[] = [];
  if (/UPDATE_BACKUP_INCOMPLETE|Rollback-.*fehlt/i.test(text))
    findings.push('Die Rückfallsicherung ist unvollständig.');
  if (/Runtime-Binding|Portbindung|published binding/i.test(text))
    findings.push('Die erforderlichen Portbindungen konnten nicht bestätigt werden.');
  if (/Listener|Lokale Proxy-Prüfung|Restricted-Identität/i.test(text))
    findings.push('Die lokale Proxy-, HTTPS- oder Zugangstrennungsprüfung ist fehlgeschlagen.');
  if (/certificate|Zertifikat|CERT_|SSL|TLS/i.test(text))
    findings.push('Die HTTPS-Verbindung oder das Zertifikat konnte nicht bestätigt werden.');
  if (/API lokal nicht erreichbar|Maintenance-API/i.test(text))
    findings.push('Die lokale App- oder Wartungs-API ist nicht erreichbar.');
  if (/Geräte kommen nicht an|API im LAN nicht erreichbar|DNS/i.test(text))
    findings.push('Die Geräteadresse ist nicht erreichbar.');
  if (/healthy|unhealthy|Health|gesund/i.test(text))
    findings.push('Die erforderliche Dienstgesundheit konnte nicht bestätigt werden.');
  if (/Snapshot|Datenbank|Rollback-DB|Runtime-DB|Settings|Import|Re-Export/i.test(text))
    findings.push('Datenübernahme oder Datenprüfung ist fehlgeschlagen.');
  if (/gestoppt|stoppen/i.test(text))
    findings.push('Der Stack konnte nicht sicher gestoppt werden.');
  if (/gestartet|Start|start/i.test(text))
    findings.push('Der Stack konnte nicht erfolgreich gestartet werden.');
  return (
    findings.join(' ') ||
    'Der Vorgang ist fehlgeschlagen; eine sichere Wiederherstellung ist noch nicht bestätigt.'
  ).slice(0, 800);
}
