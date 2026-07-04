#!/usr/bin/env python3
"""Internal auth bridge: validate ticket via app API, authorize client in openNDS."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_API_URL = os.environ.get("APP_API_URL", "http://127.0.0.1:8080").rstrip("/")
BIND_HOST = os.environ.get("GATEWAY_AUTH_BRIDGE_BIND", "0.0.0.0").strip() or "0.0.0.0"
AUTH_KEY = os.environ.get("AUTH_KEY_CAPTIVE", "").strip()
PORT = int(os.environ.get("GATEWAY_AUTH_BRIDGE_PORT", "9100"))
NDSCTL = os.environ.get("NDSCTL_PATH", "/usr/bin/ndsctl")
DEFAULT_REDIRECT = os.environ.get("APP_PORTAL_MENU_URL", "").strip()


def log(message: str) -> None:
    print(f"auth-bridge: {message}", flush=True)


def ticket_is_valid(ticket_code: str) -> bool:
    payload = json.dumps({"ticketCode": ticket_code}).encode("utf-8")
    request = urllib.request.Request(
        f"{APP_API_URL}/api/v1/sessions/verify-ticket-code",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {AUTH_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=7) as response:
            return 200 <= response.status < 300
    except urllib.error.HTTPError as error:
        log(f"verify-ticket-code failed ({error.code}) for ticket {ticket_code!r}")
        return False
    except urllib.error.URLError as error:
        log(f"app API unreachable: {error}")
        return False


def nds_authorize(client_ident: str) -> bool:
    result = subprocess.run(
        [NDSCTL, "auth", client_ident],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        log(f"ndsctl auth failed for {client_ident!r}: {result.stderr.strip()}")
        return False
    return True


class AuthBridgeHandler(BaseHTTPRequestHandler):
    server_version = "PraxisFlowGatewayAuthBridge/0.1"

    def _authorized(self) -> bool:
        if not AUTH_KEY:
            return True
        header = self.headers.get("Authorization", "")
        return header == f"Bearer {AUTH_KEY}"

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/internal/health":
            self._send_json(200, {"ok": True})
            return
        self.send_error(404)

    def do_POST(self) -> None:
        if self.path != "/internal/nds-auth":
            self.send_error(404)
            return
        if not self._authorized():
            self.send_error(401)
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            self.send_error(400)
            return

        try:
            body = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400)
            return

        ticket_code = str(body.get("ticketCode", "")).strip()
        client_ip = str(body.get("clientIp", "")).strip()
        client_mac = str(body.get("clientMac", "")).strip()
        redirect_url = str(body.get("redirectUrl", DEFAULT_REDIRECT)).strip()

        if not ticket_code or (not client_ip and not client_mac):
            self.send_error(400)
            return

        if not ticket_is_valid(ticket_code):
            self.send_error(422, "Invalid ticket")
            return

        client_ident = client_ip or client_mac
        if not nds_authorize(client_ident):
            self.send_error(502, "OpenNDS authorization failed")
            return

        self._send_json(
            200,
            {
                "ok": True,
                "redirectUrl": redirect_url or DEFAULT_REDIRECT,
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        log(format % args)


def main() -> int:
    server = ThreadingHTTPServer((BIND_HOST, PORT), AuthBridgeHandler)
    log(f"listening on {BIND_HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
