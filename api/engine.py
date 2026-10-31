"""Vercel Python function: the TrafficLab analysis engine over HTTP.

POST /api/engine   headers: x-engine-token   body: {"action": "report"|"export_csv", "payload": {...}}
Only the Node API function (which knows ENGINE_TOKEN) may call it. The calculations themselves live in
backend/trafficlab_engine.py and are identical to the local/CLI engine.
"""
import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from backend.trafficlab_engine import ReportExporter, build_report  # noqa: E402

MAX_BODY = 4_400_000  # Vercel's request body limit is 4.5 MB


class handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        expected = os.environ.get("ENGINE_TOKEN", "")
        given = self.headers.get("x-engine-token", "")
        if not expected or not hmac.compare_digest(expected.encode(), given.encode()):
            return self._send(403, {"error": "forbidden"})
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > MAX_BODY:
                return self._send(413, {"error": "bad body size"})
            req = json.loads(self.rfile.read(length).decode("utf-8"))
            action, payload = req.get("action"), req.get("payload") or {}
            if action == "report":
                return self._send(200, build_report(payload))
            if action == "export_csv":
                rep = build_report(payload)
                return self._send(200, {"csv": ReportExporter.export_csv(rep["matches"], rep["analytics"]["od_matrix"], rep["ambiguous"])})
            return self._send(400, {"error": "unknown action"})
        except (KeyError, ValueError, TypeError) as exc:
            return self._send(422, {"error": f"Invalid input: {exc}"})
        except Exception:  # noqa: BLE001 - never leak internals
            return self._send(500, {"error": "engine failure"})

    def do_GET(self):
        self._send(405, {"error": "POST only"})
