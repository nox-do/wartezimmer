# syntax=docker/dockerfile:1
# Local custom Caddy with the acmedns DNS-01 plugin (LAN-TLS managed path).
# Stock HTTP-only default remains caddy:2.11.4 via PRAXIS_FLOW_PROXY_IMAGE unset.
#
# Build (repo root):
#   docker build -t praxis-flow-proxy:2.11.4-acmedns -f proxy/Dockerfile .
#
# Verify plugin:
#   docker run --rm praxis-flow-proxy:2.11.4-acmedns caddy version
#   docker run --rm praxis-flow-proxy:2.11.4-acmedns caddy list-modules | grep acmedns
#
# Use with existing compose:
#   PRAXIS_FLOW_PROXY_IMAGE=praxis-flow-proxy:2.11.4-acmedns \
#     docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
#
# Plugin pin: github.com/caddy-dns/acmedns@v0.7.0
# Latest semver on pkg.go.dev as of 2026-08-28; go.mod targets caddy/v2 ≥ 2.10.
# xcaddy in caddy:2.11.4-builder compiles the plugin against Caddy 2.11.4.

FROM caddy:2.11.4-builder AS builder

RUN xcaddy build \
    --with github.com/caddy-dns/acmedns@v0.7.0

FROM caddy:2.11.4@sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
