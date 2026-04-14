
---

## Complete Build Plan: copilot-minimax → "Hermes for Copilot"

### Current State: **26 tools** (11 Gmail + 10 AWS + 5 Vercel) | **~2,033 lines** | **0% toward Hermes parity**

---

### Phase 1: Memory System
**Goal**: Make Copilot remember things across sessions — the single biggest gap.

| Task | Description | New Tools |
|------|-------------|-----------|
| 1.1 | Create `~/.copilot-minimax/memory.json` with `MEMORY` entries (agent notes) and `USER` entries (user profile) | — |
| 1.2 | Build `memory_add` tool — agent saves facts, preferences, corrections | `memory_add` |
| 1.3 | Build `memory_remove` tool — substring match delete (Hermes pattern) | `memory_remove` |
| 1.4 | Build `memory_replace` tool — update existing entries via substring match | `memory_replace` |
| 1.5 | Build `memory_list` tool — show all memory entries with capacity % | `memory_list` |
| 1.6 | Inject memory snapshot into EVERY tool response (like account context injection) | — |
| 1.7 | Character limits: MEMORY 2,200 chars, USER 1,375 chars | — |
| 1.8 | Duplicate prevention + basic injection scanning | — |
| 1.9 | Register all 4 tools in package.json with `toolReferenceName` | — |

**Deliverables**: `src/tools/memoryTools.ts`, `src/memory/memoryStore.ts`
**New files**: 2 | **New tools**: 4 | **Estimated lines**: ~300

**After Phase 1: ~15% toward Hermes**
> We have persistent memory that grows with the user. Copilot remembers your OS, project conventions, and preferences. Still missing: session search, skills, GitHub, Slack, Calendar, web, cron, browser. But the "dumb" feeling is gone.

---

### Phase 2: Session Persistence + Search
**Goal**: Store every conversation, search past sessions.

| Task | Description | New Tools |
|------|-------------|-----------|
| 2.1 | Create SQLite DB at `~/.copilot-minimax/sessions.db` with FTS5 | — |
| 2.2 | Auto-save every tool invocation and response to session table | — |
| 2.3 | Build `session_search` tool — FTS5 search across all past conversations | `session_search` |
| 2.4 | Build `session_list` tool — browse past sessions with timestamps | `session_list` |
| 2.5 | Build `session_resume` tool — load context from a past session | `session_resume` |
| 2.6 | Session lineage tracking (parent/child across compressions) | — |
| 2.7 | Add `better-sqlite3` as dependency (zero-config, fast, FTS5 built-in) | — |

**Deliverables**: `src/session/sessionStore.ts`, `src/tools/sessionTools.ts`
**New files**: 2 | **New tools**: 3 | **Estimated lines**: ~400
**New dependency**: `better-sqlite3`

**After Phase 2: ~25% toward Hermes**
> Agent now has long-term memory AND searchable conversation history. "Did we discuss X last week?" works. Still missing everything else, but the intelligence foundation is solid.

---

### Phase 3: GitHub Integration
**Goal**: Deepest-value integration — Copilot users live in GitHub.

| Task | Description | New Tools |
|------|-------------|-----------|
| 3.1 | GitHub PAT auth via VS Code settings | — |
| 3.2 | `github_list_repos` — user's repos with filters | `github_list_repos` |
| 3.3 | `github_repo_info` — stars, issues, PRs, languages | `github_repo_info` |
| 3.4 | `github_list_issues` — issues with state/label filters | `github_list_issues` |
| 3.5 | `github_create_issue` — open new issue | `github_create_issue` |
| 3.6 | `github_list_prs` — PRs with state/author filters | `github_list_prs` |
| 3.7 | `github_pr_details` — diff, reviews, checks | `github_pr_details` |
| 3.8 | `github_create_pr` — open new PR | `github_create_pr` |
| 3.9 | `github_list_notifications` — unread notifications | `github_list_notifications` |
| 3.10 | `github_list_branches` — branches with protection status | `github_list_branches` |

**Deliverables**: `src/tools/githubTools.ts`, `src/github/githubClient.ts`
**New files**: 2 | **New tools**: 9 | **Estimated lines**: ~500

**After Phase 3: ~38% toward Hermes**
> Now 35 active tools. Gmail + AWS + Vercel + GitHub + Memory + Sessions. Hermes doesn't have native GitHub like this — it relies on MCP server. This is our competitive edge.

---

### Phase 4: Web Search + Extract
**Goal**: Let Copilot search the internet and read web pages.

| Task | Description | New Tools |
|------|-------------|-----------|
| 4.1 | `web_search` — DuckDuckGo HTML scrape (zero-API, free) | `web_search` |
| 4.2 | `web_extract` — fetch and extract readable content from URL | `web_extract` |
| 4.3 | Optional Firecrawl/Serper API key upgrade path via settings | — |
| 4.4 | HTML → clean text extraction (strip tags, scripts, styles) | — |

