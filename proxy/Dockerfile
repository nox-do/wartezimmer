# syntax=docker/dockerfile:1
# Local custom Caddy with the acmedns DNS-01 plugin (LAN-TLS managed path).
# Stock HTTP-only default remains caddy:2.11.7 via WARTEZIMMER_PROXY_IMAGE unset.
#
# Build (repo root):
#   docker build -t wartezimmer-proxy:2.11.7-acmedns -f proxy/Dockerfile .
#
# Verify plugin:
#   docker run --rm wartezimmer-proxy:2.11.7-acmedns caddy version
#   docker run --rm wartezimmer-proxy:2.11.7-acmedns caddy list-modules | grep acmedns
#
# Use with existing compose:
#   WARTEZIMMER_PROXY_IMAGE=wartezimmer-proxy:2.11.7-acmedns \
#     docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
#
# Plugin pin: github.com/caddy-dns/acmedns@v0.7.0
# Latest semver on pkg.go.dev as of 2026-08-28; go.mod targets caddy/v2 ≥ 2.10.
# xcaddy in caddy:2.11.7-builder compiles the plugin against Caddy 2.11.7.

FROM --platform=$BUILDPLATFORM caddy:2.11.7-builder@sha256:d842facfd63b960922e57444ff76fd8f0793a66dfdcf481af8026e1f4e6a39b4 AS builder

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS} GOARCH=${TARGETARCH}

RUN xcaddy build \
    --with github.com/caddy-dns/acmedns@v0.7.0 \
    --replace golang.org/x/net=golang.org/x/net@v0.60.0

FROM caddy:2.11.7@sha256:685ae3d7c34d9b5f8caeddc5d14051db7bbd88ff1f5a2fa0c16bd8ca328fb7af

# Apply security patches from the stable Alpine repositories.
RUN apk upgrade --no-cache

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
