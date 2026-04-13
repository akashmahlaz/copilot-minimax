"""Helpers for writing VS Code settings integrations."""

from __future__ import annotations

import json

from .constants import MINIMAX_URL
from .paths import vscode_settings_path


def configure_settings(api_key: str) -> None:
    """Optionally write Claude Code env vars for the MiniMax key."""
    settings_path = vscode_settings_path()
    if not settings_path.exists():
        print(f"Warning: VS Code settings.json not found at {settings_path}")
        return

    settings = json.loads(settings_path.read_text(encoding="utf-8"))

    settings["claudeCode.environmentVariables"] = [
        {"name": "ANTHROPIC_BASE_URL", "value": MINIMAX_URL},
        {"name": "ANTHROPIC_AUTH_TOKEN", "value": api_key},
        {"name": "API_TIMEOUT_MS", "value": "3000000"},
        {"name": "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "value": "1"},
        {"name": "ANTHROPIC_MODEL", "value": "MiniMax-M2.7"},
        {"name": "ANTHROPIC_SMALL_FAST_MODEL", "value": "MiniMax-M2.7"},
        {"name": "ANTHROPIC_DEFAULT_SONNET_MODEL", "value": "MiniMax-M2.7"},
        {"name": "ANTHROPIC_DEFAULT_OPUS_MODEL", "value": "MiniMax-M2.7"},
        {"name": "ANTHROPIC_DEFAULT_HAIKU_MODEL", "value": "MiniMax-M2.7"},
    ]

    settings_path.write_text(
        json.dumps(settings, indent=4, ensure_ascii=False),
        encoding="utf-8",
    )
    print("Updated VS Code settings with MiniMax env vars.")
