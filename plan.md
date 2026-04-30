
---

## Complete Build Plan: copilot-minimax → "Hermes for Copilot"

### Architecture: Plugin-First, Editor-Agnostic

**Key Insight**: VS Code Copilot has 7 native customization layers (Agents, Skills, Instructions, Hooks, MCP Servers, Prompts, Plugins) that obsolete most of our extension tool approach. The new plan uses:

- **Agent Plugin** as the distribution format (bundles everything, installable from Git)
- **Custom Agent** (`.agent.md`) for the `@minimax` persona with Hermes-level personality
- **MCP Servers** for Gmail, AWS, Vercel, WhatsApp, Slack, Calendar (portable across editors)
- **Skills** for specialized workflows (memory management, environment detection)
- **Hooks** for lifecycle automation (memory injection, background review, onboarding)
- **Instructions** for always-on coding standards and personalization
- **VS Code Extension** only where VS Code APIs are required (memory storage, session DB, webview)

**Why this matters**: MCP servers are portable. They work in Copilot, Claude Code, Cursor, Windsurf, and any future editor. This is the architecture for a custom code editor.

### Current State: **Phase 1-8 COMPLETE** | **Agent + Hooks + Skills + Gmail + Calendar + AWS (5 servers) + GitHub + WhatsApp + Sessions MCP** | **14 custom + official AWS/GitHub MCP tools + 6 WhatsApp MCP tools + 3 Sessions MCP tools** | **83 tests passing** | **~72% toward Hermes parity**

---

### Phase 1: Memory System ✅ COMPLETE
**Goal**: Make Copilot remember things across sessions.

| Task | Status |
|------|--------|
| `~/.copilot-minimax/memory.json` with MEMORY + USER entries | ✅ |
| `memory_add` / `memory_remove` / `memory_replace` / `memory_list` tools | ✅ |
| Memory snapshot injected into every tool response | ✅ |
| Proactive nudges after 10+ turns without memory use | ✅ |
| Character limits: MEMORY 2,200 / USER 1,375 | ✅ |
| Duplicate prevention + injection scanning | ✅ |
| 43 tests passing | ✅ |
| VSIX deployed | ✅ |

**Deliverables**: `src/tools/memoryTools.ts`, `src/memory/memoryStore.ts`
**Architecture**: VS Code Extension (needs filesystem + VS Code API)

**After Phase 1: ~15% toward Hermes**

---

### Phase 2: Agent Plugin Scaffold ✅ COMPLETE
**Goal**: Create the plugin structure that bundles everything we build.

| Task | Status |
|------|--------|
| 2.1 Create `plugin.json` at repo root | ✅ |
| 2.2 Create `.github/agents/minimax.agent.md` | ✅ |
| 2.3 Agent YAML frontmatter: tools, model, handoffs | ✅ |
| 2.4 Agent prompt: Hermes-inspired personality | ✅ |
| 2.5 Create `.github/instructions/minimax-coding.instructions.md` | ✅ |
| 2.6 Create `.github/prompts/` (deploy, review, debug) | ✅ |
| 2.7 Register plugin locally via `chat.pluginLocations` | ⏳ |

**Key files**:
```
.github/
  agents/minimax.agent.md        # @minimax persona
  instructions/minimax-coding.instructions.md
  prompts/deploy.prompt.md
  prompts/review.prompt.md
  prompts/debug.prompt.md
plugin.json                      # Plugin manifest
```

**After Phase 2: ~20%**
> We have a real agent persona. `@minimax` is addressable in chat with personality, coding standards, and reusable prompts. No extension build needed — just files.

---

### Phase 3: Hooks — Lifecycle Automation ✅ COMPLETE
**Goal**: Automate memory injection, onboarding, and background review via hooks.

| Task | Status |
|------|--------|
| 3.1 `SessionStart` hook → memory snapshot + env detection | ✅ |
| 3.2 `UserPromptSubmit` hook → first-run onboarding | 🔜 Phase 8 |
| 3.3 `PostToolUse` hook → tool counter + memory nudges | ✅ |
| 3.4 `PreCompact` hook → save context before compression | 🔜 Phase 7 |
| 3.5 `Stop` hook → session logging + counter reset | ✅ |
| 3.6 `PreToolUse` hook → destructive op confirmation gate | ✅ |

