# Plan: TLS und Internet-Portal

Stand: 2026-08-24

Status: **Zielbild, nicht Kunden-Test.** HTTP-Proxy auf Port 80 ist Ist — Betrieb in
[`delivery.md`](delivery.md) und [`deployment-docker.md`](deployment-docker.md).
Der gemischte Umsetzungsplan liegt im Archiv:
[`archive/plan-proxy-container.md`](archive/plan-proxy-container.md).

## Ausgangslage

Der optionale Caddy-Proxy nimmt HTTP auf Port 80 entgegen und leitet auf `app:8080`.
`CANONICAL_BASE_URL` ist die Basis für Geräte- und Portal-URLs. Mit aktivem Proxy
ist App-Port 8080 nur noch auf Host-Loopback. Sandbox bleibt intern. TLS, Port 443
und öffentliches Portal fehlen.

```text
Ist:   http://<host>        → proxy → app:8080
Ziel:  https://<host>       → proxy → app:8080   (LAN, alle Rollen)
       https://<public>/…   → proxy → app:8080   (Internet, nur Portal-Whitelist)
```

## Ziel

Zwei Ebenen, ein Proxy-Container:

| Ebene          | Erreichbarkeit                 | TLS               | Regel                                               |
| -------------- | ------------------------------ | ----------------- | --------------------------------------------------- |
| **Praxis-LAN** | Terminal, MFA, TV, Ops, Portal | optional HTTPS    | voller Reverse-Proxy; `CANONICAL_BASE_URL`          |
| **Internet**   | nur Portal (+ nötige APIs)     | **HTTPS Pflicht** | Whitelist — kein `/mfa`, `/terminal`, `/tv`, `/ops` |

Die App bleibt ohne TLS-Code. Der Proxy übernimmt Zertifikate, Redirects und Exposing.
Bei aktivem TLS ist `CANONICAL_BASE_URL` immer `https://…`.

## Drei Wege (Manager / Wizard)

1. **Ohne TLS** — HTTP über den vorhandenen Proxy (Kunden-Test / intern). Nicht als
   Produktivmodus mit Patientendaten empfehlen.
2. **Eigenes Zertifikat** — Praxis-IT liefert Domain + Dateien (`fullchain` / `privkey`).
3. **Managed** — Subdomain `*.praxis-flow.de`, ACME/DNS-01, Renewal automatisch.
   Erste Version betreut (CNAME zeigt der Wizard, Support trägt ein).

## Nicht-Ziele

- Kein Gateway-/Captive-Ersatz
- Kein Kubernetes / Service-Mesh
- Keine TLS-Logik im App-Container
- Kein Zwang, in Dev über 443 zu gehen
- Kein öffentliches Exposing der gesamten App
- Kein TLS zwischen `app` und `sandbox` im Ein-Host-Compose (Hop bleibt Docker-intern)

## Compose (Ziel)

HTTP-Overlays bleiben. TLS hängt Port 443 und Zertifikatspfade an denselben `proxy`-Service:

```yaml
ports:
  - '${PROXY_HTTP_PORT:-80}:80'
  - '${PROXY_HTTPS_PORT:-443}:443'
volumes:
  - ${PROXY_MANAGED_CERTS_HOST_PATH}:/data
  - ${PROXY_CADDYFILE_HOST_PATH}:/etc/caddy/Caddyfile:ro
  - ${PROXY_CERTS_HOST_PATH}:/certs:ro
```

Stock Caddy für Custom-TLS ist möglich. Managed DNS-01 (Image mit Plugin vs. separater
ACME-Client vs. anderer Proxy) ist **offen**.

## Host-Konfiguration (Ziel)

```text
PROXY_MODE=off | http | tls-custom | tls-managed
TLS_MODE=disabled | custom | managed
TLS_CERT_SOURCE=none | file | acme-dns | external
PROXY_HTTPS_PORT=443
```

ACME-Secrets nur im Install-Home mit restriktiven Rechten, nicht in der App-DB, nicht
im Renderer. Persistenter Caddy-/ACME-State unter `<PRAXIS_FLOW_HOME>/certs/…`, nicht
in einem anonymen Docker-Volume. Backup umfasst Konfig + Zertifikate + ACME-State.

## Internet-Whitelist

Öffentlich nur:

- `/portal`, `/portal/*`
- Portal-APIs, mindestens Session-Resolve, Captive-Authorize, Patient-Documents-Intake
  (exakte Liste bei Implementierung gegen OpenAPI prüfen)

Nicht öffentlich: `/mfa`, `/terminal`, `/tv`, `/ops`, `/api/v1/ops/*`.

## Sicherheit

- Proxy routet nur zur App, nie zur Sandbox
- `X-Forwarded-*` nur von bekannten Proxy-Quellen (heutiges `TRUST_PROXY_HEADERS=true`
  reicht dafür nicht)
- Cookies bei erkanntem HTTPS mit `Secure`
- TLS-Setup blockiert, wenn Sandbox ins LAN/Public zeigt oder über den Proxy erreichbar wäre

## Offene Entscheidungen

1. Bleibt Stock Caddy der TLS-Baustein, oder Traefik/nginx?
2. Custom-TLS vs. managed: Zertifikatdateien, `xcaddy`+DNS-Plugin, oder separater ACME-Client?
3. Setup-API: TLS als Erweiterung von `POST /host/network` oder eigene `/proxy`-Endpunkte?

## Umsetzung erst nach dem Kunden-Test

Scope: [`roadmap.md`](roadmap.md). Detailhistorie und Ist-HTTP: Archiv.
