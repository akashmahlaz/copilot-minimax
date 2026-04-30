/**
 * Gmail API operations using native fetch.
 * All methods require a valid access token from auth.ts.
 */
import { getAccessToken, listAccounts, getAccount, getActiveLabel } from './auth.js';
import type { EmailMessage, GmailLabel } from './types.js';

const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

async function gmailFetch(path: string, options: RequestInit = {}, account?: string): Promise<Response> {
  const token = await getAccessToken(account);
  const resp = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail API error (${resp.status}): ${text}`);
  }
  return resp;
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseMessage(msg: Record<string, unknown>): EmailMessage {
  const payload = msg.payload as Record<string, unknown> | undefined;
  const headers = (payload?.headers ?? []) as Array<{ name: string; value: string }>;

  let body = '';
  if (payload) {
    const bodyData = payload.body as { data?: string } | undefined;
    if (bodyData?.data) {
      body = decodeBase64Url(bodyData.data);
    } else {
      const parts = (payload.parts ?? []) as Array<Record<string, unknown>>;
      const textPart = parts.find(p => (p.mimeType as string) === 'text/plain');
      const htmlPart = parts.find(p => (p.mimeType as string) === 'text/html');
      const part = textPart ?? htmlPart;
      if (part) {
        const partBody = part.body as { data?: string } | undefined;
        if (partBody?.data) body = decodeBase64Url(partBody.data);
      }
    }
  }

  return {
    id: msg.id as string,
    threadId: msg.threadId as string,
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    snippet: msg.snippet as string ?? '',
    body: body || undefined,
    labels: (msg.labelIds ?? []) as string[],
  };
}

export async function checkInbox(
  maxResults: number = 10,
  query?: string,
  account?: string,
): Promise<EmailMessage[]> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (query) params.set('q', query);

  const listResp = await gmailFetch(`/messages?${params}`, {}, account);
  const listData = (await listResp.json()) as { messages?: Array<{ id: string }> };

  if (!listData.messages?.length) return [];

  const messages = await Promise.all(
    listData.messages.slice(0, maxResults).map(async (m) => {
      const resp = await gmailFetch(`/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To`, {}, account);
      return parseMessage(await resp.json() as Record<string, unknown>);
    }),
  );

  return messages;
}

export async function readEmail(messageId: string, account?: string): Promise<EmailMessage> {
  const resp = await gmailFetch(`/messages/${messageId}?format=full`, {}, account);
  return parseMessage(await resp.json() as Record<string, unknown>);
}

export async function searchEmails(
  query: string,
  maxResults: number = 10,
  account?: string,
): Promise<EmailMessage[]> {
  return checkInbox(maxResults, query, account);
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  account?: string,
): Promise<string> {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');

  const resp = await gmailFetch('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: encoded }),
  }, account);

  const result = (await resp.json()) as { id: string };
  return result.id;
}

export async function replyToEmail(
  messageId: string,
  body: string,
  account?: string,
): Promise<string> {
  // Get original message for threading
  const original = await readEmail(messageId, account);

  const subject = original.subject.startsWith('Re:')
    ? original.subject
    : `Re: ${original.subject}`;

  const raw = [
    `To: ${original.from}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(raw).toString('base64url');

  const resp = await gmailFetch('/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: encoded, threadId: original.threadId }),
  }, account);

  const result = (await resp.json()) as { id: string };
  return result.id;
}

export async function getLabels(account?: string): Promise<GmailLabel[]> {
  const resp = await gmailFetch('/labels', {}, account);
  const data = (await resp.json()) as { labels: Array<{ id: string; name: string; type: string }> };
  return data.labels.map(l => ({ id: l.id, name: l.name, type: l.type }));
}

export function getAccountList(): Array<{ label: string; email: string; active: boolean }> {
  const accounts = listAccounts();
  const activeLabel = getActiveLabel();
  return accounts.map(a => ({
    label: a.label,
    email: a.email,
    active: a.label === activeLabel,
  }));
}

export function getConnectionStatus(): { connected: boolean; account?: string; email?: string } {
  const account = getAccount();
  if (!account) return { connected: false };
  return { connected: true, account: account.label, email: account.email };
}
