# Arbeits-Prompts: Reinstall-/Recovery-Umstellung

Stand: 2026-09-18

Diese vier Prompts schneiden die Umsetzung von
[`plan-reinstall-recovery.md`](plan-reinstall-recovery.md) in einzeln ausführbare Arbeitspakete.
Sie bauen aufeinander auf. `.pfbackup` v1 und TLS-Sidecars sind keine zu erhaltende
Produktkompatibilität; der neue Recovery-Pfad akzeptiert ausschließlich Backup v2.

## Prompt 1 — Fundament

> Setze Paket 1 des Reinstall-/Recovery-Plans um: das Fundament. Lies zuerst
> `docs/plan-reinstall-recovery.md`, `docs/architecture/manager-operating-modes.md`
> und den aktuellen Working-Tree-Diff. Ergänze einen diskriminierten, ausschließlich
> im Setup-Backend abgeleiteten `InstallationState` mit `docker-unavailable`, `fresh`,
> `healthy`, `stopped` und `needs-reinstall`; ein späterer persistenter Vorgang muss
> additiv als `installing` darstellbar sein. `healthy` verlangt gesunde App und Sandbox
> sowie eine authentifizierte Maintenance-API, aber nicht Proxy, TLS oder Gateway.
> Trenne diesen Installationszustand klar vom bestehenden `HostLifecycle`. Entferne
> feste Produkt-`container_name`-Werte und stelle Zugriffe auf Compose-Projekt plus
> Service um. Implementiere den sicheren Start aus `stopped`: erst das erwartete
> App-Datenvolume inspizieren, dann mit einem read-only Utility-Container und ohne
> Netzwerk die vorhandene `praxis-flow.db` prüfen, danach Compose starten und
> Full-Stack-Health plus Maintenance-Authentifizierung verlangen. Kein Status-Poll
> darf Container oder Volumes erzeugen. Ergänze Setup-API-Vertrag, Tests und aktuelle
> Betriebsdokumentation. Bewahre fremde Working-Tree-Änderungen und führe mindestens
> Lint, Typecheck sowie die betroffenen Setup-, Shared- und Manager-Tests aus.

## Prompt 2 — Installationsmaschine

> Setze Paket 2 des Reinstall-/Recovery-Plans auf Basis des fertigen Fundaments um.
> Zerlege den heutigen `.pfinstall`-Import in ein nicht destruktives Prepare und einen
> ausdrücklich bestätigten Commit. Prepare prüft Endung, äußeren Hash, Manifest,
> Archivpfade, Plattform, Images, Proxy-Digest und Compose-Konfiguration, pinnt die
> geprüften Bytes unter `installHome/operations/install/<id>/` und schreibt einen
> atomaren Vorgangsmarker. Der Marker kennt nur `prepared` und `installing`, enthält
> keine Secrets und erlaubt höchstens einen aktiven Vorgang. Commit prüft Zustand,
> Modus und Operation unter demselben Backend-Mutex erneut und wechselt vor der ersten
> Mutation atomar auf `installing`. Baue einen zielgerichteten Factory Reset: Compose
> mit Volumes und Orphans abbauen, anschließend ausschließlich verwaltete Hostartefakte
> per Allowlist entfernen; `backups/` und die aktive Operation bleiben erhalten.
> Fremde Docker-Projekte und nicht zugeordnete Volumes dürfen nie gelöscht werden.
> Ergänze Prepare-, Commit- und Abbruch-Endpunkte, Crash-/Parallelitäts-Tests und die
> Betriebsdokumentation. Der Renderer ist kein Sicherheitsgate.

## Prompt 3 — Backup v2

> Setze Paket 3 des Reinstall-/Recovery-Plans um: `.pfbackup` v2 als einziges vom neuen
> Recovery-Pfad unterstütztes Format. Integriere TLS-Zustand, Zertifikate, private
> Schlüssel, Caddy-Daten und ACME-Zugang in dasselbe Archiv; entferne für v2 jede
> Sidecar-Abhängigkeit. Backup v1 wird beim Inspect eindeutig und vor jeder Mutation
> als nicht unterstützt abgelehnt; keine Legacy-Normalisierung ergänzen. Implementiere
> zweistufige Prüfung (`archiveUsable` offline, `restoreCompatible` gegen die frisch
> gestartete Ziel-App), strikte Pfad-/Typ-/Hash-Prüfung und serverseitige Discovery nur
> unter `installHome/backups/` mit opaken Candidate-IDs. Beim Prepare wird das gewählte
> Backup samt äußerem SHA-256 in den Vorgangsbereich kopiert und bei Preview und Restore
> erneut geprüft. Vereinheitliche den Restore-Merge mit einer typisierten
> `NON_RESTORABLE_INSTALL_ENV_KEYS`-Liste aus Image- und Installations-Secret-Keys;
> Ziel-Images und Ziel-Secrets gewinnen immer. Ergänze Sicherheits-, Format-,
> Manipulations- und TLS-Identitätstests sowie die aktuelle Betriebsdokumentation.

## Prompt 4 — Recovery und Manager

> Setze Paket 4 des Reinstall-/Recovery-Plans auf Basis der Pakete 1 bis 3 um. Baue den
> vollständigen Produktfluss `Prepare → Bestätigung → Factory Reset → Fresh Setup →
optionaler Restore`. Bei gewähltem Backup richtet der Wizard zunächst ausschließlich
> eine gesunde HTTP-Baseline mit frischen Installations-Secrets ein. Erst danach prüft
> er Backup v2 online und verwendet den gemeinsamen Restore-Core. Ein Backup mit TLS
> übernimmt seine bestehende TLS-Identität; ohne TLS bleibt die Installation HTTP. Vor
> dem Restore darf keine neue Managed-TLS-Identität erzeugt werden. Ergänze Finish,
> Retry und „ohne Backup fortfahren“, den Wiedereinstieg nach Manager-/Setup-/Host-Crash
> und die API-Routen aus Abschnitt 10 des Plans. Stelle Manager-Navigation und Aktionen
> vollständig auf `InstallationState` um: Update und Wartung nur bei `healthy`, sicherer
> Start bei `stopped`, Neuinstallation bei `needs-reinstall`, niemals Destruktionsgates
> allein im Renderer. Normale Restore-Fehler rollen auf die frische HTTP-Installation
> zurück; die verworfene Altinstallation ist kein Rollback-Ziel. Ergänze die vollständige
> Testmatrix aus dem Plan, Fehler-Injektion an jeder persistenten Phasengrenze und
> aktualisiere die Operations-Dokumentation zur alleinigen Source of Truth.
