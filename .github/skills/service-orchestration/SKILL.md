---
name: service-orchestration
description: "Coordinate multiple services (Gmail, WhatsApp, AWS, GitHub, Calendar) in multi-step workflows. Use when a task involves two or more external services, when automating cross-platform workflows, or when the user asks to connect different tools together."
---

# Service Orchestration

## Available Services

| Service | MCP Server | Key Tools |
|---------|-----------|-----------|
| **Gmail** | `google` | check_inbox, search_emails, read_email, send_email, reply_to_email |
| **Calendar** | `google` | list_events, create_event, check_availability |
| **AWS** | `aws`, `aws-admin` | Full AWS API access (S3, Lambda, EC2, IAM, CloudWatch, etc.) |
| **GitHub** | `github` | Issues, PRs, repos, code search, branch management |
| **WhatsApp** | `whatsapp` | send_message, read_messages, list_chats, search_messages |
| **Sessions** | `sessions` | session_search, session_list, session_resume |

## Common Orchestration Patterns

### Email → Action → Notification
1. Search Gmail for relevant emails
2. Perform the requested action (create PR, deploy, update config)
3. Reply to the email with results, or notify via WhatsApp

### GitHub → Deploy → Monitor
1. Check PR status or merge
2. Trigger deployment (Vercel or AWS)
3. Monitor deployment logs (CloudWatch)
4. Notify team via Slack/WhatsApp

### Calendar → Prepare → Remind
1. Check upcoming meetings (list_events)
2. Search Gmail/GitHub for relevant context
3. Summarize preparation notes
4. Send WhatsApp reminder with agenda

### Monitoring → Alert → Fix
1. Check CloudWatch alarms/metrics
2. If alert detected, search GitHub issues for known fixes
3. Apply fix (commit, deploy)
4. Notify via WhatsApp/Gmail

## Orchestration Rules

1. **Confirm before sending** — Always confirm before sending emails, WhatsApp messages, or creating GitHub issues
2. **Minimize API calls** — Batch reads where possible, don't fetch the same data twice
3. **Handle partial failures** — If step 2 of 3 fails, report what succeeded and what didn't
4. **Log everything** — Tool calls are automatically logged to sessions, but call out important results
5. **Respect rate limits** — Space out rapid API calls, especially to Gmail and GitHub

## Authentication Note

Each MCP server manages its own authentication:
- **Google**: OAuth2 tokens in `~/.copilot-gmail/accounts/`
- **AWS**: Profile-based via `~/.aws/credentials` (AWS_PROFILE setting)
- **GitHub**: Personal Access Token
- **WhatsApp**: Baileys auth in `~/.copilot-minimax/whatsapp-mcp-auth/` (QR scan once)

If a service returns an auth error, guide the user through re-authentication rather than retrying.
