#!/usr/bin/env python3
"""Mock connector bridge server for local end-to-end testing.

POST /connector/tool
Body: {"tool": "connector.gmail.list_threads", "args": [ ... ]}
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

HOST = "127.0.0.1"
PORT = 8787


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    raw = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


class ConnectorHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/connector/tool":
            _json_response(self, 404, {"error": "not_found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(content_length).decode("utf-8")
            body = json.loads(raw)
        except Exception:
            _json_response(self, 400, {"error": "invalid_json"})
            return

        tool = body.get("tool")
        args = body.get("args", [])
        if not isinstance(tool, str):
            _json_response(self, 400, {"error": "missing_tool"})
            return

        payload = self._handle_tool(tool, args)
        _json_response(self, 200, payload)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def _handle_tool(self, tool: str, args: list[Any]) -> dict[str, Any]:
        if tool == "connector.gmail.list_threads":
            return {
                "threads": [
                    {
                        "id": "thr_1001",
                        "subject": "Production issue follow-up",
                        "from": "ops@acme.com",
                        "snippet": "Can you confirm ETA for fix and RCA?",
                        "isUnread": True,
                    },
                    {
                        "id": "thr_1002",
                        "subject": "Billing question",
                        "from": "finance@globex.com",
                        "snippet": "Need invoice copy for March.",
                        "isUnread": True,
                    },
                ]
            }

        if tool == "connector.gmail.create_draft":
            payload = args[0] if args else {}
            return {
                "draftId": "drf_" + str(abs(hash(json.dumps(payload, sort_keys=True))) % 100000),
                "status": "draft_created",
            }

        if tool == "connector.gmail.send_message":
            payload = args[0] if args else {}
            if not isinstance(payload, dict) or not payload.get("approvalToken"):
                return {"error": "approval_required", "status": "blocked"}
            return {
                "messageId": "msg_" + str(abs(hash(json.dumps(payload, sort_keys=True))) % 100000),
                "status": "sent",
            }

        return {"error": "unknown_tool", "tool": tool}


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ConnectorHandler)
    print(f"Mock connector server listening at http://{HOST}:{PORT}/connector/tool")
    server.serve_forever()


if __name__ == "__main__":
    main()
