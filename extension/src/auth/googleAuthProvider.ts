import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Multi-account storage ───────────────────────────────────
// ~/.copilot-gmail/
//   accounts/           ← one JSON per account
//     personal.json     ← { access_token, refresh_token, email, label, ... }
//     work.json
//     client.json
//   active.txt          ← current label, e.g. "personal"
//   token.json          ← legacy single-account (still written for Python CLI compat)

const BASE_DIR = path.join(os.homedir(), '.copilot-gmail');
const ACCOUNTS_DIR = path.join(BASE_DIR, 'accounts');
const ACTIVE_FILE = path.join(BASE_DIR, 'active.txt');
const LEGACY_TOKEN = path.join(BASE_DIR, 'token.json');

function ensureDirs(): void {
    if (!fs.existsSync(ACCOUNTS_DIR)) { fs.mkdirSync(ACCOUNTS_DIR, { recursive: true }); }
}

export interface AccountData {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    saved_at?: number;
    email?: string;
    label: string;          // user-chosen label: "personal", "work", "client", etc.
}

function accountPath(label: string): string {
    // Sanitize label for filesystem
    const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    return path.join(ACCOUNTS_DIR, `${safe}.json`);
}

function readAccount(label: string): AccountData | undefined {
    const p = accountPath(label);
    if (!fs.existsSync(p)) { return undefined; }
    try {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (data.refresh_token) { return { ...data, label }; }
    } catch { /* ignore */ }
    return undefined;
}

function writeAccount(data: AccountData): void {
    ensureDirs();
    data.saved_at = Date.now();
    const json = JSON.stringify(data);
    fs.writeFileSync(accountPath(data.label), json, 'utf-8');
    // Also write legacy token.json for Python CLI compat (active account)
    if (getActiveLabel() === data.label) {
        fs.writeFileSync(LEGACY_TOKEN, json, 'utf-8');
    }
}

function removeAccount(label: string): void {
    const p = accountPath(label);
    try { fs.unlinkSync(p); } catch { /* ok */ }
    // If this was active, clear active
    if (getActiveLabel() === label) {
        const remaining = listAccountLabels();
        if (remaining.length > 0) {
            setActiveLabel(remaining[0]);
        } else {
            try { fs.unlinkSync(ACTIVE_FILE); } catch { /* ok */ }
            try { fs.unlinkSync(LEGACY_TOKEN); } catch { /* ok */ }
        }
    }
}

