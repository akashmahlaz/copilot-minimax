---
name: session-continuity
description: "How to search past conversations and resume context. Use when the user references a previous discussion, asks 'did we talk about X', or wants to continue from where they left off."
---

# Session Continuity

## Finding Past Context

When a user references a previous conversation:

1. **Search first** — Use `session_search` with keywords from the user's question
   - Try the key nouns: "deployment pipeline", "WhatsApp bug", "database migration"
   - If no results, broaden: try just "deploy" or "WhatsApp"
   - Search matches tool names, inputs, AND outputs

2. **Browse if search fails** — Use `session_list` to show recent sessions
   - Sessions are ordered by recency
   - Preview text helps identify the right session
   - Lineage (parent_id) shows continued conversations

3. **Load full context** — Use `session_resume` with the session ID
   - Returns every tool call with inputs and outputs
   - Automatically sets lineage (current session becomes child of resumed session)
   - Read through the entries to reconstruct what happened

## Resuming Work

After loading a past session:

1. Summarize what was accomplished: "Last time we set up the CI pipeline and fixed the test runner"
2. Identify what was left unfinished: "We hadn't yet configured the deployment step"
3. Ask if they want to continue from there or start fresh
4. If continuing, pick up where the session ended

## Session Lineage

Sessions form a chain when resumed:
```
Session A (original)
  └── Session B (resumed A, continued work)
        └── Session C (resumed B, finished the feature)
```

This lineage is tracked automatically — no action needed. It helps trace the history of long-running tasks across multiple conversations.

## Proactive Context

At the start of complex tasks, check if relevant sessions exist:
- Before a big refactor: "Have we discussed this codebase structure before?"
- Before debugging: "Was this error encountered previously?"
- This prevents re-discovering solutions that were already found