**Deliverables**: `src/tools/webTools.ts`, `src/web/webClient.ts`
**New files**: 2 | **New tools**: 2 | **Estimated lines**: ~300

**After Phase 4: ~45% toward Hermes**
> Agent can now research the web. "What's the latest on X?" works. Combined with memory, it can research → remember → recall. 37 tools total.

---

### Phase 5: Slack Integration
**Goal**: Read/send Slack messages from Copilot.

| Task | Description | New Tools |
|------|-------------|-----------|
| 5.1 | Slack Bot Token auth via VS Code settings | — |
| 5.2 | `slack_list_channels` — public/private channels | `slack_list_channels` |
| 5.3 | `slack_read_messages` — recent messages from channel | `slack_read_messages` |
| 5.4 | `slack_send_message` — post to channel or DM | `slack_send_message` |
| 5.5 | `slack_search_messages` — search across workspace | `slack_search_messages` |
| 5.6 | `slack_list_users` — workspace members | `slack_list_users` |

**Deliverables**: `src/tools/slackTools.ts`, `src/slack/slackClient.ts`
**New files**: 2 | **New tools**: 5 | **Estimated lines**: ~350

**After Phase 5: ~52% toward Hermes**
> 42 tools. Gmail + Slack gives us 2 communication platforms. Hermes has 18 messaging platforms, but we cover the two most-used by developers with zero setup (inside VS Code).

---

### Phase 6: Google Calendar
**Goal**: Scheduling and availability from Copilot.

| Task | Description | New Tools |
|------|-------------|-----------|
| 6.1 | Reuse existing Google OAuth (add calendar scopes) | — |
| 6.2 | `calendar_list_events` — upcoming events with date range | `calendar_list_events` |
| 6.3 | `calendar_create_event` — create event with attendees | `calendar_create_event` |
| 6.4 | `calendar_check_availability` — free/busy lookup | `calendar_check_availability` |
| 6.5 | `calendar_update_event` — modify existing event | `calendar_update_event` |
| 6.6 | `calendar_delete_event` — remove event | `calendar_delete_event` |

**Deliverables**: `src/tools/calendarTools.ts`, `src/calendar/calendarClient.ts`
**New files**: 2 | **New tools**: 5 | **Estimated lines**: ~350

**After Phase 6: ~60% toward Hermes**
> 47 tools — **matching Hermes' 47 built-in tools count**. Calendar reuses our Google OAuth, making it almost free to build. "When's my next meeting?" and "Schedule a standup" just work.

---

### Phase 7: Skills System
**Goal**: Agent creates reusable knowledge documents from experience.

| Task | Description | New Tools |
|------|-------------|-----------|
| 7.1 | Skills directory at `~/.copilot-minimax/skills/` with SKILL.md format | — |
| 7.2 | `skill_list` — progressive disclosure (name + description only) | `skill_list` |
| 7.3 | `skill_view` — load full skill content | `skill_view` |
| 7.4 | `skill_create` — agent saves new skill from experience | `skill_create` |
| 7.5 | `skill_update` — agent patches existing skill | `skill_update` |
| 7.6 | `skill_delete` — remove skill | `skill_delete` |
| 7.7 | Inject skill index into system prompt (Level 0 only, ~3k tokens) | — |
| 7.8 | Auto-suggest skill creation after 5+ tool call chains | — |

**Deliverables**: `src/tools/skillTools.ts`, `src/skills/skillStore.ts`
**New files**: 2 | **New tools**: 5 | **Estimated lines**: ~400

**After Phase 7: ~70% toward Hermes**
> 52 tools. Self-improving skills + memory = the learning loop. Agent gets smarter with use. This is the inflection point — our extension now has genuine intelligence beyond simple API wrappers.

---

### Phase 8: Cron / Scheduled Tasks
**Goal**: Automated recurring tasks with notification delivery.

| Task | Description | New Tools |
|------|-------------|-----------|
| 8.1 | Cron store at `~/.copilot-minimax/cron/jobs.json` | — |
| 8.2 | `cron_create` — schedule recurring task | `cron_create` |
| 8.3 | `cron_list` — list all jobs with next run time | `cron_list` |
| 8.4 | `cron_update` — modify schedule or task | `cron_update` |
| 8.5 | `cron_delete` — remove job | `cron_delete` |
| 8.6 | `cron_pause` / `cron_resume` — toggle active state | `cron_pause`, `cron_resume` |
| 8.7 | Background timer that runs jobs via extension activation | — |
| 8.8 | Deliver results via Slack/Gmail/VS Code notification | — |