**Key files**:
```
.github/hooks/
  session-start.json       # Memory injection + env detection
  user-prompt-submit.json  # First-run onboarding
  post-tool-use.json       # Auto-save memories
  pre-compact.json         # Save state before compression
  stop.json                # Background memory review
  pre-tool-use.json        # Destructive op confirmation
```

**Hermes parity targets**:
- `SessionStart` replaces Hermes' frozen snapshot injection
- `Stop` replaces Hermes' `_spawn_background_review()` daemon thread
- `PreToolUse` replaces Hermes' confirmation system
- `PostToolUse` replaces Hermes' memory nudge interval (every 10 turns)

**After Phase 3: ~30%**
> The agent now has a lifecycle. It wakes up with context, learns during use, confirms dangerous actions, and reviews itself before sleeping. This is the intelligence backbone.

---

### Phase 4: MCP Server — Gmail + Google Calendar ✅ COMPLETE
**Goal**: Replace extension Gmail tools with a portable MCP server. Add Calendar.

| Task | Status |
|------|--------|
| 4.1 Create `mcp-servers/google/` — TypeScript MCP server | ✅ |
| 4.2 Google OAuth2 token reuse from `~/.copilot-gmail/accounts/` | ✅ |
| 4.3 Gmail tools: connection_status, list_accounts, check_inbox, search, read, send, reply, labels | ✅ |
| 4.4 Calendar tools: list_calendars, list_events, create, update, delete, check_availability | ✅ |
| 4.5 Register in `.vscode/mcp.json` with input prompts for credentials | ✅ |
| 4.6 Build succeeds, MCP initialize+tools/list verified | ✅ |
| 4.7 Remove Gmail tools from VS Code extension `package.json` | ⏳ Phase 12 |

**Key files**:
```
mcp-servers/google/
  index.ts           # MCP server entry (stdio)
  gmail.ts           # Gmail tool implementations
  calendar.ts        # Calendar tool implementations
  auth.ts            # Google OAuth2 shared auth
  package.json
.vscode/mcp.json     # MCP server registration
```

**Why MCP over extension tools**:
- Works in any editor (Copilot, Claude Code, Cursor, future custom editor)
- Sandboxable (restrict filesystem + network access)
- Auto-approved in sandbox mode
- No VS Code API dependency

**After Phase 4: ~40%**
> Gmail + Calendar via MCP. Portable. "When's my next meeting? Reply to that email from Sarah and schedule a follow-up."

---

### Phase 5: MCP Server — AWS ✅ COMPLETE
**Goal**: Replace extension AWS tools with portable MCP server.

| Task | Status |
|------|--------|
| 5.1 Use official `mcp-proxy-for-aws` (managed, in preview) | ✅ |
| 5.2 Register in `.vscode/mcp.json` with AWS_PROFILE + AWS_REGION inputs | ✅ |
| 5.3 Zero code needed — official AWS MCP covers S3, Lambda, EC2, CloudWatch + all AWS services | ✅ |
| 5.4 Remove AWS tools from VS Code extension | ⏳ Phase 12 |

**Note**: AWS already has an official MCP server at `github.com/awslabs/mcp`. We can either:
- Use the official one directly (zero code needed, just add to `mcp.json`)
- Build our own with opinionated defaults for the minimax experience

**After Phase 5: ~48%**
> AWS + Gmail + Calendar all portable via MCP. Extension is now just memory + sessions.

---

### Phase 6: MCP Server — Vercel + GitHub ✅ COMPLETE
**Goal**: Replace remaining extension tools.

| Task | Status |
|------|--------|
| 6.1 Use official `@modelcontextprotocol/server-github` | ✅ |
| 6.2 Register in `.vscode/mcp.json` with GITHUB_PERSONAL_ACCESS_TOKEN input | ✅ |
| 6.3 Create `mcp-servers/vercel/` if no adequate MCP exists | 🔜 Phase 12 |
| 6.4 Remove GitHub tools from VS Code extension | ⏳ Phase 12 |

**After Phase 6: ~55%**
> ALL external service tools are now MCP servers. VS Code extension only does: memory, sessions, webview. Extension package.json drops from 40+ tools to ~7.

---

