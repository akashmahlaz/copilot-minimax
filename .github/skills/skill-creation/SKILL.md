---
name: skill-creation
description: "Meta-skill for creating new SKILL.md files. Use when the agent detects a reusable workflow pattern (5+ tool chains), when the user asks to 'save this as a skill', or when automating a recurring task."
argumentHint: "Describe the workflow or pattern to capture as a skill"
---

# Skill Creation

## When to Create a Skill

Create a new skill when:
- You've performed the **same 5+ tool sequence** more than once
- A workflow involves **specific domain knowledge** that would be lost between sessions
- The user says: "save this as a skill", "remember how to do this", "automate this"
- A **complex multi-step process** has been refined through trial and error

Do NOT create a skill for:
- One-time tasks
- Simple operations (single tool call)
- Information that belongs in memory (use memory_add instead)

## Skill File Structure

Skills are SKILL.md files with YAML frontmatter:

```markdown
---
name: my-skill-name
description: "When to use this skill. Be specific about trigger conditions."
argumentHint: "Optional: what input the skill expects"
---

# Skill Title

## Overview
One paragraph explaining what this skill does.

## When to Use
Bullet list of trigger conditions.

## Steps
The actual workflow with specific tool calls, commands, and decision points.

## Common Pitfalls
What can go wrong and how to handle it.
```

## Frontmatter Rules

- **name**: kebab-case, descriptive, starts with domain prefix if specific
- **description**: Must explain WHEN to use the skill, not just what it does
- **argumentHint**: Optional. Shows what input to provide when invoking

## Quality Checklist

Before saving a skill:

- [ ] Description explains **when** to use it (trigger conditions)
- [ ] Steps are concrete — specific tool names, not vague instructions
- [ ] Handles failures — what to do when a step fails
- [ ] No secrets or hardcoded values — use environment variables
- [ ] Tested — the workflow has been executed successfully at least once

## Where Skills Live

| Location | Scope |
|----------|-------|
| `.github/skills/<name>/SKILL.md` | Repository — shared with all users of this repo |
| `~/.copilot/skills/<name>/SKILL.md` | User — personal skills across all projects |

For copilot-minimax skills, use `.github/skills/` (repo scope).
For user-specific workflows, use `~/.copilot/skills/` (user scope).

## Skill Review

After creating a skill, review it:

1. Read the SKILL.md back — does it make sense to a fresh agent with no context?
2. Are the steps executable without additional information?
3. Would a different agent know WHEN to apply this skill based on the description?
4. Is it too broad (should be split) or too narrow (should be generalized)?
