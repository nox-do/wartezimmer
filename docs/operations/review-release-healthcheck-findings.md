# Review: Release-Bundle und Proxy-Healthcheck

Stand: 2026-09-06

Dieses Dokument hält die Findings aus dem Review der Änderungen für den Proxy-Healthcheck, das Offline-Release-Bundle (`.pfinstall`), den Manager-Import und die DMG-Bootstrap-Ressourcen fest.

Jedes Finding ist bewusst eigenständig formuliert. Für die Abarbeitung kann jeweils ein neuer Prompt mit dem Abschnitt **Arbeitsauftrag** verwendet werden.

## Release-Vertrag

Ein unterstütztes Erstinstallations-Archiv ist ein vollständiges `.pfinstall`-Bundle mit dem Eintrag `images/praxis-flow-images.tar`, allen Delivery-Compose-Dateien, `.env.example` und `templates/proxy/Caddyfile`. Ein älteres Image-only-Archiv ohne diesen Bundle-Eintrag wird im noch nicht produktiven System nicht unterstützt und muss beim Import früh und eindeutig abgelehnt werden. Es gibt keinen Legacy-Kompatibilitätsvertrag.

## Finding 1: Healthcheck verwendet Host-Ports im Container

**Priorität:** P1

### Betroffene Dateien

