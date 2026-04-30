---
description: "Review code changes for bugs, security issues, and logic errors. High signal-to-noise — only flags real problems."
agent: "minimax"
tools: ["read", "search", "execute"]
---

Review the current code changes (staged, unstaged, or branch diff):

1. Identify the scope of changes using `git diff` or `git diff --staged`
2. Read surrounding context to understand intent
3. Flag ONLY genuine issues:
   - Bugs and logic errors
   - Security vulnerabilities
   - Race conditions
   - Missing error handling that causes crashes
   - Breaking changes to public APIs

Do NOT comment on: style, naming, formatting, minor refactors, or "consider doing X" suggestions.

For each issue found, show: file, line, severity (critical/warning), and a fix.
If the code looks good, say "No issues found" — don't manufacture feedback.
