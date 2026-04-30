---
description: "Debug a failing test, build error, or runtime issue. Diagnoses root cause and applies a fix."
agent: "minimax"
tools: ["read", "search", "edit", "execute"]
---

Debug the current issue:

1. Reproduce the error — run the failing command/test
2. Read the error output carefully
3. Search the codebase for the relevant code
4. Identify the root cause (not just symptoms)
5. Apply the minimal fix
6. Re-run to verify the fix works
7. Check for related issues that might have the same root cause

If the fix involves multiple files, explain the connection between changes.
If you're unsure of the root cause, state your hypothesis and what evidence supports it.
