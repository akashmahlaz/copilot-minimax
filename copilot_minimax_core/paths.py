"""Path helpers for VS Code extension and user settings locations."""

from __future__ import annotations

import os
import platform
from pathlib import Path

from .constants import BACKUP_SUFFIX


def extensions_dir() -> Path:
    """Return the VS Code extensions directory for the current platform."""
    if platform.system() == "Windows":
        return Path(os.environ["USERPROFILE"]) / ".vscode" / "extensions"
    if platform.system() == "Darwin":
        return Path.home() / ".vscode" / "extensions"
    return Path.home() / ".vscode" / "extensions"


def find_copilot_chat_dir() -> Path | None:
    """Find the latest installed github.copilot-chat extension."""
    candidates = sorted(
        extensions_dir().glob("github.copilot-chat-*"),
        key=lambda p: p.name,
        reverse=True,
    )
    return candidates[0] if candidates else None


def extension_js_path(copilot_dir: Path) -> Path:
    """Return the extension.js path for a Copilot Chat extension directory."""
    return copilot_dir / "dist" / "extension.js"


def backup_path(ext_js: Path) -> Path:
    """Return path where extension.js backup should be stored."""
    return ext_js.with_suffix(ext_js.suffix + BACKUP_SUFFIX)


def vscode_settings_path() -> Path:
    """Return the VS Code settings.json path for the current platform."""
    if platform.system() == "Windows":
        return Path(os.environ["APPDATA"]) / "Code" / "User" / "settings.json"
    if platform.system() == "Darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / "Code"
            / "User"
            / "settings.json"
        )
    return Path.home() / ".config" / "Code" / "User" / "settings.json"
