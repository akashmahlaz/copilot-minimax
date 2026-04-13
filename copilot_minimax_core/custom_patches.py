"""User-supplied patch pack support."""

from __future__ import annotations

import json
import re
from pathlib import Path


def _build_regex_flags(flags_str: str) -> int:
    flags = 0
    if "i" in flags_str:
        flags |= re.IGNORECASE
    if "m" in flags_str:
        flags |= re.MULTILINE
    if "s" in flags_str:
        flags |= re.DOTALL
    return flags


def _parse_replacements(patch_file: Path) -> list[dict]:
    raw = patch_file.read_text(encoding="utf-8")
    data = json.loads(raw)

    replacements = data.get("replacements")
    if not isinstance(replacements, list):
        raise ValueError("Custom patch file must contain a 'replacements' list")
    return replacements


def scan_custom_patch_file(content: str, patch_file: Path) -> tuple[list[dict], list[str]]:
    """Scan a patch file against content and return per-rule stats and errors.

    Supported optional validation fields in each replacement item:
    - required: bool (must match at least once)
    - minMatches: int (minimum replacement count)
    - maxMatches: int (maximum replacement count)
    """
    replacements = _parse_replacements(patch_file)
    reports: list[dict] = []
    errors: list[str] = []

    for idx, item in enumerate(replacements, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Replacement #{idx} must be an object")

        label = item.get("name") or f"replacement #{idx}"
        find = item.get("find")
        replace = item.get("replace", "")
        count = int(item.get("count", 0))
        use_regex = bool(item.get("regex", False))
        flags_str = str(item.get("flags", ""))
        required = bool(item.get("required", False))
        min_matches = int(item.get("minMatches", 0))
        max_matches_raw = item.get("maxMatches")
        max_matches = int(max_matches_raw) if max_matches_raw is not None else None

        if not isinstance(find, str) or not find:
            raise ValueError(f"{label}: 'find' must be a non-empty string")
        if not isinstance(replace, str):
            raise ValueError(f"{label}: 'replace' must be a string")
        if count < 0:
            raise ValueError(f"{label}: 'count' must be >= 0")
        if min_matches < 0:
            raise ValueError(f"{label}: 'minMatches' must be >= 0")
        if max_matches is not None and max_matches < 0:
            raise ValueError(f"{label}: 'maxMatches' must be >= 0")

        if use_regex:
            pattern = re.compile(find, flags=_build_regex_flags(flags_str))
            raw_matches = len(list(pattern.finditer(content)))
        else:
            raw_matches = content.count(find)

        effective_replacements = raw_matches if count == 0 else min(raw_matches, count)

        if required and effective_replacements == 0:
            errors.append(f"{label}: required replacement did not match")
        if effective_replacements < min_matches:
            errors.append(
                f"{label}: matches {effective_replacements} is below minMatches={min_matches}"
            )
        if max_matches is not None and effective_replacements > max_matches:
            errors.append(
                f"{label}: matches {effective_replacements} is above maxMatches={max_matches}"
            )

        reports.append(
            {
                "label": label,
                "regex": use_regex,
                "raw_matches": raw_matches,
                "replacements": effective_replacements,
                "count_limit": count,
            }
        )

    return reports, errors


def apply_custom_patch_file(content: str, patch_file: Path) -> tuple[str, list[str]]:
    """Apply additional string/regex replacements from a JSON patch file."""
    replacements = _parse_replacements(patch_file)

    changes: list[str] = []

    for idx, item in enumerate(replacements, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Replacement #{idx} must be an object")

        label = item.get("name") or f"replacement #{idx}"
        find = item.get("find")
        replace = item.get("replace", "")
        count = int(item.get("count", 0))
        use_regex = bool(item.get("regex", False))
        flags_str = str(item.get("flags", ""))

        if not isinstance(find, str) or not find:
            raise ValueError(f"{label}: 'find' must be a non-empty string")
        if not isinstance(replace, str):
            raise ValueError(f"{label}: 'replace' must be a string")
        if count < 0:
            raise ValueError(f"{label}: 'count' must be >= 0")

        if use_regex:
            pattern = re.compile(find, flags=_build_regex_flags(flags_str))
            content, n = pattern.subn(replace, content, count=count)
        else:
            if count == 0:
                n = content.count(find)
                content = content.replace(find, replace)
            else:
                n = content.count(find) if count > content.count(find) else count
                content = content.replace(find, replace, count)

        if n > 0:
            changes.append(f"Applied custom {label} ({n} replacement(s))")

    return content, changes
