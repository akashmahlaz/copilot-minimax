"""Built-in extension.js patch logic."""

from __future__ import annotations

from .constants import ANTHROPIC_URL, MINIMAX_MODELS, MINIMAX_URL, OLD_GET_ALL_MODELS_PREFIX
from .model_catalog import new_get_all_models_function


def patch_content(content: str) -> tuple[str, list[str]]:
    """Apply all built-in patches and return (patched_content, changes)."""
    changes: list[str] = []

    if ANTHROPIC_URL in content:
        content = content.replace(ANTHROPIC_URL, MINIMAX_URL)
        changes.append(f"Redirected {ANTHROPIC_URL} -> {MINIMAX_URL}")

    bare_old = '"api.anthropic.com"'
    bare_new = '"api.minimax.io/anthropic"'
    if bare_old in content:
        content = content.replace(bare_old, bare_new)
        changes.append("Fixed bare hostname in telemetry attributes")

    if OLD_GET_ALL_MODELS_PREFIX in content:
        content = content.replace(
            OLD_GET_ALL_MODELS_PREFIX,
            new_get_all_models_function(),
            1,
        )
        changes.append(
            "Replaced model listing with hardcoded: " + ", ".join(MINIMAX_MODELS.keys())
        )

    return content, changes


def is_patched(content: str) -> bool:
    """Check if extension.js already contains key MiniMax patch markers."""
    return MINIMAX_URL in content and "MiniMax-M2.7" in content
