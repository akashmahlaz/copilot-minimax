/**
 * Google OAuth2 token management.
 * Reuses tokens from the existing VS Code extension at ~/.copilot-gmail/accounts/
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { TokenData } from './types.js';

const ACCOUNTS_DIR = join(homedir(), '.copilot-gmail', 'accounts');
const ACTIVE_FILE = join(homedir(), '.copilot-gmail', 'active-account');
const TOKEN_REFRESH_URL = 'https://oauth2.googleapis.com/token';
const TOKEN_EXPIRY_BUFFER_MS = 120_000; // refresh 2min before expiry

let clientId: string | undefined;
let clientSecret: string | undefined;

export function setCredentials(id: string, secret: string): void {
  clientId = id;
  clientSecret = secret;
}

export function listAccounts(): TokenData[] {
  if (!existsSync(ACCOUNTS_DIR)) return [];
  return readdirSync(ACCOUNTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(readFileSync(join(ACCOUNTS_DIR, f), 'utf8')) as TokenData;
      } catch { return null; }
    })
    .filter((t): t is TokenData => t !== null);
}

export function getActiveLabel(): string | undefined {
  if (!existsSync(ACTIVE_FILE)) return undefined;
  try { return readFileSync(ACTIVE_FILE, 'utf8').trim(); } catch { return undefined; }
}

export function getAccount(label?: string): TokenData | undefined {
  const accounts = listAccounts();
  if (accounts.length === 0) return undefined;

  if (label) {
    return accounts.find(a => a.label === label || a.email === label);
  }
  const activeLabel = getActiveLabel();
  if (activeLabel) {
    const active = accounts.find(a => a.label === activeLabel);
    if (active) return active;
  }
  return accounts[0];
}

function isExpired(token: TokenData): boolean {
  const expiresAt = token.saved_at + token.expires_in * 1000;
  return Date.now() > expiresAt - TOKEN_EXPIRY_BUFFER_MS;
}

export async function getAccessToken(label?: string): Promise<string> {
  const account = getAccount(label);
  if (!account) {
    throw new Error(
      'No Google account configured. Add one via the VS Code extension: run "Gmail: Add Account"'
    );
  }

  if (!isExpired(account)) {
    return account.access_token;
  }

  // Refresh the token
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth client credentials not set. Pass GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.'
    );
  }

  const resp = await fetch(TOKEN_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };

  // Update stored token
  const updated: TokenData = {
    ...account,
    access_token: data.access_token,
    expires_in: data.expires_in,
    saved_at: Date.now(),
  };

  const filePath = join(ACCOUNTS_DIR, `${account.label}.json`);
  writeFileSync(filePath, JSON.stringify(updated, null, 2));

  return data.access_token;
}
