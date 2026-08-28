# TLS Lab (Arbeitspaket 2)

Opt-in DNS-01 lab: Pebble + local acme-dns + CoreDNS. No Setup obtain/verify/apply.

## Start (Alternativen — nicht nacheinander)

Feste `container_name` und Host-Ports: nur **eine** Lab-Instanz gleichzeitig.

**A — Infra-Smoke (empfohlen zum Prüfen)**

```sh
npm run smoke:tls-lab
```

Startet einen eigenen Compose-Stack, prüft Directory / Register / Challenge-CNAME→TXT / A, und räumt danach auf. Optional: `npm run smoke:tls-lab -- --keep`.

**B — Interaktives Lab (ohne Smoke)**

```sh
docker compose -f docker-compose.tls-lab.yml up -d
# … manuell arbeiten …
docker compose -f docker-compose.tls-lab.yml down
```

Nicht `up -d` und danach denselben Host mit `smoke:tls-lab` ohne vorheriges `down` nutzen — die Container-Namen kollidieren. Läuft das Lab bereits (B), prüft der Smoke dagegen und startet keinen zweiten Stack.

## Zones

| Zone | Role |
| --- | --- |
| `lan.tls.lab` | Statische A/CNAME-Fixtures (`labhost` → `192.0.2.10`, `alias` → `labhost`). Challenge-CNAME `_acme-challenge.labhost` setzt der Smoke nach `/register` auf die echte `fulldomain`. |
| `auth.acme.tls.lab` | An acme-dns delegiert (dynamische TXT nach `/register` + update) |

## Endpoints (containers)

| Service | URL / address |
| --- | --- |
| Pebble directory | `https://pebble:14000/dir` (trust `lab/tls/pebble.minica.pem`) |
| acme-dns API | `http://acme-dns:80` |
| CoreDNS | `coredns:53` |

Host loopback: Pebble `127.0.0.1:14000`, acme-dns API `127.0.0.1:8053`, CoreDNS `127.0.0.1:9053`.  
Host und Container teilen **kein** gemeinsames `localhost` — AP3 verdrahtet eine für beide erreichbare API-URL.

## Proxy trust (optional)

Wenn der echte Proxy-Stack läuft, zusätzlich `docker-compose.tls-lab-proxy.yml` (Minica-Mount + `SSL_CERT_DIR`). Kein systemweiter Trust.

## Pins

Siehe Kommentare in `docker-compose.tls-lab.yml`. **acme-dns** ist auf `v1.0` gepinnt (nicht `v2.0.2`: fehlender `sqlite3`-Treiber im Image). Das Image ist nur `linux/amd64` — auf Apple Silicon läuft es unter Emulation (Docker warnt). CoreDNS ist nötig, damit Pebble die von acme-dns gelieferten TXT auflöst; `pebble-challtestsrv` allein passt nicht zum echten `acmedns`-Plugin.

## Non-goals (AP3+)

`prepare` / `verify-dns` / `obtain-certificate`, Resolver-Umschaltung in `host-tls.ts`, Leaf-Cert-Checks, Manager, Release.