### Phase 7: Session Persistence + Search ✅ COMPLETE
**Goal**: Store every conversation, search past sessions.

| Task | Status |
|------|--------|
| 7.1 Create SQLite DB at `~/.copilot-minimax/sessions.db` with FTS5 | ✅ |
| 7.2 Auto-save via `logToolCall` (every tool invocation recorded) | ✅ |
| 7.3 `session_search` tool — FTS5 full-text search across all sessions | ✅ |
| 7.4 `session_list` tool — browse past sessions ordered by recency | ✅ |
| 7.5 `session_resume` tool — load full context + auto-set lineage | ✅ |
| 7.6 Session lineage tracking via `setParentSession()` | ✅ |
| 7.7 JSON → SQLite auto-migration on first run | ✅ |
| 7.8 `closeDb()` cleanup in extension deactivate | ✅ |
| 7.9 27 tests passing (FTS5 search, lineage, pruning, sanitization) | ✅ || 7.10 | Portable Sessions MCP server at `mcp-servers/sessions/` — any agent can search/list/resume | ✅ |
**Key files**:
```
extension/src/session/sessionStore.ts     # SQLite + FTS5 store (better-sqlite3)
extension/src/session/sessionStore.test.ts # 27 tests
extension/src/tools/sessionTools.ts        # session_search, session_list, session_resume
```

**Architecture**: VS Code Extension (`better-sqlite3` native module, WAL journal mode)

**After Phase 7: ~62%**
> Searchable conversation history with FTS5 ranking. "Did we discuss the deployment pipeline last week?" works. Session lineage tracks context across compressions.

---

### Phase 8: Skills — Self-Improving Knowledge ✅ COMPLETE
**Goal**: Agent creates reusable knowledge documents using Copilot's native skill format.

| Task | Description | Status |
|------|-------------|--------|
| 8.1 | Skills stored as native SKILL.md in `.github/skills/` | ✅ |
| 8.2 | YAML frontmatter with name, description, argument-hint | ✅ |
| 8.3 | `PostToolUse` hook detects 5+ tool chains → suggests skill creation | ✅ |
| 8.4 | Skill creation prompt at `.github/prompts/create-skill.prompt.md` | ✅ |
| 8.5 | 4 bundled skills: memory-management, session-continuity, service-orchestration, skill-creation | ✅ |
| 8.6 | Agent prompt updated with skills awareness | ✅ |

**Key insight**: We don't need custom skill tools. Copilot's native skill system already does:
- Progressive loading (Level 0: name/desc, Level 1: SKILL.md, Level 2: resources)
- Automatic discovery from `~/.copilot/skills/` and `.github/skills/`
- Works across VS Code, Copilot CLI, and cloud agent

We just need the **hook** that detects when to suggest skill creation, and the **agent prompt** that knows how to create well-structured SKILL.md files.

**After Phase 8: ~72%**
> Self-improving agent. Skills + memory = the learning loop. Agent creates SKILL.md files that Copilot natively loads. No custom infrastructure needed.

---

### Phase 9: MCP Servers — Slack + WhatsApp ✅ PARTIAL (WhatsApp done)
**Goal**: Messaging platforms via portable MCP servers.

| Task | Description | Status |
|------|-------------|--------|
| 9.1 | Create `mcp-servers/slack/` — Slack Bot Token based | 🔜 |
| 9.2 | Slack tools: `list_channels`, `read_messages`, `send_message`, `search_messages`, `list_users` | 🔜 |
| 9.3 | Create `mcp-servers/whatsapp/` — Baileys-based, 6 tools, QR auth, in-memory message buffer | ✅ |
| 9.4 | WhatsApp tools: status, connect, send_message, read_messages, list_chats, search_messages | ✅ |
| 9.7 | Fix Baileys 405: version override `[2, 3000, 1034074495]`, recursive logger mock, ASCII QR | ✅ |
| 9.5 | Sessions MCP server also created for portability | ✅ |
| 9.6 | AWS expanded to 5 servers: managed remote + admin + IAM + CloudWatch + CloudFormation | ✅ |

