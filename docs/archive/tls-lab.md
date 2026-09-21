# TLS Lab (Arbeitspaket 2–4)

> **Archiviert (2026-08-31).** Opt-in Lab-Doku. Compose/Smoke bleiben im Repo.
> Produkt-TLS: [`../operations/tls.md`](../operations/tls.md); historischer
> Ausgangsplan: [`plan-proxy-tls.md`](plan-proxy-tls.md).

Opt-in DNS-01 lab: Pebble + local acme-dns + CoreDNS. Work package 3 wires Setup
`prepare` → `verify-dns` → `obtain-certificate`. Work package 4 adds HTTPS cutover via
`POST /api/setup/host/tls/apply`. Canonical and device URLs stay HTTP until apply.

## Prerequisites

- Docker Engine / Desktop
- Custom Caddy image with `dns.providers.acmedns` (AP1)
- A single private LAN IPv4, or an explicit override (see below)
- Ports free: `80`, `443`, `8080`, loopback `14000`, `15000`, `8053`, `9053`
- Fixed `container_name` values: run `docker compose down` for the default stack and any other TLS lab first (`stop` is not enough)

Feste `container_name` und Host-Ports: nur **eine** Lab- bzw. App-Instanz gleichzeitig.

## Custom image

```sh
docker build -t praxis-flow-proxy:2.11.4-acmedns -f proxy/Dockerfile .
docker run --rm praxis-flow-proxy:2.11.4-acmedns caddy list-modules | grep acmedns
```

`PRAXIS_FLOW_PROXY_IMAGE=praxis-flow-proxy:2.11.4-acmedns` — the HTTP-only default
remains `caddy:2.11.4`.

## Dynamic LAN IP

The managed smoke never hard-codes a developer LAN address.

- Optional override: `TLS_LAB_LAN_IP`
- Otherwise: private, non-internal IPv4 from `os.networkInterfaces()`
- Allowed: `10/8`, `172.16/12`, `192.168/16`
- Exactly one candidate → use it
- Zero or several candidates → abort and require `TLS_LAB_LAN_IP`
- Same IP is used for `prepare.lanIp` and the runtime A-record of `labhost.lan.tls.lab`
- Local Caddy checks always use `127.0.0.1:443`

Runtime zone files live under `.tmp/` and are deleted after the smoke. The tracked
`lab/coredns/lan.tls.lab.db` is not permanently rewritten.

## Env keys (lab / Setup)

| Key                                                      | Role                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TLS_ACME_DIRECTORY=pebble`                              | Caddy ACME `https://pebble:14000/dir`; DNS-01 zone lookup via `resolvers coredns:53`       |
| `TLS_ACME_DNS_API=http://127.0.0.1:8053`                 | Host-side acme-dns `/register`                                                             |
| `TLS_ACME_DNS_CREDENTIALS_SERVER_URL=http://acme-dns:80` | `server_url` inside `state/tls/acme-dns.json` only                                         |
| `TLS_DNS_RESOLVERS=127.0.0.1:9053`                       | `verify-dns` resolvers (IPv4 or `IPv4:port`, comma/space). Unset = `1.1.1.1` and `8.8.8.8` |
| `TLS_PEBBLE_ROOT_CA_PATH`                                | PEM for Setup local checks **only** when directory is `pebble`                             |
| `TLS_OPERATOR_ZONE=lan.tls.lab`                          | Managed hostname `labhost.lan.tls.lab`                                                     |
| `TLS_LAB_LAN_IP`                                         | Smoke-only LAN-IP override                                                                 |
| `PRAXIS_FLOW_PROXY_IMAGE`                                | Custom Caddy tag                                                                           |
| `TLS_RUNTIME_FAKE`                                       | Must stay unset for this smoke                                                             |

Credentials never go into `.env`. Unset `TLS_ACME_DNS_CREDENTIALS_SERVER_URL` keeps
the previous behaviour (registration URL written into the secret).

## Minica vs dynamic Pebble root

| Trust                                              | What                                                              | Used for                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `lab/tls/pebble.minica.pem`                        | Static HTTPS cert for Pebble's directory/management listener      | Caddy → `https://pebble:14000/dir`; smoke fetch of `/roots/0`       |
| Runtime PEM from `https://127.0.0.1:15000/roots/0` | CA that **signs issued certificates** (new on every Pebble start) | Setup `tls.connect` / `http2.connect` via `TLS_PEBBLE_ROOT_CA_PATH` |

Neither is installed system-wide. `NODE_EXTRA_CA_CERTS` is not used. Production and
staging ignore `TLS_PEBBLE_ROOT_CA_PATH`. Management port `15000` is published on
host loopback only.

