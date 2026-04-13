# Connector UI/UX Vision

This document defines a practical UI/UX direction for your Copilot connector platform
(Gmail, Vercel, WhatsApp, and future providers).

## Product Principle

Copilot stays the intelligence layer. Your product advantage is:

- Connected accounts with clear trust and control
- Action approval for risky operations
- Fast "chat + action" workflows inside the editor

## Main Surfaces

## 1) Connector Sidebar View

A dedicated sidebar view named `Connectors` with provider cards.

Card layout:

- Provider icon + name
- Status badge: `Not connected`, `Connected`, `Needs re-auth`
- Scope summary line: `Read email headers`, `Send emails`, etc.
- Primary action button: `Connect` or `Manage`

Micro-interactions:

- On connect success, animate card border for 600ms and show `Connected` chip.
- On token expiry, show warning tone and `Fix` CTA.

## 2) Chat Inline Action Blocks

When Copilot proposes an external action, render action blocks in chat:

- Action title: `Send Gmail draft`
- Preview payload: recipients, subject, deployment target, etc.
- Risk level chip: `Safe`, `Review`, `Sensitive`
- Buttons: `Approve`, `Edit`, `Reject`

Rules:

- No silent write operations.
- Sensitive actions always require one explicit approval.

## 3) Activity Timeline Panel

A timeline panel under chat for observability:

- "Read 25 inbox threads"
- "Prepared draft to client@company.com"
- "Deployment triggered: production"

This improves trust and debugging.

## Primary User Flows

## Flow A: Gmail Triage

1. User asks: "Summarize my unread customer emails."
2. Copilot calls read-only Gmail tool.
3. Copilot returns grouped summary and suggested replies.
4. User selects one suggestion -> action block for draft send appears.
5. User approves send.

## Flow B: Vercel Deploy with Verification

1. User asks: "Deploy latest commit to staging."
2. Copilot fetches project and environment targets.
3. Action block displays target project/env.
4. User approves.
5. Timeline logs deployment id and status stream.

## Flow C: WhatsApp Reply Assist

1. User asks: "Reply to latest VIP customer message."
2. Copilot fetches thread summary.
3. Draft message appears with policy checks.
4. User edits/approves.
5. System sends and logs message id.

## Design Tokens

Use neutral and trust-centric visual language.

- Safe color: green-600
- Review color: amber-600
- Sensitive color: red-600
- Connected color: teal-600
- Font: use editor default for consistency inside VS Code webviews

## Accessibility + Safety

- Every action block is keyboard-operable.
- Approve button requires focused step for sensitive actions.
- Provide clear "Undo where possible" for reversible operations.
- Show exact connector scope at connection and in settings.

## MVP UI Scope

For version 1, implement only:

1. Connector sidebar with Gmail card
2. Chat action block for draft/send approval
3. Activity timeline for Gmail actions

Then add Vercel and WhatsApp cards using the same interaction model.
