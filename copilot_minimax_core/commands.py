"""Command handlers for patch/status/restore operations."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from .custom_patches import apply_custom_patch_file, scan_custom_patch_file
from .inspector import find_keyword_contexts
from .patching import is_patched, patch_content
from .paths import backup_path, extension_js_path, extensions_dir, find_copilot_chat_dir
from .settings_ops import configure_settings


def cmd_status() -> None:
    copilot_dir = find_copilot_chat_dir()
    if not copilot_dir:
        print("Copilot Chat extension not found.")
        return

    ext_js = extension_js_path(copilot_dir)
    bak = backup_path(ext_js)
    content = ext_js.read_text(encoding="utf-8")

    print(f"Extension : {copilot_dir.name}")
    print(f"File      : {ext_js}")
    print(f"Size      : {ext_js.stat().st_size:,} bytes")
    print(f"Backup    : {'yes' if bak.exists() else 'no'}")

    if is_patched(content):
        n_minimax = content.count("api.minimax.io/anthropic")
        n_models = content.count("MiniMax-M2.7")
        if n_models:
            print(f"Status    : PATCHED (minimax refs: {n_minimax}, model refs: {n_models})")
        else:
            print(f"Status    : PATCHED (minimax refs: {n_minimax}, model patch not applicable in this build)")
    elif "https://api.anthropic.com" in content:
        print("Status    : UNPATCHED (original Anthropic URLs)")
    else:
        print("Status    : UNKNOWN (neither Anthropic nor MiniMax URLs found)")


def cmd_patch(api_key: str | None, patch_file_arg: str | None) -> None:
    copilot_dir = find_copilot_chat_dir()
    if not copilot_dir:
        print("Copilot Chat extension not found under", extensions_dir())
        sys.exit(1)

    ext_js = extension_js_path(copilot_dir)
    if not ext_js.exists():
        print("extension.js not found at", ext_js)
        sys.exit(1)

    print(f"Extension: {copilot_dir.name}")
    content = ext_js.read_text(encoding="utf-8")

    if is_patched(content):
        print("Already patched. Run restore first if you want to re-patch.")
        return

    bak = backup_path(ext_js)
    if not bak.exists():
        shutil.copy2(ext_js, bak)
        print(f"Backup saved: {bak.name}")
    else:
        print(f"Backup already exists: {bak.name}")

    patched, changes = patch_content(content)

    if patch_file_arg:
        patch_file = Path(patch_file_arg).expanduser().resolve()
        if not patch_file.exists():
            print(f"Custom patch file not found: {patch_file}")
            sys.exit(1)
        try:
            patched, custom_changes = apply_custom_patch_file(patched, patch_file)
            changes.extend(custom_changes)
        except Exception as exc:  # pragma: no cover - defensive CLI path
            print(f"Failed to apply custom patch file: {exc}")
            sys.exit(1)

    if not changes:
        print("No patchable patterns found. Extension version may have changed.")
        sys.exit(1)

    ext_js.write_text(patched, encoding="utf-8")

    print(f"Patched successfully ({len(changes)} changes):")
    for change in changes:
        print(f" - {change}")

    if api_key:
        configure_settings(api_key)

    print("Restart VS Code to apply changes.")


def cmd_validate(patch_file_arg: str | None) -> None:
    """Dry-run validation of built-in and custom patch applicability."""
    copilot_dir = find_copilot_chat_dir()
    if not copilot_dir:
        print("Copilot Chat extension not found under", extensions_dir())
        sys.exit(1)

    ext_js = extension_js_path(copilot_dir)
    if not ext_js.exists():
        print("extension.js not found at", ext_js)
        sys.exit(1)

    content = ext_js.read_text(encoding="utf-8")
    _, builtin_changes = patch_content(content)

    print(f"Validation target: {copilot_dir.name}")
    if builtin_changes:
        print(f"Built-in patches: {len(builtin_changes)} applicable")
    else:
        print("Built-in patches: none applicable (may already be patched or format changed)")

    errors: list[str] = []

    if patch_file_arg:
        patch_file = Path(patch_file_arg).expanduser().resolve()
        if not patch_file.exists():
            print(f"Custom patch file not found: {patch_file}")
            sys.exit(1)

        try:
            reports, report_errors = scan_custom_patch_file(content, patch_file)
            print(f"Custom patch rules: {len(reports)}")
            for report in reports:
                print(
                    " - "
                    f"{report['label']}: matches={report['raw_matches']}, "
                    f"replacements={report['replacements']}"
                )
            errors.extend(report_errors)
        except Exception as exc:  # pragma: no cover - defensive CLI path
            print(f"Failed to validate custom patch file: {exc}")
            sys.exit(1)

    if errors:
        print("Validation failed:")
        for err in errors:
            print(f" - {err}")
        sys.exit(1)

    print("Validation passed.")


def cmd_report(patch_file_arg: str | None) -> None:
    """Print current patch marker visibility and optional custom rule hit counts."""
    copilot_dir = find_copilot_chat_dir()
    if not copilot_dir:
        print("Copilot Chat extension not found under", extensions_dir())
        sys.exit(1)

    ext_js = extension_js_path(copilot_dir)
    if not ext_js.exists():
        print("extension.js not found at", ext_js)
        sys.exit(1)

    content = ext_js.read_text(encoding="utf-8")
    print(f"Report target: {copilot_dir.name}")
    print(f"MiniMax URL refs: {content.count('api.minimax.io/anthropic')}")
    print(f"Anthropic URL refs: {content.count('https://api.anthropic.com')}")
    print(f"MiniMax model refs: {content.count('MiniMax-M2.7')}")

    if patch_file_arg:
        patch_file = Path(patch_file_arg).expanduser().resolve()
        if not patch_file.exists():
            print(f"Custom patch file not found: {patch_file}")
            sys.exit(1)

        reports, errors = scan_custom_patch_file(content, patch_file)
        print(f"Custom patch rules: {len(reports)}")
        for report in reports:
            print(
                " - "
                f"{report['label']}: matches={report['raw_matches']}, "
                f"replacements={report['replacements']}"
            )
        if errors:
            print("Custom patch validation warnings:")
            for err in errors:
                print(f" - {err}")


def cmd_inspect(keywords: list[str], limit: int, context_chars: int) -> None:
    """Inspect extension.js for keyword anchor candidates."""
    copilot_dir = find_copilot_chat_dir()
    if not copilot_dir:
        print("Copilot Chat extension not found under", extensions_dir())
        sys.exit(1)

    ext_js = extension_js_path(copilot_dir)
    if not ext_js.exists():
        print("extension.js not found at", ext_js)
        sys.exit(1)

    content = ext_js.read_text(encoding="utf-8")
    print(f"Inspect target: {copilot_dir.name}")
    print(f"File size: {len(content):,} chars")

    for keyword in keywords:
        snippets = find_keyword_contexts(
            content,
            keyword,
            context_chars=context_chars,
            limit=limit,
        )
        print(f"\nKeyword: {keyword}")
        print(f"Occurrences shown: {len(snippets)} (limit={limit})")
        if not snippets:
            continue
        for i, snippet in enumerate(snippets, start=1):
            print(f"  {i}. {snippet}")


def cmd_restore() -> None:
    copilot_dir = find_copilot_chat_dir()
    if not copilot_dir:
        print("Copilot Chat extension not found.")
        sys.exit(1)

    ext_js = extension_js_path(copilot_dir)
    bak = backup_path(ext_js)

    if not bak.exists():
        print("No backup found. Nothing to restore.")
        sys.exit(1)

    shutil.copy2(bak, ext_js)
    print(f"Restored from backup: {bak.name}")
    print("Restart VS Code to apply.")
