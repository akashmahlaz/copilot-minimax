/**
 * Google Calendar API operations using native fetch.
 * Requires additional OAuth scope: https://www.googleapis.com/auth/calendar
 */
import { getAccessToken } from './auth.js';
import type { CalendarEvent, CalendarListEntry } from './types.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

async function calFetch(path: string, options: RequestInit = {}, account?: string): Promise<Response> {
  const token = await getAccessToken(account);
  const resp = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Calendar API error (${resp.status}): ${text}`);
  }
  return resp;
}

function parseEvent(ev: Record<string, unknown>): CalendarEvent {
  const start = ev.start as { dateTime?: string; date?: string } | undefined;
  const end = ev.end as { dateTime?: string; date?: string } | undefined;
  const attendees = (ev.attendees ?? []) as Array<{ email: string }>;

  return {
    id: ev.id as string,
    summary: (ev.summary as string) ?? '(No title)',
    description: ev.description as string | undefined,
    start: start?.dateTime ?? start?.date ?? '',
    end: end?.dateTime ?? end?.date ?? '',
    location: ev.location as string | undefined,
    attendees: attendees.map(a => a.email),
    status: (ev.status as string) ?? 'confirmed',
    htmlLink: ev.htmlLink as string | undefined,
  };
}

export async function listCalendars(account?: string): Promise<CalendarListEntry[]> {
  const resp = await calFetch('/users/me/calendarList', {}, account);
  const data = (await resp.json()) as { items: Array<Record<string, unknown>> };
  return (data.items ?? []).map(c => ({
    id: c.id as string,
    summary: c.summary as string,
    primary: (c.primary as boolean) ?? false,
  }));
}

export async function listEvents(
  calendarId: string = 'primary',
  maxResults: number = 10,
  timeMin?: string,
  timeMax?: string,
  account?: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: timeMin ?? new Date().toISOString(),
  });
  if (timeMax) params.set('timeMax', timeMax);

  const resp = await calFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {},
    account,
  );
  const data = (await resp.json()) as { items: Array<Record<string, unknown>> };
  return (data.items ?? []).map(parseEvent);
}

export async function createEvent(
  summary: string,
  startTime: string,
  endTime: string,
  options: {
    calendarId?: string;
    description?: string;
    location?: string;
    attendees?: string[];
    account?: string;
  } = {},
): Promise<CalendarEvent> {
  const calendarId = options.calendarId ?? 'primary';
  const body: Record<string, unknown> = {
    summary,
    start: { dateTime: startTime },
    end: { dateTime: endTime },
  };
  if (options.description) body.description = options.description;
  if (options.location) body.location = options.location;
  if (options.attendees?.length) {
    body.attendees = options.attendees.map(email => ({ email }));
  }

  const resp = await calFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: 'POST', body: JSON.stringify(body) },
    options.account,
  );
  return parseEvent(await resp.json() as Record<string, unknown>);
}

export async function updateEvent(
  eventId: string,
  updates: {
    summary?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    location?: string;
    calendarId?: string;
    account?: string;
  },
): Promise<CalendarEvent> {
  const calendarId = updates.calendarId ?? 'primary';
  const body: Record<string, unknown> = {};
  if (updates.summary) body.summary = updates.summary;
  if (updates.startTime) body.start = { dateTime: updates.startTime };
  if (updates.endTime) body.end = { dateTime: updates.endTime };
  if (updates.description) body.description = updates.description;
  if (updates.location) body.location = updates.location;

  const resp = await calFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    updates.account,
  );
  return parseEvent(await resp.json() as Record<string, unknown>);
}

export async function deleteEvent(
  eventId: string,
  calendarId: string = 'primary',
  account?: string,
): Promise<void> {
  await calFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
    account,
  );
}

export async function checkAvailability(
  timeMin: string,
  timeMax: string,
  calendarId: string = 'primary',
  account?: string,
): Promise<{ busy: boolean; events: CalendarEvent[] }> {
  const events = await listEvents(calendarId, 50, timeMin, timeMax, account);
  return {
    busy: events.length > 0,
    events,
  };
}
