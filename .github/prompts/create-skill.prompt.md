---
description: "Create a new SKILL.md file from a workflow pattern. Captures a reusable multi-tool workflow as a Copilot skill."
mode: "agent"
---

# Create Skill

Analyze the recent tool chain and create a well-structured SKILL.md file.

## Instructions

1. Review the recent tool calls from this session (use `session_list` and `session_resume` if needed)
2. Identify the core workflow pattern — what tools were used, in what order, and why
3. Generalize the pattern — replace specific values with descriptions of what goes there
4. Ask the user for a skill name and where to save it:
   - `.github/skills/<name>/SKILL.md` for repo-scoped skills
   - `~/.copilot/skills/<name>/SKILL.md` for personal skills
5. Create the SKILL.md file with proper YAML frontmatter

## Quality Requirements

- The `description` field must explain **when** to use the skill (trigger conditions)
- Steps must reference specific tool names, not vague instructions
- Include a "Common Pitfalls" section
- Include a "When NOT to Use" section
- No hardcoded secrets or user-specific values

## Template

```markdown
---
name: {{skill-name}}
description: "{{when to use this skill — be specific about trigger conditions}}"
argumentHint: "{{optional — what input to provide}}"
---

# {{Skill Title}}

## Overview
{{One paragraph explaining the workflow.}}

## When to Use
{{Bullet list of trigger conditions.}}

## Steps
{{Numbered steps with specific tool calls and decision points.}}

## Common Pitfalls
{{What can go wrong and how to handle it.}}
```
