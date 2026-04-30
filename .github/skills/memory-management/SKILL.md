---
name: memory-management
description: "Best practices for using the agent memory system effectively. Use when deciding what to remember, when to update stale memories, and how to structure memory entries for maximum recall."
---

# Memory Management

## When to Save

Save to memory when you discover:
- **User preferences** — coding style, naming conventions, preferred tools, timezone, workflow habits
- **Project conventions** — build commands, test frameworks, deployment targets, branch strategy
- **Decisions made** — architecture choices, trade-offs discussed, features rejected and why
- **Solutions found** — non-obvious fixes, workarounds, configuration that solved a problem
- **Contact info** — names, roles, email addresses mentioned in conversation

## When NOT to Save

Do not save:
- Temporary context (file being edited right now, current error being debugged)
- Information already in the codebase (README, config files, comments)
- Speculative or uncertain information — wait until confirmed
- Secrets, passwords, tokens, API keys — NEVER save sensitive data

## Memory Entry Format

Keep entries atomic and searchable:

**Good:** `User prefers Bun over Node.js for new projects`
**Bad:** `We discussed various runtime options and the user seemed to lean toward Bun but also mentioned Node.js might be needed for some things`

**Good:** `copilot-minimax: run tests with "npm test" from extension/ directory`
**Bad:** `Testing works`

## Memory Hygiene

- After 10+ tool calls without memory activity, ask yourself: "Did I learn anything worth remembering?"
- When a memory becomes outdated, use `memory_replace` — don't add a contradicting entry
- Use `memory_remove` when information is no longer relevant
- Check existing memories before adding — avoid duplicates

## Memory Categories

Structure entries with implicit categories:

- **MEMORY** — facts about the project, codebase, and workflow
- **USER** — facts about the user's identity, preferences, and habits

Prefix entries with project name when multiple projects are active:
`copilot-minimax: uses vitest for testing`
`brilion: React Native + Expo project`
