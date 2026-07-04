#!/bin/bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "gateway: missing required env var ${name}" >&2
    exit 1
  fi
}

require_env GATEWAY_INTERFACE
require_env GATEWAY_IP
require_env GATEWAY_DHCP_RANGE_START
require_env GATEWAY_DHCP_RANGE_END
require_env APP_PORTAL_URL
require_env APP_API_URL
require_env PORTAL_FQDN
require_env OPENNDS_FAS_KEY
require_env AUTH_KEY_CAPTIVE

parse_portal_url() {
  local raw="$1"
  local without_scheme="${raw#*://}"

  if [[ "$without_scheme" == *"/"* ]]; then
    local hostport="${without_scheme%%/*}"
    APP_PORTAL_PATH="/${without_scheme#*/}"
  else
    local hostport="$without_scheme"
    APP_PORTAL_PATH="/"
  fi

  APP_REMOTE_IP="${hostport%%:*}"
  if [[ "$hostport" == *:* ]]; then
    APP_REMOTE_PORT="${hostport##*:}"
  else
    APP_REMOTE_PORT="80"
  fi
}

parse_portal_url "$APP_PORTAL_URL"
export APP_REMOTE_IP APP_REMOTE_PORT APP_PORTAL_PATH

if [[ -z "${APP_PORTAL_MENU_URL:-}" ]]; then
  APP_PORTAL_MENU_URL="${APP_PORTAL_URL%/}/menu"
fi
export APP_PORTAL_MENU_URL

if ! ip link show "$GATEWAY_INTERFACE" >/dev/null 2>&1; then
  echo "gateway: interface ${GATEWAY_INTERFACE} not found — set GATEWAY_INTERFACE to the guest-LAN NIC" >&2
  exit 1
fi

mkdir -p /etc/opennds /etc/dnsmasq.d /run/dnsmasq

envsubst '${GATEWAY_INTERFACE} ${GATEWAY_IP} ${GATEWAY_DHCP_RANGE_START} ${GATEWAY_DHCP_RANGE_END} ${APP_REMOTE_IP} ${APP_REMOTE_PORT} ${APP_PORTAL_PATH} ${PORTAL_FQDN} ${OPENNDS_FAS_KEY}' \
  < /opt/praxis-flow/templates/opennds.conf.template \
  > /etc/opennds/opennds.conf

envsubst '${GATEWAY_INTERFACE} ${GATEWAY_IP} ${GATEWAY_DHCP_RANGE_START} ${GATEWAY_DHCP_RANGE_END}' \
  < /opt/praxis-flow/templates/dnsmasq.conf.template \
  > /etc/dnsmasq.d/praxis-flow.conf

echo "gateway: starting auth bridge on ${GATEWAY_AUTH_BRIDGE_BIND:-0.0.0.0}:${GATEWAY_AUTH_BRIDGE_PORT:-9100}"
python3 /opt/praxis-flow/auth-bridge.py &
AUTH_BRIDGE_PID=$!

cleanup() {
  kill "$AUTH_BRIDGE_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "gateway: starting dnsmasq (${GATEWAY_INTERFACE}, DHCP ${GATEWAY_DHCP_RANGE_START}-${GATEWAY_DHCP_RANGE_END})"
dnsmasq --keep-in-foreground --conf-file=/etc/dnsmasq.d/praxis-flow.conf &
DNSMASQ_PID=$!

echo "gateway: starting openNDS (splash → ${APP_PORTAL_URL})"
opennds -f &
OPENNDS_PID=$!

wait -n "$DNSMASQ_PID" "$OPENNDS_PID"
exit $?