**Existing MCP servers found**:
- **WhatsApp Business** (official, by Wassenger): send messages, manage conversations, templates
- **WhatsApp MCP** (community, by lharries): personal WhatsApp, individuals, groups, search
- **Slack** (community, by korotovsky): most powerful Slack MCP, stdio + SSE, no bot approval needed
- **Slack** (community, by zencoderai): stdio + Streamable HTTP

**After Phase 9: ~80%**
> Gmail + Slack + WhatsApp + Calendar. Three messaging platforms + scheduling. All portable via MCP.

---

### Phase 10: Web Search + Audit + Dashboard
**Goal**: Internet access, observability, and trust.

| Task | Description |
|------|-------------|
| 10.1 | Add web search MCP (Tavily, Exa, or DuckDuckGo community server) |
| 10.2 | Audit log in `sessions.db` — every tool call tracked |
| 10.3 | `audit_search` + `audit_summary` tools |
| 10.4 | VS Code webview dashboard showing recent activity |
| 10.5 | `SessionStart` hook enrichment: show daily summary of pending items |

**After Phase 10: ~88%**
> Full observability. User sees everything the agent did. Web search for research. Trust through transparency.

---

### Phase 11: Cron / Scheduled Tasks
**Goal**: Automated recurring tasks.

| Task | Description |
|------|-------------|
| 11.1 | Cron store at `~/.copilot-minimax/cron/jobs.json` |
| 11.2 | `cron_create`, `cron_list`, `cron_update`, `cron_delete`, `cron_pause`, `cron_resume` |
| 11.3 | Background timer via VS Code extension activation |
| 11.4 | Deliver results via Slack/Gmail/VS Code notification (using MCP servers) |

**Architecture**: VS Code Extension (needs background timer + workspace activation)

**After Phase 11: ~92%**

---

### Phase 12: Polish + Publish
**Goal**: Production readiness and distribution.

| Task | Description |
|------|-------------|
| 12.1 | Rate limiting on all MCP server tools (per-minute quotas) |
| 12.2 | Exponential backoff retry logic in MCP servers |
| 12.3 | Plugin marketplace listing (Git repo, `plugin.json`, README) |
| 12.4 | VS Code Marketplace publishing (extension component only) |
| 12.5 | README with feature comparison vs Hermes |
| 12.6 | Extension icon + branding |
| 12.7 | Test suite expansion (memory, sessions, hooks, MCP servers) |
| 12.8 | Settings migration system for version upgrades |

**After Phase 12: ~95%**
> Production-grade. Installable as a Copilot plugin (agents + skills + hooks + MCP servers) OR as a VS Code extension (for memory/session features). Published everywhere.

---

### Architecture Summary

```
copilot-minimax/
├── plugin.json                           # Plugin manifest (bundles everything)
├── .github/
│   ├── agents/minimax.agent.md           # @minimax persona
│   ├── instructions/                     # Always-on coding standards
│   ├── prompts/                          # Reusable task templates
│   ├── hooks/                            # 6 lifecycle hooks
│   └── skills/                           # Bundled skill files
├── mcp-servers/
│   ├── google/                           # Gmail + Calendar MCP (portable)
│   ├── aws/                              # AWS MCP (or use official)
│   ├── vercel/                           # Vercel MCP
│   ├── slack/                            # Slack MCP (or use community)
│   └── whatsapp/                         # WhatsApp MCP (or use community)
├── extension/                            # VS Code extension (memory + sessions + cron + webview)
│   ├── src/memory/                       # ✅ Built
│   ├── src/session/                      # Phase 7
│   ├── src/cron/                         # Phase 11
│   └── src/webview/                      # Phase 10
└── .vscode/mcp.json                      # MCP server registration
```

### What stays as VS Code Extension vs what becomes MCP

