---
description: "Use when writing or reviewing any code in this workspace. Covers TypeScript/Node.js conventions, error handling patterns, testing standards, and project structure rules for copilot-minimax."
applyTo: ["**/*.ts", "**/*.js", "**/*.json"]
---

# Copilot Minimax Coding Standards

## TypeScript Conventions
- Use `const` by default, `let` only when reassignment is needed
- Prefer `interface` over `type` for object shapes
- Use explicit return types on exported functions
- No `any` — use `unknown` and narrow with type guards
- Use barrel exports (`index.ts`) only at package boundaries

## Error Handling
- Validate at system boundaries (user input, API responses, file I/O)
- Use early returns for guard clauses
- Don't add try/catch for errors that can't happen
- Propagate errors up — don't swallow them silently
- Include context in error messages: what failed and with what input

## Testing
- Tests live next to source: `foo.ts` → `foo.test.ts`
- Use descriptive test names: `"rejects duplicate memory entries"`
- Test behavior, not implementation details
- Mock at boundaries (filesystem, network), not internal modules

## Project Structure
- MCP servers go in `mcp-servers/<service>/`
- VS Code extension source in `extension/src/`
- Hook scripts in `.github/hooks/scripts/`
- One concern per file — don't mix unrelated logic

## Dependencies
- Prefer zero-dependency solutions where complexity is low
- Pin exact versions in `package.json`
- Document why each dependency was chosen in commit message