- [docker-compose.proxy.delivery.yml](../../docker-compose.proxy.delivery.yml#L21-L43)
- [docker-compose.proxy.yml](../../docker-compose.proxy.yml#L19-L41)
- [docker-compose.proxy-tls.delivery.yml](../../docker-compose.proxy-tls.delivery.yml#L5-L8)

### Technischer Kontext

Docker Compose unterscheidet zwischen dem Host-Port links vom Doppelpunkt und dem Container-Port rechts vom Doppelpunkt. Die Proxy-Services veröffentlichen weiterhin die festen Container-Ports:

```yaml
ports:
  - '${PROXY_HTTP_PORT:-80}:80'
```

beziehungsweise im TLS-Overlay:

```yaml
ports:
  - '${PROXY_HTTPS_PORT:-443}:443'
```

Der Prozess im Container lauscht damit intern auf `80` und `443`. `PROXY_HTTP_PORT` und `PROXY_HTTPS_PORT` sind die Ports, über die der Host den Container erreicht.

Der neue Healthcheck setzt diese Variablen aber als Zielport innerhalb des Containers ein:

```sh
wget ... "https://127.0.0.1:${PROXY_HTTPS_PORT:-443}/"
```

und analog für HTTP.

### Fehlerbild

Bei einer Installation mit beispielsweise:

```env
PROXY_HTTP_PORT=8080
PROXY_HTTPS_PORT=8443
```

entsteht ein Mapping `8080:80` beziehungsweise `8443:443`. Der Healthcheck versucht innerhalb des Containers jedoch `127.0.0.1:8080` oder `127.0.0.1:8443` zu erreichen. Auf diesen Ports lauscht Caddy nicht. Der Container bleibt deshalb `unhealthy`, obwohl Caddy korrekt läuft und über die Host-Ports erreichbar ist.

Das betrifft nicht nur TLS. Auch der HTTP-Zweig ist bei einem benutzerdefinierten `PROXY_HTTP_PORT` falsch.

### Erwartetes Verhalten

Der Healthcheck muss die internen Container-Ports prüfen:

- HTTP: `http://127.0.0.1:80/`
- TLS: `https://127.0.0.1:443/`

Die konfigurierten `PROXY_HTTP_PORT`- und `PROXY_HTTPS_PORT`-Werte dürfen ausschließlich im Host-Port-Mapping verwendet werden.

### Reproduktionsszenario

1. `.env` auf einen von `80/443` abweichenden Proxy-Port konfigurieren.
2. Stack mit dem Delivery-Compose starten.
3. `docker compose ps` beziehungsweise den Manager-Status prüfen.
4. Erreichbarkeit über den Host-Port testen.
5. Den Healthcheck-Fehler im Containerstatus vergleichen.

### Benötigte Tests

- HTTP-Healthcheck mit `PROXY_HTTP_PORT=8080`.
- TLS-Healthcheck mit `PROXY_HTTPS_PORT=8443`.
- Prüfung, dass der Healthcheck intern weiterhin `80/443` verwendet.

### Arbeitsauftrag für einen Folgeprompt

> Behebe Finding 1 in den betroffenen Compose-Dateien. Der Proxy-Healthcheck muss innerhalb des Containers immer die festen Ports 80 beziehungsweise 443 verwenden, während benutzerdefinierte Host-Ports weiterhin im Port-Mapping funktionieren. Ergänze fokussierte Tests oder eine statische Compose-Prüfung für HTTP und TLS mit abweichenden Host-Ports. Führe anschließend die relevanten Tests aus und berichte über die geänderten Dateien.

## Finding 2: TLS-Healthcheck verwendet falsches Host-/SNI-Matching

**Priorität:** P1

### Betroffene Dateien

- [docker-compose.proxy.delivery.yml](../../docker-compose.proxy.delivery.yml#L34-L41)
- [docker-compose.proxy.yml](../../docker-compose.proxy.yml#L32-L39)
- [setup/src/proxy-tls.ts](../../setup/src/proxy-tls.ts#L153-L184)
- [setup/src/host-tls.ts](../../setup/src/host-tls.ts#L1173-L1173)

### Technischer Kontext

Die generierte TLS-Caddy-Konfiguration enthält nach der TLS-Konfiguration einen hostname-spezifischen Site-Block:

```caddyfile
example.praxis-flow.local {
    ...
    reverse_proxy app:8080
}
```

Die konkrete Hostname-Konfiguration wird aus dem Installationszustand erzeugt. Der Healthcheck ruft dagegen unabhängig davon auf:

```sh
https://127.0.0.1:443/
```

Bei HTTPS ist der Hostname nicht nur für die Zertifikatsprüfung relevant. Er wird auch für SNI und die Auswahl des Caddy-Site-Blocks verwendet. `--no-check-certificate` deaktiviert nur die Zertifikatsvalidierung.

### Fehlerbild

Nach dem TLS-Cutover kann die Anfrage an `127.0.0.1` keinen hostname-spezifischen Caddy-Block treffen. Caddy kann dann beispielsweise mit `404` antworten. `wget` beendet sich mit einem Fehler und Docker markiert den Proxy als `unhealthy`, obwohl der konfigurierte TLS-Hostname funktionierende Anfragen annimmt.

Der Fehler kann durch den lokalen HTTP-Block verdeckt werden, solange der Zustand noch vor dem Cutover ist. Nach dem Cutover ist der HTTP-Port jedoch nur noch Redirect-Endpunkt:

```caddyfile
:80 {
    redir https://hostname{uri} permanent
}
```

Der Healthcheck muss daher den tatsächlichen TLS-Runtime-Pfad validieren.

### Erwartetes Verhalten

Der TLS-Healthcheck soll einen stabilen, internen Erfolgsendpunkt prüfen. Dafür gibt es zwei fachlich mögliche Varianten:

1. Ein host-unabhängiger interner Healthcheck-Block wird in der TLS-Caddy-Konfiguration bereitgestellt.
2. Der Healthcheck verwendet den konfigurierten TLS-Hostname und sendet korrektes SNI beziehungsweise einen passenden `Host`-Header.

Die gewählte Variante muss sowohl managed TLS als auch custom TLS abdecken und darf keine Zertifikatsvalidierung gegen ein öffentliches Zertifikat im Container voraussetzen.

Zusätzlich sollte der Check explizit einen erfolgreichen HTTP-Statuscode erwarten. Nur eine erfolgreiche Verbindung oder ein beliebiger Response-Body reicht als Zustandsprüfung nicht aus.

### Reproduktionsszenario

1. TLS-Hostname konfigurieren und TLS-Cutover ausführen.
2. Den generierten Inhalt von `state/tls/Caddyfile` prüfen.
3. Im Proxy-Container `wget` gegen `https://127.0.0.1:443/` ausführen.
4. Dieselbe Prüfung mit dem konfigurierten Hostnamen beziehungsweise gegen den TLS-Endpunkt ausführen.
5. Ergebnis mit `docker inspect` und dem Manager-Status vergleichen.

### Benötigte Tests

- Generated-Caddyfile-Test für den Zustand nach TLS-Cutover.
- Test, dass der Healthcheck mit hostname-spezifischem Site-Block erfolgreich ist.
- Test für managed TLS und custom TLS.
- Test für nicht erfolgreichen HTTP-Statuscode.

### Arbeitsauftrag für einen Folgeprompt

> Behebe Finding 2. Entwirf einen TLS-Healthcheck, der nach dem Cutover mit dem hostname-spezifischen Caddyfile zuverlässig erfolgreich ist. Verwende entweder einen bewusst host-unabhängigen internen Health-Endpunkt oder korrektes Host-/SNI-Matching. Stelle sicher, dass managed und custom TLS abgedeckt sind, der Check einen erfolgreichen HTTP-Statuscode verlangt und die Änderung durch fokussierte Tests abgesichert ist.

## Finding 3: Release-Bundle-Extraktion ist nicht gegen Symlinks und Spezialdateien geschützt

**Priorität:** P1

### Betroffene Dateien

- [setup/src/delivery-images.ts](../../setup/src/delivery-images.ts#L187-L232)
- Vergleichsimplementierung: [setup/src/pfupdate-package.ts](../../setup/src/pfupdate-package.ts#L227-L247)
- Vergleichstests: [setup/src/pfupdate-package.test.ts](../../setup/src/pfupdate-package.test.ts#L137-L158)
- Neuer Bundle-Test: [setup/src/delivery-images.test.ts](../../setup/src/delivery-images.test.ts#L400-L488)

### Technischer Kontext

Der Manager importiert ein Release-Archiv zunächst mit `tar -tzf`, prüft dabei aber nur:

- absolute Pfade
- Pfade mit `..`-Segmenten

Danach wird das gesamte Archiv in ein temporäres Verzeichnis extrahiert:

```ts
spawnSync('tar', ['-xzf', archivePath, '-C', stagingDir], ...)
```

Die erwarteten Template-Dateien werden anschließend mit `statSync(...).isFile()` geprüft und nach `projectRoot` kopiert. `statSync` folgt Symlinks. Ein Symlink kann daher wie eine reguläre Datei aussehen und beim Kopieren auf einen Pfad außerhalb des Staging-Verzeichnisses zeigen.

### Sicherheits- und Funktionsrisiko

Ein manipuliertes oder beschädigtes Release-Archiv könnte beispielsweise:

```text
templates/.env.example -> /path/to/secret
```

enthalten. Beim Import würde `copyFileSync` nicht den Inhalt aus dem vorgesehenen Archivpfad, sondern den Inhalt des Ziels kopieren. Abhängig vom Tar-Verhalten können außerdem Hardlinks oder Spezialdateien problematisch sein.

Das Release-Archiv wird aus einer externen Freigabe ausgewählt und ist damit eine relevante Eingabegrenze. Die SHA256-Prüfung stellt Integrität gegenüber einem bekannten Sidecar her, ersetzt aber keine sichere Archivvalidierung, wenn das Sidecar selbst manipuliert oder die Quelle nicht vertrauenswürdig ist.

Der bereits vorhandene `.pfupdate`-Pfad weist darauf hin, dass dieses Projekt Symlinks bewusst ablehnt. Diese Schutzlogik wird im neuen Release-Bundle-Pfad nicht wiederverwendet.

### Erwartetes Verhalten

Vor der Extraktion müssen alle Tar-Einträge validiert werden. Mindestens abzulehnen sind:

- absolute Pfade
- Pfade mit `..`
- symbolische Links
- Hardlinks
- Block- und Character-Devices
- FIFOs und sonstige Nicht-Regular-Dateien

Nach der Extraktion sollten die erwarteten Dateien zusätzlich mit `lstat` geprüft werden. Die Zielpfade müssen innerhalb des Staging-Verzeichnisses liegen.

### Reproduktionsszenario

1. Ein Testarchiv mit `templates/.env.example` als Symlink erzeugen.
2. `loadDeliveryImagesFromArchive` mit diesem Archiv aufrufen.
3. Prüfen, ob der Import vor der Dateikopie mit einem definierten Sicherheitsfehler abbricht.
4. Dasselbe für Hardlinks und mindestens eine Spezialdatei testen.
5. Sicherstellen, dass im Installationsverzeichnis keine Datei geschrieben wurde.

### Benötigte Tests

- Symlink im Release-Bundle wird abgelehnt.
- Hardlink im Release-Bundle wird abgelehnt.
- Spezialdatei im Release-Bundle wird abgelehnt.
- Traversal- und absolute Pfade bleiben abgedeckt.
- Fehlerhafte Archive hinterlassen kein temporäres Staging-Verzeichnis und verändern das Installationsverzeichnis nicht.

### Arbeitsauftrag für einen Folgeprompt

> Behebe Finding 3 im Release-Bundle-Import. Verwende die vorhandene sichere Tar-Validierung des `.pfupdate`-Pfads als Vorlage oder extrahiere sie in eine gemeinsame Hilfsfunktion. Lehne Symlinks, Hardlinks, Devices, FIFOs, absolute Pfade und Traversal ab, bevor Dateien geschrieben werden. Ergänze die entsprechenden Tests für `delivery-images.ts` und führe den fokussierten Setup-Test aus.

## Finding 4: Nicht unterstützte Image-only-Archive werden als Erfolg importiert

**Priorität:** P2

### Betroffene Dateien

- [setup/src/delivery-images.ts](../../setup/src/delivery-images.ts#L187-L232)
- [setup/src/delivery-images.test.ts](../../setup/src/delivery-images.test.ts#L400-L488)
- [setup/src/setup-context.ts](../../setup/src/setup-context.ts#L21-L34)
- [manager/src/main/setup-server.ts](../../manager/src/main/setup-server.ts#L132-L153)

### Technischer Kontext

Der Import erkennt ein vollständiges Release-Bundle daran, dass der Eintrag `images/praxis-flow-images.tar` vorhanden ist. Fehlt dieser Eintrag, wird das ausgewählte Archiv aktuell als Image-Archiv direkt an `docker load` weitergegeben:

```ts
if (!entries.includes(dockerArchive)) {
  return { dockerArchivePath: archivePath, stagingDir: null };
}
```

Beim vollständigen Bundle werden zusätzlich `.env.example`, Compose-Dateien und `templates/proxy/Caddyfile` in das Installationsverzeichnis kopiert. Beim Image-only-Pfad passiert diese Kopie nicht.

Das Manager-DMG enthält bewusst kein `templates/proxy/Caddyfile`. Das Caddyfile ist Bestandteil des vollständigen Release-Bundles und wird erst beim Bundle-Import nach `proxy/Caddyfile` installiert. Der normale DMG-Bootstrap darf diese Datei deshalb nicht voraussetzen. Der Import darf umgekehrt aber nicht so tun, als sei ein vollständiges Release-Bundle verarbeitet worden, wenn nur ein Image-only-Archiv vorliegt.

Der spätere Proxy-Start verwendet weiterhin die Proxy-Compose-Dateien. Das TLS-Overlay erwartet dabei unter anderem:

```yaml
${PROXY_CADDYFILE_HOST_PATH}:/etc/caddy/Caddyfile:ro
```

### Fehlerbild

Ein altes Image-only-Archiv kann aktuell erfolgreich importiert werden. Danach sind App- und Sandbox-Images vorhanden und der Manager kann den Import als erfolgreich anzeigen, obwohl kein unterstütztes Release-Bundle vorliegt und beim späteren Aktivieren des HTTP- oder TLS-Proxys `proxy/Caddyfile` fehlen kann.

Je nach Docker-Compose-Version und Host-Dateisystem kann der Mount dann fehlschlagen oder ein Verzeichnis anstelle einer Datei auf `/etc/caddy/Caddyfile` gemountet werden. Caddy startet nicht zuverlässig.

Das ist kein unterstützter Zwischenzustand: Der Import akzeptiert ein inkompatibles Archiv und verschiebt den Fehler bis zu einer späteren Proxy-Aktion.

### Erwartetes Verhalten

Image-only-Archive ohne `images/praxis-flow-images.tar` müssen vor `docker load` mit einem definierten Fehler wie `RELEASE_BUNDLE_UNSUPPORTED` abgelehnt werden. Dabei dürfen weder Images geladen noch `.env`, Manager-Release-State oder andere Installationsdateien verändert werden. Ein vollständiges Bundle muss weiterhin alle erwarteten Templates installieren.

### Reproduktionsszenario

1. Ein Image-only-Archiv ohne `images/praxis-flow-images.tar` auswählen.
2. Den Import mit funktionierendem Docker durchführen.
3. Prüfen, dass der Import mit `RELEASE_BUNDLE_UNSUPPORTED` abbricht.
4. Prüfen, dass `docker load` nicht aufgerufen wurde.
5. Prüfen, dass Installationsdateien und Manager-Status unverändert bleiben.

### Benötigte Tests

- Image-only-Archiv wird vor `docker load` abgelehnt.
- Der Fehler wird im Manager verständlich angezeigt und nicht als erfolgreicher Import verbucht.
- Der Import hinterlässt keine Images, State-Dateien oder Templates.
- Regressionstest, dass vollständige neue Bundles weiterhin alle Templates installieren.

### Arbeitsauftrag für einen Folgeprompt

> Behebe Finding 4 ohne Legacy-Kompatibilität. Lehne Image-only-Archive ohne `images/praxis-flow-images.tar` vor `docker load` mit `RELEASE_BUNDLE_UNSUPPORTED` ab. Der Import darf dabei keine Images, State-Dateien oder Templates verändern. Ergänze fokussierte Tests für den frühen Abbruch und einen Regressionstest für vollständige Release-Bundles. Führe anschließend den fokussierten Setup-Test aus.

## Bereits validierter Stand

Der fokussierte Setup-Testlauf war zum Review-Zeitpunkt erfolgreich:

```text
270 tests passed
0 failed
```

Die vorhandenen Tests decken die vier oben beschriebenen Randfälle jedoch nicht vollständig ab. Insbesondere fehlen Tests für benutzerdefinierte Proxy-Ports, hostname-spezifisches TLS-Healthchecking, unsichere Tar-Einträge im neuen Bundle-Pfad und den Legacy-Import bis zum Proxy-Start.
