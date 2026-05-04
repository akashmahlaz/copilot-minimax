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


def _candidate_copilot_chat_dirs() -> list[Path]:
    """Return candidate Copilot Chat extension directories.

    Supports both the legacy standalone marketplace install
    (`github.copilot-chat-*`) and the newer bundled VS Code `copilot`
    extension layout.
    """
    candidates: list[Path] = []

    legacy_root = extensions_dir()
    if legacy_root.exists():
        candidates.extend(legacy_root.glob("github.copilot-chat-*"))

    if platform.system() == "Windows":
        program_roots = [
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Microsoft VS Code",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Microsoft VS Code Insiders",
        ]
        for root in program_roots:
            if not root.exists():
                continue
            candidates.extend(root.glob("*\u005cresources\u005capp\u005cextensions\u005ccopilot"))
    elif platform.system() == "Darwin":
        candidates.extend(
            [
                Path("/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/copilot"),
                Path("/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/copilot"),
            ]
        )
    else:
        candidates.extend(
            [
                Path("/usr/share/code/resources/app/extensions/copilot"),
                Path("/usr/share/code-insiders/resources/app/extensions/copilot"),
                Path.home() / ".vscode-server" / "extensions" / "copilot",
            ]
        )

    return [path for path in candidates if path.exists()]


def find_copilot_chat_dir() -> Path | None:
    """Find the newest installed Copilot Chat extension candidate."""
    candidates = sorted(
        _candidate_copilot_chat_dirs(),
        key=lambda p: (
            extension_js_path(p).stat().st_mtime if extension_js_path(p).exists() else 0,
            p.name,
        ),
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