A Pebble container restart always mints a new issuing CA. After that, re-fetch
`/roots/0` into `TLS_PEBBLE_ROOT_CA_PATH` and run obtain again. Setup product restart
(`POST /api/setup/host/compose` action `restart`) only restarts `app` / `sandbox` /
`proxy` (and gateway when enabled), not the lab services.

## Start (alternatives — not all at once)

**A — Infrastructure smoke (no Setup obtain)**

```sh
npm run smoke:tls-lab
```

**B — Managed Setup smoke to `applyReady=true` (AP3)**

```sh
npm run smoke:tls-managed
```

Isolated runtime under `.tmp/tls-managed/`, Setup API on `127.0.0.1:19192`,
compose project `praxis-flow-tls-managed`. Does **not** call `apply`. Optional:
`npm run smoke:tls-managed -- --keep` retains the containers and runtime files but
stops the Setup process; `--cleanup` removes the retained stack and runtime.

Expected end state:

- `tls.state=dns-verified`
- `tls.applyReady=true`
- `tls.tokenConsumed=true`
- real Pebble certificate; TCP 443 / h2 / SSE green
- Canonical and device URLs still `http://…`

**C — HTTPS cutover smoke (AP4)**

```sh
npm run smoke:tls-cutover
```

Isolated runtime under `.tmp/tls-cutover/`, Setup API on `127.0.0.1:19193`,
compose project `praxis-flow-tls-cutover`. Same Pebble lab and fixed container
names as B — do not run A/B/C together. Does **not** call Manager, Release, or
Backup. Optional `--keep` / `--cleanup` like B.

Expected end state:

- `tls.state=active`, `tls.cutoverApplied=true`
- `PROXY_MODE=tls-managed`
- `CANONICAL_BASE_URL=https://labhost.lan.tls.lab` (no `:443`)
- device URLs HTTPS on that hostname
- port 80 permanent redirect to HTTPS
- HTTPS, HTTP/2 and SSE still green

If apply reload fails, Setup keeps HTTP Canonical / `PROXY_MODE=http` and
`applyReady=true` so apply can be retried. Re-fetch `/roots/0` only after a
Pebble restart, not after a product compose restart.

**D — Interactive lab (infra only)**

```sh
docker compose -f docker-compose.tls-lab.yml up -d
# …
docker compose -f docker-compose.tls-lab.yml down
```

Do not run B, C, or `smoke:tls-lab` against the same host while another alternative
already occupies the lab container names.

## Zones

| Zone                | Role                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `lan.tls.lab`       | A/CNAME fixtures. Managed smoke writes a runtime copy: `labhost` A = detected LAN IP, challenge CNAME from Setup `operatorRequest`. |
| `auth.acme.tls.lab` | Delegated to acme-dns (TXT after `/register` + Caddy DNS-01 updates)                                                                |

## Endpoints

| Service           | URL / address                                                 |
| ----------------- | ------------------------------------------------------------- |
| Pebble directory  | `https://pebble:14000/dir` (trust minica)                     |
| Pebble management | host `https://127.0.0.1:15000` (`/roots/0`)                   |
| acme-dns API      | containers `http://acme-dns:80`; host `http://127.0.0.1:8053` |
| CoreDNS           | `coredns:53`; host `127.0.0.1:9053`                           |

## Troubleshooting

| Symptom                              | What to check                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smoke asks for `TLS_LAB_LAN_IP`      | More than one (or zero) RFC1918 IPv4 on the host, including Docker bridges. Set the address that browsers in the LAN would use.                          |
| `verify-dns` A/CNAME red             | Runtime zone under `.tmp/` updated? CoreDNS `reload 2s`? `TLS_DNS_RESOLVERS=127.0.0.1:9053`? Do not use `/etc/hosts`.                                    |
| Certificate checks fail / unknown CA | Fetch current `/roots/0` after Pebble start into `TLS_PEBBLE_ROOT_CA_PATH`. Minica is not the issuing CA.                                                |
| Pebble was restarted                 | Issuing CA is new. Re-fetch `/roots/0` into `TLS_PEBBLE_ROOT_CA_PATH` and obtain the certificate again. Product compose restart does not restart Pebble. |
| Port 443 busy                        | Another proxy/Caddy; stop it. Local checks use `127.0.0.1:443` with SNI `labhost.lan.tls.lab`.                                                           |
| `dns.providers.acmedns` missing      | Rebuild `praxis-flow-proxy:2.11.4-acmedns`.                                                                                                              |
| Docker missing                       | The smoke **fails** (no silent skip). CI may omit the job only via an explicit gate.                                                                     |

## Pins

See comments in `docker-compose.tls-lab.yml`. **acme-dns** is pinned to `v1.0`.
The image is `linux/amd64` (Apple Silicon uses emulation).

## Non-goals (later)

Manager, Wizard, Release / `.pfupdate`, production Let's Encrypt,
`auth.acme.praxis-flow.de`, Backup-Sidecar.
