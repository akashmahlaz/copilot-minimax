# Connector UI Wireframes

These wireframes describe how the connector experience should look inside the editor.

## 1) Connectors Sidebar

```text
+--------------------------------------------------+
| CONNECTORS                                       |
|--------------------------------------------------|
| [G] Gmail                       [Connected]      |
| Scope: Read + Draft + Send                     > |
|                                                  |
| [V] Vercel                      [Connected]      |
| Scope: Deploy + Logs                             |
|                                                  |
| [W] WhatsApp                    [Not connected]  |
| Scope: Read + Send templates                     |
|                              [Connect WhatsApp]  |
|--------------------------------------------------|
| Last activity                                    |
| - Gmail draft approved: 2m ago                   |
| - Vercel deploy started: 11m ago                 |
+--------------------------------------------------+
```

## 2) Chat With Action Cards

```text
User: Reply to latest customer escalation email

Copilot:
I found 3 unread escalation emails. I drafted a reply for Acme Corp.

+--------------------------------------------------+
| ACTION: Send Gmail Draft                         |
| To: ops@acme.com                                 |
| Subject: Re: Production Incident Follow-up       |
| Risk: Sensitive                                  |
|--------------------------------------------------|
| [Edit Draft]   [Reject]   [Approve & Send]       |
+--------------------------------------------------+
```

## 3) Approval Modal

```text
+--------------------------------------------------+
| Confirm External Action                          |
|--------------------------------------------------|
| Connector: Gmail                                 |
| Action: send_message                             |
| Account: founder@yourcompany.com                 |
|                                                  |
| This action will send an external email.         |
|                                                  |
| [Cancel]                          [Confirm Send]  |
+--------------------------------------------------+
```

## 4) Activity Timeline Panel

```text
+--------------------------------------------------+
| CONNECTOR TIMELINE                               |
|--------------------------------------------------|
| 12:31  TOOL_CALL   connector.gmail.list_threads  |
| 12:31  RESULT      25 threads loaded             |
| 12:32  TOOL_CALL   connector.gmail.create_draft  |
| 12:32  APPROVAL    user approved send_message    |
| 12:32  RESULT      message id: 1942ab...         |
+--------------------------------------------------+
```

## UX principles

- High-trust design: every write action is explicit.
- Fast scanability: connector status always visible.
- Same interaction language for Gmail, Vercel, and WhatsApp.
- Keyboard-first approvals for power users.
