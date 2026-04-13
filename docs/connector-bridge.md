# Connector Bridge Runtime Guide

This guide explains how to run the connector bridge locally using the v2 patch pack
and the mock connector server.

## 1) Validate bridge patch pack

```bash
py -3 copilot_minimax.py validate --patch-file patches/connector.bridge.v2.json
```

## 2) Apply bridge patch pack

```bash
py -3 copilot_minimax.py patch --patch-file patches/connector.bridge.v2.json
```

## 3) Start mock connector server

```bash
py -3 tools/mock_connector_server.py
# or from repo root convenience wrapper
py -3 mock_connector_server.py
```

Server endpoint:

- `http://127.0.0.1:8787/connector/tool`

## 4) Set bridge URL for Copilot runtime

The bridge wrapper checks these in order:

1. `globalThis.__COPILOT_CONNECTOR_BRIDGE_URL__`
2. `process.env.COPILOT_CONNECTOR_BRIDGE_URL`

For local testing, set environment variable before launching VS Code:

```powershell
$env:COPILOT_CONNECTOR_BRIDGE_URL = "http://127.0.0.1:8787/connector/tool"
code .
```

## 5) Test tool payloads (mock)

The mock server supports:

- `connector.gmail.list_threads`
- `connector.gmail.create_draft`
- `connector.gmail.send_message`

Contract definitions:

- `connectors/contracts/gmail.tools.v1.json`

## Notes

- `connector.gmail.send_message` requires `approvalToken` in payload in mock mode.
- Use `report` command to check patch markers and rule hit counts.
- If server startup fails, verify your terminal cwd is the repository root.
