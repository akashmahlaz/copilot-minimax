#!/usr/bin/env node
/**
 * Google MCP Server — Gmail + Calendar
 * Transport: stdio (standard for VS Code Copilot)
 * Auth: Reuses tokens from ~/.copilot-gmail/accounts/
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { setCredentials } from './auth.js';
import * as gmail from './gmail.js';
import * as calendar from './calendar.js';

const server = new McpServer({
  name: 'google-mcp',
  version: '0.1.0',
});

// --- Gmail Tools ---

server.tool(
  'gmail_connection_status',
  'Check if a Google account is connected and which one is active',
  {},
  async () => {
    const status = gmail.getConnectionStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  },
);

server.tool(
  'gmail_list_accounts',
  'List all connected Google accounts',
  {},
  async () => {
    const accounts = gmail.getAccountList();
    if (accounts.length === 0) {
      return { content: [{ type: 'text', text: 'No accounts configured. Add one via the VS Code extension: "Gmail: Add Account"' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }] };
  },
);

server.tool(
  'gmail_check_inbox',
  'Check recent emails in the inbox. Use query for Gmail search syntax (e.g. "is:unread", "from:boss@company.com")',
  {
    maxResults: z.number().min(1).max(50).default(10).describe('Number of emails to return'),
    query: z.string().optional().describe('Gmail search query (e.g. "is:unread", "from:alice@example.com")'),
    account: z.string().optional().describe('Account label or email to use'),
  },
  async ({ maxResults, query, account }) => {
    try {
      const messages = await gmail.checkInbox(maxResults, query, account);
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: 'No messages found.' }] };
      }
      const summary = messages.map(m =>
        `**${m.subject}**\nFrom: ${m.from} | ${m.date}\nID: ${m.id}\n${m.snippet}`,
      ).join('\n\n---\n\n');
      return { content: [{ type: 'text', text: summary }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'gmail_search_emails',
  'Search emails using Gmail search syntax',
  {
    query: z.string().describe('Gmail search query'),
    maxResults: z.number().min(1).max(50).default(10).describe('Number of results'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ query, maxResults, account }) => {
    try {
      const messages = await gmail.searchEmails(query, maxResults, account);
      if (messages.length === 0) {
        return { content: [{ type: 'text', text: `No emails matching "${query}"` }] };
      }
      const summary = messages.map(m =>
        `**${m.subject}**\nFrom: ${m.from} | ${m.date}\nID: ${m.id}\n${m.snippet}`,
      ).join('\n\n---\n\n');
      return { content: [{ type: 'text', text: summary }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'gmail_read_email',
  'Read the full content of a specific email by message ID',
  {
    messageId: z.string().describe('Gmail message ID'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ messageId, account }) => {
    try {
      const msg = await gmail.readEmail(messageId, account);
      const text = [
        `**${msg.subject}**`,
        `From: ${msg.from}`,
        `To: ${msg.to}`,
        `Date: ${msg.date}`,
        `Labels: ${msg.labels.join(', ')}`,
        '',
        msg.body ?? '(no body)',
      ].join('\n');
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'gmail_send_email',
  'Send a new email',
  {
    to: z.string().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    body: z.string().describe('Email body (plain text)'),
    account: z.string().optional().describe('Account label or email to send from'),
  },
  async ({ to, subject, body, account }) => {
    try {
      const id = await gmail.sendEmail(to, subject, body, account);
      return { content: [{ type: 'text', text: `Email sent successfully. Message ID: ${id}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'gmail_reply_to_email',
  'Reply to an existing email thread',
  {
    messageId: z.string().describe('ID of the message to reply to'),
    body: z.string().describe('Reply body (plain text)'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ messageId, body, account }) => {
    try {
      const id = await gmail.replyToEmail(messageId, body, account);
      return { content: [{ type: 'text', text: `Reply sent. Message ID: ${id}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'gmail_get_labels',
  'List all Gmail labels for the account',
  {
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ account }) => {
    try {
      const labels = await gmail.getLabels(account);
      return { content: [{ type: 'text', text: JSON.stringify(labels, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

// --- Calendar Tools ---

server.tool(
  'calendar_list_calendars',
  'List all Google calendars for the account',
  {
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ account }) => {
    try {
      const calendars = await calendar.listCalendars(account);
      return { content: [{ type: 'text', text: JSON.stringify(calendars, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'calendar_list_events',
  'List upcoming events from a calendar. Defaults to primary calendar and next 10 events.',
  {
    calendarId: z.string().default('primary').describe('Calendar ID (default: primary)'),
    maxResults: z.number().min(1).max(50).default(10).describe('Number of events'),
    timeMin: z.string().optional().describe('Start time (ISO 8601). Defaults to now.'),
    timeMax: z.string().optional().describe('End time (ISO 8601)'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ calendarId, maxResults, timeMin, timeMax, account }) => {
    try {
      const events = await calendar.listEvents(calendarId, maxResults, timeMin, timeMax, account);
      if (events.length === 0) {
        return { content: [{ type: 'text', text: 'No upcoming events.' }] };
      }
      const text = events.map(ev =>
        `**${ev.summary}**\n${ev.start} → ${ev.end}${ev.location ? `\nLocation: ${ev.location}` : ''}${ev.attendees?.length ? `\nAttendees: ${ev.attendees.join(', ')}` : ''}\nID: ${ev.id}`,
      ).join('\n\n---\n\n');
      return { content: [{ type: 'text', text }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'calendar_create_event',
  'Create a new calendar event',
  {
    summary: z.string().describe('Event title'),
    startTime: z.string().describe('Start time in ISO 8601 format'),
    endTime: z.string().describe('End time in ISO 8601 format'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
    attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
    calendarId: z.string().default('primary').describe('Calendar ID'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ summary, startTime, endTime, description, location, attendees, calendarId, account }) => {
    try {
      const event = await calendar.createEvent(summary, startTime, endTime, {
        calendarId, description, location, attendees, account,
      });
      return { content: [{ type: 'text', text: `Event created: "${event.summary}" (${event.start} → ${event.end})\nID: ${event.id}${event.htmlLink ? `\nLink: ${event.htmlLink}` : ''}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'calendar_update_event',
  'Update an existing calendar event',
  {
    eventId: z.string().describe('Event ID to update'),
    summary: z.string().optional().describe('New title'),
    startTime: z.string().optional().describe('New start time (ISO 8601)'),
    endTime: z.string().optional().describe('New end time (ISO 8601)'),
    description: z.string().optional().describe('New description'),
    location: z.string().optional().describe('New location'),
    calendarId: z.string().default('primary').describe('Calendar ID'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ eventId, summary, startTime, endTime, description, location, calendarId, account }) => {
    try {
      const event = await calendar.updateEvent(eventId, {
        summary, startTime, endTime, description, location, calendarId, account,
      });
      return { content: [{ type: 'text', text: `Event updated: "${event.summary}" (${event.start} → ${event.end})` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'calendar_delete_event',
  'Delete a calendar event',
  {
    eventId: z.string().describe('Event ID to delete'),
    calendarId: z.string().default('primary').describe('Calendar ID'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ eventId, calendarId, account }) => {
    try {
      await calendar.deleteEvent(eventId, calendarId, account);
      return { content: [{ type: 'text', text: `Event ${eventId} deleted.` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

server.tool(
  'calendar_check_availability',
  'Check if a time slot is free or busy',
  {
    timeMin: z.string().describe('Start of time range (ISO 8601)'),
    timeMax: z.string().describe('End of time range (ISO 8601)'),
    calendarId: z.string().default('primary').describe('Calendar ID'),
    account: z.string().optional().describe('Account label or email'),
  },
  async ({ timeMin, timeMax, calendarId, account }) => {
    try {
      const result = await calendar.checkAvailability(timeMin, timeMax, calendarId, account);
      if (!result.busy) {
        return { content: [{ type: 'text', text: `✅ Time slot is free (${timeMin} → ${timeMax})` }] };
      }
      const conflicts = result.events.map(ev => `- ${ev.summary} (${ev.start} → ${ev.end})`).join('\n');
      return { content: [{ type: 'text', text: `❌ Busy — ${result.events.length} conflicting event(s):\n${conflicts}` }] };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true };
    }
  },
);

// --- Start Server ---

async function main(): Promise<void> {
  // Load OAuth credentials from env
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret) {
    setCredentials(clientId, clientSecret);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start Google MCP server:', err);
  process.exit(1);
});
