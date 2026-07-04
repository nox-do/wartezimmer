# syntax=docker/dockerfile:1

FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    opennds \
    dnsmasq \
    iptables \
    iproute2 \
    ipset \
    curl \
    ca-certificates \
    python3-minimal \
    gettext-base \
    procps \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/praxis-flow

COPY gateway/auth-bridge.py ./auth-bridge.py
COPY gateway/entrypoint.sh ./entrypoint.sh
COPY gateway/templates/ ./templates/

RUN chmod +x /opt/praxis-flow/entrypoint.sh /opt/praxis-flow/auth-bridge.py

ENV GATEWAY_INTERFACE=eth0 \
  GATEWAY_IP=192.168.88.1 \
  GATEWAY_DHCP_RANGE_START=192.168.88.50 \
  GATEWAY_DHCP_RANGE_END=192.168.88.250 \
  APP_PORTAL_URL=http://127.0.0.1:8080/portal \
  APP_API_URL=http://127.0.0.1:8080 \
  APP_PORTAL_MENU_URL=http://127.0.0.1:8080/portal/menu \
  PORTAL_FQDN=portal.praxis.local \
  OPENNDS_FAS_KEY=change-me-opennds-fas-key \
  GATEWAY_AUTH_BRIDGE_PORT=9100

ENTRYPOINT ["/opt/praxis-flow/entrypoint.sh"]
