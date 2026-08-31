# Praxis Flow — Guest WLAN Gateway (Lab-Referenz)

> **Nicht Produktkern.** Praxis Flow stellt keine Router/Captive-Hardware her.
> Soll-Grenze: Portal + Wartenummer + dünne Vendor-Adapter — `docs/operations/integrations.md`.
> Dieser Ordner bleibt als **Lab-/Referenz-Scaffold** (openNDS) im Repo.

Optional third container for **Captive Portal + DHCP** on the guest LAN (lab only).  
Portal UI and session logic stay in the `app` container (`/portal/*`).

**End-to-End (archiviert):** [`docs/archive/gateway-captive-portal.md`](../docs/archive/gateway-captive-portal.md)

## Stack

| Component          | Role                                                           |
| ------------------ | -------------------------------------------------------------- |
| **openNDS**        | Captive portal redirect, firewall rules, client auth           |
| **dnsmasq**        | DHCP on guest interface (`port=0` — DNS via openNDS)           |
| **auth-bridge.py** | After valid ticket → `ndsctl auth` (opens internet for client) |

Base image: `debian:bookworm-slim`.

## Start (lab / Linux only)

Requires **Linux host** with `network_mode: host` and a real guest-LAN NIC.

```bash
docker compose -f docker-compose.yml -f docker-compose.gateway.yml --profile gateway up -d --build
```

Delivery overlay (lab): `docker-compose.gateway.delivery.yml`.

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