function listAccountLabels(): string[] {
    ensureDirs();
    try {
        return fs.readdirSync(ACCOUNTS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch { return []; }
}

function getActiveLabel(): string {
    try { return fs.readFileSync(ACTIVE_FILE, 'utf-8').trim(); }
    catch { return ''; }
}

function setActiveLabel(label: string): void {
    ensureDirs();
    fs.writeFileSync(ACTIVE_FILE, label, 'utf-8');
    // Sync legacy token.json
    const data = readAccount(label);
    if (data) {
        fs.writeFileSync(LEGACY_TOKEN, JSON.stringify(data), 'utf-8');
    }
}

function getActiveAccount(): AccountData | undefined {
    const label = getActiveLabel();
    if (!label) {
        // Fallback: pick first available
        const labels = listAccountLabels();
        if (labels.length > 0) { setActiveLabel(labels[0]); return readAccount(labels[0]); }
        // Legacy migration: if token.json exists but no accounts, migrate it
        if (fs.existsSync(LEGACY_TOKEN)) {
            try {
                const data = JSON.parse(fs.readFileSync(LEGACY_TOKEN, 'utf-8'));
                if (data.refresh_token) {
                    const migrated: AccountData = { ...data, label: 'personal' };
                    writeAccount(migrated);
                    setActiveLabel('personal');
                    return migrated;
                }
            } catch { /* ignore */ }
        }
        return undefined;
    }
    return readAccount(label);
}

function isExpired(data: AccountData): boolean {
    if (!data.saved_at || !data.expires_in) { return true; }
    return Date.now() >= data.saved_at + (data.expires_in * 1000) - 120_000;
}

// ── Public API ──────────────────────────────────────────────

export class GoogleAuthProvider implements vscode.AuthenticationProvider {
    static readonly id = 'google-gmail';
    static readonly scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ];

    private _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    readonly onDidChangeSessions = this._onDidChangeSessions.event;
    private _sessions: vscode.AuthenticationSession[] = [];

    constructor(private _context: vscode.ExtensionContext) {
        this._tryRestore();
    }

    // ── Multi-account public methods ────────────────────────

    /** Add a new Gmail account with a label. Opens OAuth flow. */
    async addAccount(label: string): Promise<AccountData> {
        const { clientId, clientSecret } = this._getClientCreds();
        const { code, redirectUri } = await this._startOAuthFlow(clientId, GoogleAuthProvider.scopes);
        const tokens = await this._exchangeCode(clientId, clientSecret, code, redirectUri);
        const userInfo = await this._fetchUserInfo(tokens.access_token);
        const account: AccountData = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in || 3599,
            email: userInfo.email,
            label,
        };
        writeAccount(account);
        setActiveLabel(label);
        this._rebuildSessions();
        return account;
    }

    /** Switch active account by label. */
    switchAccount(label: string): AccountData | undefined {
        const data = readAccount(label);
        if (data) {
            setActiveLabel(label);
            this._rebuildSessions();
        }
        return data;
    }

    /** Remove an account by label. */
    removeAccountByLabel(label: string): void {
        removeAccount(label);
        this._rebuildSessions();
    }

    /** Get all connected account labels with emails. */
    listAccounts(): Array<{ label: string; email: string; active: boolean }> {
        const active = getActiveLabel();
        return listAccountLabels().map(label => {
            const data = readAccount(label);
            return { label, email: data?.email || '?', active: label === active };
        });
    }

    /** Get the active account label. */
    getActiveAccountLabel(): string { return getActiveLabel(); }

    /** Get an access token for a specific account (by label). If no label, uses active. */
    async getAccessTokenFor(label?: string): Promise<string | undefined> {
        const targetLabel = label || getActiveLabel();
        if (!targetLabel) { return undefined; }
        const data = readAccount(targetLabel);
        if (!data?.refresh_token) { return undefined; }
        if (!isExpired(data)) { return data.access_token; }
        try {
            const { clientId, clientSecret } = this._getClientCreds();
            const fresh = await this._refreshAccessToken(clientId, clientSecret, data.refresh_token);
            data.access_token = fresh.access_token;
            data.expires_in = fresh.expires_in || 3599;
            if (fresh.refresh_token) { data.refresh_token = fresh.refresh_token; }
            writeAccount(data);
            this._rebuildSessions();
            return fresh.access_token;
        } catch { return undefined; }
    }

    // ── AuthenticationProvider interface ─────────────────────

    private _tryRestore(): void {
        ensureDirs();
        const data = getActiveAccount();
        if (data?.access_token) {
            this._sessions = [this._makeSession(data)];
            this._onDidChangeSessions.fire({ added: this._sessions, removed: [], changed: [] });
        }
    }

    private _rebuildSessions(): void {
        const old = [...this._sessions];
        const data = getActiveAccount();
        if (data?.access_token) {
            this._sessions = [this._makeSession(data)];
        } else {
            this._sessions = [];
        }
        this._onDidChangeSessions.fire({ added: this._sessions, removed: old, changed: [] });
    }

    private _makeSession(data: AccountData): vscode.AuthenticationSession {
        const displayLabel = data.email ? `${data.label} (${data.email})` : data.label;
        return {
            id: `gmail-${data.label}`,
            accessToken: data.access_token,
            account: { id: data.email || data.label, label: displayLabel },
            scopes: [...GoogleAuthProvider.scopes],
        };
    }

    async getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
        return this._sessions;
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        // Default: add as "personal" if no accounts, otherwise prompt
        const existing = listAccountLabels();
        const label = existing.length === 0 ? 'personal' : await this._promptLabel();
        const account = await this.addAccount(label);
        return this._makeSession(account);
    }

    async removeSession(_sessionId?: string): Promise<void> {
        const label = getActiveLabel();
        if (label) { removeAccount(label); }
        this._rebuildSessions();
    }

    async getAccessToken(): Promise<string | undefined> {
        return this.getAccessTokenFor();
    }

    // ── Internals ───────────────────────────────────────────

    private async _promptLabel(): Promise<string> {
        const input = await vscode.window.showInputBox({
            prompt: 'Give this Gmail account a label (e.g. personal, work, client)',
            placeHolder: 'work',
            validateInput: v => v.trim().length > 0 ? null : 'Label cannot be empty',
        });
        return (input || 'account-' + Date.now()).trim().toLowerCase();
    }

    private _getClientCreds(): { clientId: string; clientSecret: string } {
        const config = vscode.workspace.getConfiguration('gmailConnector');
        let clientId = config.get<string>('clientId') || '';
        let clientSecret = config.get<string>('clientSecret') || '';
        if (!clientId || !clientSecret) {
            const credsFile = path.join(os.homedir(), 'Downloads',
                'client_secret_84524660788-hjerd1r1uakugnkr93are6r7br3mmmjq.apps.googleusercontent.com.json');
            if (fs.existsSync(credsFile)) {
                try {
                    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8')).installed;
                    clientId = creds.client_id;
                    clientSecret = creds.client_secret;
                } catch { /* ignore */ }
            }
        }
        if (!clientId || !clientSecret) {
            throw new Error('Set gmailConnector.clientId/clientSecret in settings.');
        }
        return { clientId, clientSecret };
    }

    private _startOAuthFlow(clientId: string, scopes: readonly string[]): Promise<{ code: string; redirectUri: string }> {
        return new Promise((resolve, reject) => {
            let listenPort = 0;
            const server = http.createServer((req, res) => {
                const parsed = url.parse(req.url || '', true);
                if (parsed.pathname !== '/callback') {
                    res.writeHead(404); res.end('Not found'); return;
                }
                const code = parsed.query.code as string | undefined;
                const error = parsed.query.error as string | undefined;
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                if (code) {
                    res.end(SUCCESS_HTML); server.close();
                    resolve({ code, redirectUri: `http://127.0.0.1:${listenPort}/callback` });
                } else {
                    res.end(FAILURE_HTML(error)); server.close();
                    reject(new Error(error || 'OAuth cancelled'));
                }
            });
            server.listen(0, '127.0.0.1', () => {
                listenPort = (server.address() as any).port;
                const redirectUri = `http://127.0.0.1:${listenPort}/callback`;
                const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
                authUrl.searchParams.set('client_id', clientId);
                authUrl.searchParams.set('redirect_uri', redirectUri);
                authUrl.searchParams.set('response_type', 'code');
                authUrl.searchParams.set('scope', scopes.join(' '));
                authUrl.searchParams.set('access_type', 'offline');
                authUrl.searchParams.set('prompt', 'consent');
                vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
            });
            const timeout = setTimeout(() => { server.close(); reject(new Error('OAuth timed out')); }, 120_000);
            server.on('close', () => clearTimeout(timeout));
        });
    }

    private _exchangeCode(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
        return this._postForm('https://oauth2.googleapis.com/token', {
            client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code',
        });
    }

    private _refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
        return this._postForm('https://oauth2.googleapis.com/token', {
            client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
        });
    }

    private _fetchUserInfo(accessToken: string): Promise<{ email: string; name: string }> {
        return new Promise((resolve, reject) => {
            https.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
            }, (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { reject(new Error('Failed to parse user info')); }
                });
            }).on('error', reject);
        });
    }

    private _postForm(urlStr: string, params: Record<string, string>): Promise<any> {
        return new Promise((resolve, reject) => {
            const body = new URLSearchParams(params).toString();
            const parsed = new URL(urlStr);
            const req = https.request({
                hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
            }, (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) { reject(new Error(json.error_description || json.error)); }
                        else { resolve(json); }
                    } catch { reject(new Error('Failed to parse token response')); }
                });
            });
            req.on('error', reject);
            req.write(body); req.end();
        });
    }
}

const SUCCESS_HTML = `<!DOCTYPE html><html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9}.card{text-align:center;padding:40px;border-radius:12px;background:#161b22;border:1px solid #30363d}.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 8px}p{color:#8b949e}</style></head><body><div class="card"><div class="icon">&#10004;</div><h2>Gmail Connected!</h2><p>You can close this tab and return to VS Code.</p></div></body></html>`;

const FAILURE_HTML = (error?: string | null) => `<!DOCTYPE html><html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9}.card{text-align:center;padding:40px;border-radius:12px;background:#161b22;border:1px solid #30363d}.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 8px}p{color:#8b949e}</style></head><body><div class="card"><div class="icon">&#10008;</div><h2>Connection Failed</h2><p>${error || "Unknown error"}</p></div></body></html>`;
