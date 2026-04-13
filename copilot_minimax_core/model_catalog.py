"""Builds JS snippets for model metadata injection."""

from __future__ import annotations

from .constants import MINIMAX_MODELS


def models_js() -> str:
    """Build the JS object literal for the hardcoded model catalogue."""
    entries = []
    for model_id, meta in MINIMAX_MODELS.items():
        bools = ",".join(
            f"{k}:{'!0' if v else '!1'}" if isinstance(v, bool) else f"{k}:{v}"
            for k, v in meta.items()
            if k != "name"
        )
        entries.append(f'"{model_id}":{{name:"{meta["name"]}",{bools}}}')
    return "{" + ",".join(entries) + "}"


def new_get_all_models_function() -> str:
    """Return replacement JS for provider model listing."""
    return (
        "async getAllModels(n,r){if(!r&&n)return[];try{"
        f"let a=Object.assign({models_js()},this._knownModels||{{}});"
        "return m9(this._name,a)}"
    )