**Deliverables**: `src/tools/cronTools.ts`, `src/cron/cronScheduler.ts`
**New files**: 2 | **New tools**: 6 | **Estimated lines**: ~450

**After Phase 8: ~78% toward Hermes**
> 58 tools. "Every morning at 9am, check my Vercel deployments and Slack me if anything failed." Automation changes this from a tool box to an assistant.

---

### Phase 9: WhatsApp via Baileys
**Goal**: Third messaging platform.

| Task | Description | New Tools |
|------|-------------|-----------|
| 9.1 | Baileys (WhatsApp Web multi-device) integration | — |
| 9.2 | QR code auth flow in VS Code webview | — |
| 9.3 | `whatsapp_send_message` — send to contact/group | `whatsapp_send_message` |
| 9.4 | `whatsapp_read_messages` — recent messages | `whatsapp_read_messages` |
| 9.5 | `whatsapp_list_contacts` — contacts list | `whatsapp_list_contacts` |
| 9.6 | `whatsapp_list_groups` — groups list | `whatsapp_list_groups` |

**Deliverables**: `src/tools/whatsappTools.ts`, `src/whatsapp/whatsappClient.ts`
**New files**: 2 | **New tools**: 4 | **New dependency**: `@whiskeysockets/baileys`
**Estimated lines**: ~500

**After Phase 9: ~85% toward Hermes**
> 62 tools. Gmail + Slack + WhatsApp = 3 messaging platforms. Hermes has 18, but these 3 cover 90% of developer communication.

---

### Phase 10: Audit Log + Activity Dashboard
**Goal**: Track everything the agent did across sessions.

| Task | Description | New Tools |
|------|-------------|-----------|
| 10.1 | Append every tool call to `sessions.db` audit table | — |
| 10.2 | `audit_search` — search action history (sent emails, created issues, etc.) | `audit_search` |
| 10.3 | `audit_summary` — daily/weekly activity summary | `audit_summary` |
| 10.4 | VS Code webview dashboard showing recent activity | — |

**Deliverables**: `src/tools/auditTools.ts`, `src/audit/auditLog.ts`, `src/webview/dashboard.ts`
**New files**: 3 | **New tools**: 2 | **Estimated lines**: ~400

**After Phase 10: ~90% toward Hermes**
> 64 tools. Full observability. The user can see everything Copilot did on their behalf. Trust comes from transparency.

---

### Phase 11: Polish + Ecosystem
**Goal**: Production readiness and discoverability.

| Task | Description |
|------|-------------|
| 11.1 | Rate limiting on all API tools (per-minute quotas) |
| 11.2 | Exponential backoff retry logic |
| 11.3 | Confirmation prompts for destructive operations (send email, create PR, delete event) |
| 11.4 | Settings migration system (version upgrades) |
| 11.5 | VS Code Marketplace publishing |
| 11.6 | README with feature comparison vs Hermes |
| 11.7 | Extension icon + branding |
| 11.8 | Test suite (at least auth + memory + sessions) |

**After Phase 11: ~95% toward Hermes**
> Production-grade, published on Marketplace. Missing only: browser automation, RL training, voice mode, 15 more messaging platforms. Those are Hermes-specific and not needed for "Hermes for Copilot" positioning.

---

### Summary Scorecard

| Phase | New Tools | Total Tools | Lines Added | % Toward Hermes | Key Unlock |
|-------|-----------|-------------|-------------|-----------------|------------|
| **Current** | — | 26 | 2,033 | **0%** | Gmail + AWS + Vercel |
| **1. Memory** | +4 | 30 | +300 | **15%** | Agent remembers across sessions |
| **2. Sessions** | +3 | 33 | +400 | **25%** | Searchable conversation history |
| **3. GitHub** | +9 | 42 | +500 | **38%** | Deepest-value integration |
| **4. Web** | +2 | 44 | +300 | **45%** | Internet access |
| **5. Slack** | +5 | 49 | +350 | **52%** | 2nd messaging platform |
| **6. Calendar** | +5 | 54 | +350 | **60%** | Matches Hermes tool count |
| **7. Skills** | +5 | 59 | +400 | **70%** | Self-improving agent |
| **8. Cron** | +6 | 65 | +450 | **78%** | Automation |
| **9. WhatsApp** | +4 | 69 | +500 | **85%** | 3rd messaging platform |
| **10. Audit** | +2 | 71 | +400 | **90%** | Full observability |
| **11. Polish** | — | 71 | +300 | **95%** | Production-ready |
| **TOTAL** | **+45** | **71** | **+4,250** | **95%** | **~6,300 total lines** |

The remaining 5% is browser automation (10 tools), voice mode, RL training, and 15 niche messaging platforms — features that don't fit the "inside Copilot" model and are Hermes-specific.

Want me to start building Phase 1 (Memory System)?