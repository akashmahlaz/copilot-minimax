#!/usr/bin/env python3
"""
copilot-minimax: Patch VS Code Copilot Chat to use MiniMax API.

VS Code's built-in Anthropic provider hardcodes https://api.anthropic.com with
no option to change the base URL.  MiniMax exposes an Anthropic-compatible
endpoint at https://api.minimax.io/anthropic but does NOT support the /v1/models
listing that VS Code calls on startup.

This script patches the Copilot Chat extension to:
  1. Route Anthropic API traffic to api.minimax.io/anthropic
  2. Return hardcoded MiniMax model metadata instead of calling /v1/models

Usage:
    python copilot_minimax.py patch   [--key YOUR_KEY]   # apply patches
    python copilot_minimax.py restore                     # revert to backup
    python copilot_minimax.py status                      # show current state
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import platform
import shutil
import sys
from pathlib import Path

# ── MiniMax model catalogue ─────────────────────────────────────────────────
MINIMAX_MODELS = {
    "MiniMax-M2.7": {
        "maxInputTokens": 204800,
        "maxOutputTokens": 16384,
        "name": "MiniMax-M2.7",
        "toolCalling": True,
        "vision": True,
        "thinking": True,
    },
    "MiniMax-M2.7-highspeed": {
        "maxInputTokens": 204800,
        "maxOutputTokens": 16384,
        "name": "MiniMax-M2.7-highspeed",
        "toolCalling": True,
        "vision": True,
        "thinking": True,
    },
    "MiniMax-M2.5": {
        "maxInputTokens": 204800,
        "maxOutputTokens": 16384,
        "name": "MiniMax-M2.5",
        "toolCalling": True,
        "vision": True,
        "thinking": True,
    },
    "MiniMax-M2.5-highspeed": {
        "maxInputTokens": 204800,
        "maxOutputTokens": 16384,
        "name": "MiniMax-M2.5-highspeed",
        "toolCalling": True,
        "vision": True,
        "thinking": True,
    },
}

ANTHROPIC_URL = "https://api.anthropic.com"
MINIMAX_URL = "https://api.minimax.io/anthropic"

BACKUP_SUFFIX = ".copilot-minimax.bak"

# ── Helpers ──────────────────────────────────────────────────────────────────

def _extensions_dir() -> Path:
    """Return the VS Code extensions directory for the current platform."""
    if platform.system() == "Windows":
        return Path(os.environ["USERPROFILE"]) / ".vscode" / "extensions"
    elif platform.system() == "Darwin":
        return Path.home() / ".vscode" / "extensions"
    else:
        return Path.home() / ".vscode" / "extensions"


def _find_copilot_chat_dir() -> Path | None:
    """Find the latest installed github.copilot-chat extension."""
    ext_dir = _extensions_dir()
    candidates = sorted(
        ext_dir.glob("github.copilot-chat-*"),
        key=lambda p: p.name,
        reverse=True,
    )
    return candidates[0] if candidates else None


def _extension_js(copilot_dir: Path) -> Path:
    return copilot_dir / "dist" / "extension.js"


def _backup_path(ext_js: Path) -> Path:
    return ext_js.with_suffix(ext_js.suffix + BACKUP_SUFFIX)


# ── JS snippet for hardcoded models ─────────────────────────────────────────

def _models_js() -> str:
    """Build the JS object literal for the hardcoded model catalogue."""
    entries = []
    for model_id, meta in MINIMAX_MODELS.items():
        bools = ",".join(
            f"{k}:{'!0' if v else '!1'}" if isinstance(v, bool) else f"{k}:{v}"
            for k, v in meta.items()
            if k != "name"
        )
        entries.append(
            f'"{model_id}":{{name:"{meta["name"]}",{bools}}}'
        )
    return "{" + ",".join(entries) + "}"


# ── Patching logic ──────────────────────────────────────────────────────────

# The original getAllModels calls  new NS({apiKey:r}).models.list()  which hits
# /v1/models — an endpoint MiniMax does not implement.  We replace the body so
# it returns our hardcoded catalogue instead.
_OLD_GET_ALL_MODELS_PREFIX = (
    "async getAllModels(n,r){if(!r&&n)return[];try{"
    "let o=await new NS({apiKey:r}).models.list(),a={};"
    "for(let s of o.data)this._knownModels&&this._knownModels[s.id]?"
    "a[s.id]=this._knownModels[s.id]:"
    "a[s.id]={maxInputTokens:1e5,maxOutputTokens:16e3,"
    "name:s.display_name,toolCalling:!0,vision:!1,thinking:!1};"
    "return m9(this._name,a)}"
)


def _new_get_all_models() -> str:
    models_obj = _models_js()
    return (
        "async getAllModels(n,r){if(!r&&n)return[];try{"
        f"let a=Object.assign({models_obj},this._knownModels||{{}});"
        "return m9(this._name,a)}"
    )


def _patch_content(content: str) -> tuple[str, list[str]]:
    """Apply all patches and return (patched_content, list_of_changes)."""
    changes: list[str] = []

    # Patch 1 – redirect Anthropic base URL
    if ANTHROPIC_URL in content:
        content = content.replace(ANTHROPIC_URL, MINIMAX_URL)
        changes.append(f"Redirected {ANTHROPIC_URL} → {MINIMAX_URL}")

    # Patch 1b – bare hostname in telemetry attribute
    bare_old = '"api.anthropic.com"'
    bare_new = '"api.minimax.io/anthropic"'
    if bare_old in content:
        content = content.replace(bare_old, bare_new)
        changes.append("Fixed bare hostname in telemetry attributes")

    # Patch 2 – replace getAllModels to skip /v1/models call
    old_fn = _OLD_GET_ALL_MODELS_PREFIX
    if old_fn in content:
        new_fn = _new_get_all_models()
        content = content.replace(old_fn, new_fn, 1)
        models_list = ", ".join(MINIMAX_MODELS.keys())
        changes.append(f"Replaced model listing with hardcoded: {models_list}")

    return content, changes


def _is_patched(content: str) -> bool:
    return MINIMAX_URL in content and "MiniMax-M2.7" in content


# ── Commands ─────────────────────────────────────────────────────────────────

def cmd_status(args: argparse.Namespace) -> None:
    copilot_dir = _find_copilot_chat_dir()
    if not copilot_dir:
        print("❌ Copilot Chat extension not found.")
        return

    ext_js = _extension_js(copilot_dir)
    bak = _backup_path(ext_js)
    content = ext_js.read_text(encoding="utf-8")

    print(f"Extension : {copilot_dir.name}")
    print(f"File      : {ext_js}")
    print(f"Size      : {ext_js.stat().st_size:,} bytes")
    print(f"Backup    : {'✅ exists' if bak.exists() else '❌ none'}")

    if _is_patched(content):
        n_minimax = content.count("api.minimax.io/anthropic")
        n_models = content.count("MiniMax-M2.7")
        print(f"Status    : ✅ PATCHED (minimax refs: {n_minimax}, model refs: {n_models})")
    elif ANTHROPIC_URL in content:
        print("Status    : ⚪ UNPATCHED (original Anthropic URLs)")
    else:
        print("Status    : ⚠️  UNKNOWN (neither Anthropic nor MiniMax URLs found)")


def cmd_patch(args: argparse.Namespace) -> None:
    copilot_dir = _find_copilot_chat_dir()
    if not copilot_dir:
        print("❌ Copilot Chat extension not found under", _extensions_dir())
        sys.exit(1)

    ext_js = _extension_js(copilot_dir)
    if not ext_js.exists():
        print("❌ extension.js not found at", ext_js)
        sys.exit(1)

    print(f"📦 Extension: {copilot_dir.name}")
    content = ext_js.read_text(encoding="utf-8")

    if _is_patched(content):
        print("✅ Already patched — nothing to do.")
        print("   Run 'restore' first if you want to re-patch.")
        return

    # Create backup
    bak = _backup_path(ext_js)
    if not bak.exists():
        shutil.copy2(ext_js, bak)
        print(f"💾 Backup saved: {bak.name}")
    else:
        print(f"💾 Backup already exists: {bak.name}")

    # Apply patches
    patched, changes = _patch_content(content)

    if not changes:
        print("⚠️  No patchable patterns found. Extension version may have changed.")
        sys.exit(1)

    ext_js.write_text(patched, encoding="utf-8")

    print(f"\n✅ Patched successfully! ({len(changes)} changes)")
    for c in changes:
        print(f"   • {c}")

    # Optionally configure settings.json with API key
    if args.key:
        _configure_settings(args.key)

    print("\n🔄 Restart VS Code to apply changes.")
    print("   Then go to Language Models → Anthropic → enter your MiniMax API key.")


def cmd_restore(args: argparse.Namespace) -> None:
    copilot_dir = _find_copilot_chat_dir()
    if not copilot_dir:
        print("❌ Copilot Chat extension not found.")
        sys.exit(1)

    ext_js = _extension_js(copilot_dir)
    bak = _backup_path(ext_js)

    if not bak.exists():
        print("❌ No backup found. Nothing to restore.")
        sys.exit(1)

    shutil.copy2(bak, ext_js)
    print(f"✅ Restored from backup: {bak.name}")
    print("🔄 Restart VS Code to apply.")


def _vscode_settings_path() -> Path:
    if platform.system() == "Windows":
        return Path(os.environ["APPDATA"]) / "Code" / "User" / "settings.json"
    elif platform.system() == "Darwin":
        return Path.home() / "Library" / "Application Support" / "Code" / "User" / "settings.json"
    else:
        return Path.home() / ".config" / "Code" / "User" / "settings.json"


def _configure_settings(api_key: str) -> None:
    """Optionally write Claude Code env vars for the MiniMax key."""
    settings_path = _vscode_settings_path()
    if not settings_path.exists():
        print(f"⚠️  VS Code settings.json not found at {settings_path}")
        return

    settings = json.loads(settings_path.read_text(encoding="utf-8"))

    # Set claudeCode.environmentVariables for Claude Code integration too
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
    print(f"⚙️  VS Code settings updated with MiniMax env vars.")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="copilot-minimax",
        description="Patch VS Code Copilot Chat to use MiniMax API instead of Anthropic.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_patch = sub.add_parser("patch", help="Apply MiniMax patches to Copilot Chat")
    p_patch.add_argument(
        "--key", metavar="API_KEY",
        help="MiniMax API key (also configures Claude Code env vars in settings.json)",
    )

    sub.add_parser("restore", help="Restore original extension.js from backup")
    sub.add_parser("status", help="Show current patch status")

    args = parser.parse_args()

    if args.command == "patch":
        cmd_patch(args)
    elif args.command == "restore":
        cmd_restore(args)
    elif args.command == "status":
        cmd_status(args)


if __name__ == "__main__":
    main()
