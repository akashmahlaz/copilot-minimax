"""Utilities to inspect minified extension.js content for patch anchors."""

from __future__ import annotations


def _trim_snippet(text: str, max_len: int = 220) -> str:
    compact = " ".join(text.split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3] + "..."


def find_keyword_contexts(
    content: str,
    keyword: str,
    *,
    context_chars: int = 90,
    limit: int = 5,
) -> list[str]:
    """Return compact snippets around keyword occurrences."""
    snippets: list[str] = []
    if not keyword:
        return snippets

    start = 0
    while len(snippets) < limit:
        idx = content.find(keyword, start)
        if idx == -1:
            break

        left = max(0, idx - context_chars)
        right = min(len(content), idx + len(keyword) + context_chars)
        snippet = content[left:right]
        snippets.append(_trim_snippet(snippet))
        start = idx + len(keyword)

    return snippets
