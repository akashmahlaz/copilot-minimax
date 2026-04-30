export interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  saved_at: number;
  email: string;
  label: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  status: string;
  htmlLink?: string;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
}