| Component | Architecture | Why |
|-----------|-------------|-----|
| Memory (add/remove/replace/list) | **VS Code Extension** | Needs filesystem + secret storage + VS Code API for snapshot injection |
| Sessions (search/list/resume) | **VS Code Extension** | Needs `better-sqlite3` native module + filesystem |
| Cron scheduler | **VS Code Extension** | Needs background timer + workspace activation events |
| Webview dashboard | **VS Code Extension** | Needs VS Code webview API |
| Gmail + Calendar | **MCP Server** | Portable — works in any editor |
| AWS (S3/Lambda/EC2/CloudWatch) | **MCP Server** | Portable — official AWS MCP exists |
| Vercel | **MCP Server** | Portable |
| GitHub | **MCP Server** | Portable — official GitHub MCP exists |
| Slack | **MCP Server** | Portable — community MCP exists |
| WhatsApp | **MCP Server** | Portable — community MCP exists |
| Web Search | **MCP Server** | Portable — Tavily/Exa MCP exists |
| Agent persona | **Custom Agent** (.agent.md) | Native Copilot — just a file |
| Coding standards | **Instructions** (.instructions.md) | Native Copilot — just a file |
| Task templates | **Prompts** (.prompt.md) | Native Copilot — just files |
| Skills | **Native Skills** (SKILL.md) | Copilot already has progressive loading |
| Lifecycle hooks | **Hooks** (.json) | Native Copilot — 8 lifecycle events |
| Distribution | **Plugin** (plugin.json) | Installable from Git URL |

### Existing MCP Servers We Can Use (Zero Code)

| Service | MCP Server | Status |
|---------|-----------|--------|
| GitHub | `github/github-mcp-server` (official) | Add to `mcp.json` |
| AWS | `awslabs/mcp` (official) | Add to `mcp.json` |
| Slack | `korotovsky/slack-mcp-server` (community) | Add to `mcp.json` |
| WhatsApp Business | Wassenger WhatsApp MCP (official integration) | Add to `mcp.json` |
| WhatsApp Personal | `lharries/whatsapp-mcp` (community) | Add to `mcp.json` |
| Web Search (Tavily) | `tavily-ai/tavily-mcp` (official) | Add to `mcp.json` |
| Web Search (Exa) | `exa-labs/exa-mcp-server` (official) | Add to `mcp.json` |
| Notion | `makenotion/notion-mcp-server` (official) | Add to `mcp.json` |
| Playwright (browser) | `microsoft/playwright-mcp` (official) | Add to `mcp.json` |
| Linear | `jerhadf/linear-mcp-server` (community) | Add to `mcp.json` |
| Discord | `v-3/discordmcp` (community) | Add to `mcp.json` |
| Google Workspace | `taylorwilsdon/google_workspace_mcp` (community) | Evaluate vs custom |

**Key realization**: For ~6 services, we write ZERO code. Just add them to `mcp.json` and the plugin bundles them. Our value-add is the **intelligence layer** (memory, skills, hooks, persona) — not the API wrappers.

### Summary Scorecard

| Phase | Key Deliverable | Architecture | % Toward Hermes |
|-------|----------------|-------------|-----------------|
| **1. Memory** ✅ | Memory tools (4) | VS Code Extension | **15%** |
| **2. Plugin Scaffold** | Agent persona + instructions + prompts | Files only | **20%** |
| **3. Hooks** | 6 lifecycle hooks | Files only | **30%** |
| **4. Gmail + Calendar** | Google MCP server | MCP Server | **40%** |
| **5. AWS** | AWS MCP (official or custom) | MCP Server | **48%** |
| **6. Vercel + GitHub** | MCP servers (official GitHub) | MCP Server | **55%** |
| **7. Sessions** | Session DB + search | VS Code Extension | **62%** |
| **8. Skills** | Native SKILL.md + hooks | Files + Extension | **72%** |
| **9. Slack + WhatsApp** | Messaging MCP servers | MCP Server | **80%** |
| **10. Web + Audit** | Web search + dashboard | MCP + Extension | **88%** |
| **11. Cron** | Scheduled tasks | VS Code Extension | **92%** |
| **12. Polish** | Production + publish | All | **95%** |

### Custom Editor Roadmap

This architecture is designed to be reused in a custom code editor:

1. **MCP servers** work in any editor that supports MCP (all of them)
2. **Agent/Skill/Hook/Instruction files** follow open standards (`.agent.md`, `SKILL.md`, agentskills.io)
3. **The VS Code extension parts** (memory, sessions, cron) would need to be reimplemented as:
   - A local Node.js/Python service (runs as background process)
   - Or an MCP server itself (sessions and memory exposed via MCP tools)
   - Or native modules in the custom editor

The split is clean: **intelligence layer** (files) + **service integrations** (MCP) + **editor-specific** (extension). When building the custom editor, only the third bucket needs reimplementation.