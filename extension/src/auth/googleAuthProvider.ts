import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';

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
    private _refreshToken: string | undefined;

    constructor(private _context: vscode.ExtensionContext) {
        this._restoreSession();
    }

    private async _restoreSession(): Promise<void> {
        const stored = await this._context.secrets.get('gmail-session');
        if (!stored) { return; }
        try {
            const data = JSON.parse(stored);
            this._sessions = [data.session];
            this._refreshToken = data.refreshToken;
            this._onDidChangeSessions.fire({ added: this._sessions, removed: [], changed: [] });
        } catch { /* corrupted data, ignore */ }
    }

    async getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
        return this._sessions;
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        const config = vscode.workspace.getConfiguration('gmailConnector');
        const clientId = config.get<string>('clientId');
        const clientSecret = config.get<string>('clientSecret');

        if (!clientId || !clientSecret) {
            throw new Error(
                'Set gmailConnector.clientId and gmailConnector.clientSecret in VS Code settings first. ' +
                'Run "Gmail: Open Setup Guide" for instructions.'
            );
        }

        const { code, redirectUri } = await this._startOAuthFlow(clientId, scopes);
        const tokens = await this._exchangeCode(clientId, clientSecret, code, redirectUri);
        const userInfo = await this._fetchUserInfo(tokens.access_token);

        const session: vscode.AuthenticationSession = {
            id: crypto.randomUUID(),
            accessToken: tokens.access_token,
            account: { id: userInfo.email, label: userInfo.email },
            scopes: [...scopes],
        };

        this._sessions = [session];
        this._refreshToken = tokens.refresh_token;

        await this._context.secrets.store('gmail-session', JSON.stringify({
            session,
            refreshToken: tokens.refresh_token,
        }));

        this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
        return session;
    }

    async removeSession(_sessionId?: string): Promise<void> {
        const removed = [...this._sessions];
        this._sessions = [];
        this._refreshToken = undefined;
        await this._context.secrets.delete('gmail-session');
        this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
    }

    /**
     * Get a valid access token, refreshing if necessary.
     */
    async getAccessToken(): Promise<string | undefined> {
        if (this._sessions.length > 0) {
            return this._sessions[0].accessToken;
        }

        // Attempt silent refresh
        if (!this._refreshToken) { return undefined; }

        const config = vscode.workspace.getConfiguration('gmailConnector');
        const clientId = config.get<string>('clientId') || '';
        const clientSecret = config.get<string>('clientSecret') || '';
        if (!clientId || !clientSecret) { return undefined; }

        try {
            const tokens = await this._refreshAccessToken(clientId, clientSecret, this._refreshToken);
            const stored = await this._context.secrets.get('gmail-session');
            if (!stored) { return undefined; }

            const data = JSON.parse(stored);
            const session: vscode.AuthenticationSession = {
                ...data.session,
                accessToken: tokens.access_token,
            };
            this._sessions = [session];
            if (tokens.refresh_token) {
                this._refreshToken = tokens.refresh_token;
            }

            await this._context.secrets.store('gmail-session', JSON.stringify({
                session,
                refreshToken: this._refreshToken,
            }));

            return tokens.access_token;
        } catch {
            return undefined;
        }
    }

    // ── OAuth Flow ──────────────────────────────────────────────

    private _startOAuthFlow(clientId: string, scopes: readonly string[]): Promise<{ code: string; redirectUri: string }> {
        return new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                const parsed = url.parse(req.url || '', true);
                if (parsed.pathname !== '/callback') { return; }

                const code = parsed.query.code as string | undefined;
                const error = parsed.query.error as string | undefined;

                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                if (code) {
                    res.end(SUCCESS_HTML);
                    server.close();
                    resolve({ code, redirectUri: `http://127.0.0.1:${(server.address() as any).port}/callback` });
                } else {
                    res.end(FAILURE_HTML(error));
                    server.close();
                    reject(new Error(error || 'OAuth cancelled'));
                }
            });

            server.listen(0, '127.0.0.1', () => {
                const port = (server.address() as any).port;
                const redirectUri = `http://127.0.0.1:${port}/callback`;

                const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
                authUrl.searchParams.set('client_id', clientId);
                authUrl.searchParams.set('redirect_uri', redirectUri);
                authUrl.searchParams.set('response_type', 'code');
                authUrl.searchParams.set('scope', scopes.join(' '));
                authUrl.searchParams.set('access_type', 'offline');
                authUrl.searchParams.set('prompt', 'consent');

                vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
            });

            // Timeout after 2 minutes
            const timeout = setTimeout(() => {
                server.close();
                reject(new Error('OAuth flow timed out after 2 minutes'));
            }, 120_000);

            server.on('close', () => clearTimeout(timeout));
        });
    }

    private _exchangeCode(
        clientId: string, clientSecret: string, code: string, redirectUri: string
    ): Promise<{ access_token: string; refresh_token: string }> {
        return this._postForm('https://oauth2.googleapis.com/token', {
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        });
    }

    private _refreshAccessToken(
        clientId: string, clientSecret: string, refreshToken: string
    ): Promise<{ access_token: string; refresh_token?: string }> {
        return this._postForm('https://oauth2.googleapis.com/token', {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
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
                hostname: parsed.hostname,
                path: parsed.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(body),
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(json.error_description || json.error));
                        } else {
                            resolve(json);
                        }
                    } catch {
                        reject(new Error('Failed to parse token response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}

// ── HTML templates for OAuth callback page ──────────────────

const SUCCESS_HTML = `<!DOCTYPE html><html><head>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9}
.card{text-align:center;padding:40px;border-radius:12px;background:#161b22;border:1px solid #30363d}
.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 8px}p{color:#8b949e}</style>
</head><body><div class="card"><div class="icon">✅</div><h2>Gmail Connected!</h2><p>You can close this tab and return to VS Code.</p></div></body></html>`;

const FAILURE_HTML = (error?: string | null) => `<!DOCTYPE html><html><head>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9}
.card{text-align:center;padding:40px;border-radius:12px;background:#161b22;border:1px solid #30363d}
.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 8px}p{color:#8b949e}</style>
</head><body><div class="card"><div class="icon">❌</div><h2>Connection Failed</h2><p>${error || 'Unknown error'}</p></div></body></html>`;
