# Praxis Flow — Guest WLAN Gateway

Optional third container for **Captive Portal + DHCP** on the guest LAN.  
Portal UI and session logic stay in the `app` container (`/portal/*`).

**End-to-End-Setup (Netzwerk, Env, Test):** [`docs/gateway-captive-portal.md`](../docs/gateway-captive-portal.md)

## Stack

| Component          | Role                                                           |
| ------------------ | -------------------------------------------------------------- |
| **openNDS**        | Captive portal redirect, firewall rules, client auth           |
| **dnsmasq**        | DHCP on guest interface (`port=0` — DNS via openNDS)           |
| **auth-bridge.py** | After valid ticket → `ndsctl auth` (opens internet for client) |

Base image: `debian:bookworm-slim`.

## Start (dev / lab)

Requires **Linux host** with `network_mode: host` and a real guest-LAN NIC.

```bash
# app + sandbox as usual, plus gateway profile
docker compose -f docker-compose.yml -f docker-compose.gateway.yml --profile gateway up -d --build
```

Delivery (image-based):

```bash
docker compose \
  -f docker-compose.delivery.yml \
  -f docker-compose.gateway.delivery.yml \
  --profile gateway \
  --env-file .env \
  up -d
```

## Required `.env` values

See `.env.example` (`GATEWAY_*`, `APP_PORTAL_URL`, `OPENNDS_FAS_KEY`).

| Variable                  | Example                            | Meaning                                               |
| ------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `GATEWAY_INTERFACE`       | `eth1`                             | NIC facing guest WLAN / VLAN                          |
| `GATEWAY_IP`              | `192.168.88.1`                     | Gateway address on that NIC                           |
| `APP_PORTAL_URL`          | `http://192.168.88.10:8080/portal` | openNDS FAS splash (app UI)                           |
| `APP_API_URL`             | `http://192.168.88.10:8080`        | Auth bridge → app `verify-ticket-code` (role captive) |
| `PORTAL_FQDN`             | `portal.praxis.local`              | Walled-garden hostname                                |
| `OPENNDS_FAS_KEY`         | long random string                 | Shared with openNDS FAS (no quotes)                   |
| `AUTH_KEY_CAPTIVE`        | same as app                        | Protects auth bridge endpoint                         |
| `GATEWAY_AUTH_BRIDGE_URL` | `http://192.168.10.25:9100`        | App container → bridge on gateway PC management IP     |
| `GATEWAY_AUTH_BRIDGE_BIND`| `192.168.10.25`                    | Bridge listens on Praxis-LAN IP only (not guest NIC)  |

`APP_PORTAL_URL` must be reachable from patient phones **before** full internet auth (walled garden on app port). `APP_API_URL` must be reachable from the gateway Mini-PC so the auth bridge can verify tickets against the app.

## Auth flow (Runtime)

```text
Phone joins guest WLAN
  → openNDS redirects to APP_PORTAL_URL (/portal?clientip=…&clientmac=…)
  → Patient enters Wartenummer
  → Portal: POST /api/v1/sessions/resolve-ticket
  → Portal: POST /api/v1/sessions/captive-authorize (session bearer)
  → App proxies to gateway auth bridge (Bearer AUTH_KEY_CAPTIVE)
  → auth-bridge: ndsctl auth <client>
  → Patient gets internet + /portal/menu
```

The portal UI calls `captive-authorize` after `resolve-ticket` when openNDS query params were present.

### Auth bridge (internal, app → gateway)

- `GET /internal/health`
- `POST /internal/nds-auth` with `Authorization: Bearer <AUTH_KEY_CAPTIVE>`

Payload/Response: siehe `docs/gateway-captive-portal.md`.

## Limits (v1 scaffold)

- **macOS Docker Desktop**: `network_mode: host` is not usable for real captive portal tests — use Linux VM/bare metal.
- **HTTPS**: `fas_secure_enabled 0` (HTTP LAN only). TLS later via local CA or reverse proxy.
- **Router**: Praxis AP must route guest traffic through this host/NIC — we do not ship the AP.

## Files

```
gateway/
  Dockerfile
  entrypoint.sh
  auth-bridge.py
  templates/
    opennds.conf.template
    dnsmasq.conf.template
```

Compose overlays: `docker-compose.gateway.yml`, `docker-compose.gateway.delivery.yml`.
