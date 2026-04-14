"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleAuthProvider = void 0;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const url = __importStar(require("url"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Shared token file at ~/.copilot-gmail/token.json
// Shared across ALL VS Code windows and the Python CLI.
function getGlobalTokenPath() {
    const dir = path.join(os.homedir(), '.copilot-gmail');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'token.json');
}
const GLOBAL_TOKEN_PATH = getGlobalTokenPath();
function readTokenFile() {
    if (fs.existsSync(GLOBAL_TOKEN_PATH)) {
        try {
            const data = JSON.parse(fs.readFileSync(GLOBAL_TOKEN_PATH, 'utf-8'));
            if (data.refresh_token) {
                return data;
            }
        }
        catch { /* ignore */ }
    }
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const wsPath = path.join(workspaceFolders[0].uri.fsPath, 'tools', '.gmail_token.json');
        if (fs.existsSync(wsPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(wsPath, 'utf-8'));
                if (data.refresh_token) {
                    return data;
                }
            }
            catch { /* ignore */ }
        }
    }
    return undefined;
}
function writeTokenFile(data) {
    data.saved_at = Date.now();
    const json = JSON.stringify(data);
    fs.writeFileSync(GLOBAL_TOKEN_PATH, json, 'utf-8');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const wsDir = path.join(workspaceFolders[0].uri.fsPath, 'tools');
        if (fs.existsSync(wsDir)) {
            try {
                fs.writeFileSync(path.join(wsDir, '.gmail_token.json'), json, 'utf-8');
            }
            catch { /* ignore */ }
        }
    }
}
function isExpired(data) {
    if (!data.saved_at || !data.expires_in) {
        return true;
    }
    return Date.now() >= data.saved_at + (data.expires_in * 1000) - 120_000;
}
class GoogleAuthProvider {
    _context;
    static id = 'google-gmail';
    static scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ];
    _onDidChangeSessions = new vscode.EventEmitter();
    onDidChangeSessions = this._onDidChangeSessions.event;
    _sessions = [];
    constructor(_context) {
        this._context = _context;
        this._tryRestore();
    }
    _tryRestore() {
        const data = readTokenFile();
        if (data?.access_token) {
            this._sessions = [this._makeSession(data)];
            this._onDidChangeSessions.fire({ added: this._sessions, removed: [], changed: [] });
        }
    }
    _makeSession(data) {
        return {
            id: 'gmail-shared',
            accessToken: data.access_token,
            account: { id: data.email || 'gmail', label: data.email || 'Gmail' },
            scopes: [...GoogleAuthProvider.scopes],
        };
    }
    async getSessions(_scopes) {
        return this._sessions;
    }
    async createSession(scopes) {
        const { clientId, clientSecret } = this._getClientCreds();
        const { code, redirectUri } = await this._startOAuthFlow(clientId, scopes);
        const tokens = await this._exchangeCode(clientId, clientSecret, code, redirectUri);
        const userInfo = await this._fetchUserInfo(tokens.access_token);
        const tokenData = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in || 3599,
            email: userInfo.email,
        };
        writeTokenFile(tokenData);
        const session = this._makeSession(tokenData);
        this._sessions = [session];
        this._onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
        return session;
    }
    async removeSession(_sessionId) {
        const removed = [...this._sessions];
        this._sessions = [];
        try {
            fs.unlinkSync(GLOBAL_TOKEN_PATH);
        }
        catch { /* ok */ }
        this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
    }
    async getAccessToken() {
        const data = readTokenFile();
        if (!data?.refresh_token) {
            return undefined;
        }
        if (!isExpired(data)) {
            return data.access_token;
        }
        try {
            const { clientId, clientSecret } = this._getClientCreds();
            const fresh = await this._refreshAccessToken(clientId, clientSecret, data.refresh_token);
            data.access_token = fresh.access_token;
            data.expires_in = fresh.expires_in || 3599;
            if (fresh.refresh_token) {
                data.refresh_token = fresh.refresh_token;
            }
            writeTokenFile(data);
            const session = this._makeSession(data);
            this._sessions = [session];
            this._onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
            return fresh.access_token;
        }
        catch {
            return undefined;
        }
    }
    _getClientCreds() {
        const config = vscode.workspace.getConfiguration('gmailConnector');
        let clientId = config.get('clientId') || '';
        let clientSecret = config.get('clientSecret') || '';
        if (!clientId || !clientSecret) {
            const credsFile = path.join(os.homedir(), 'Downloads', 'client_secret_84524660788-hjerd1r1uakugnkr93are6r7br3mmmjq.apps.googleusercontent.com.json');
            if (fs.existsSync(credsFile)) {
                try {
                    const creds = JSON.parse(fs.readFileSync(credsFile, 'utf-8')).installed;
                    clientId = creds.client_id;
                    clientSecret = creds.client_secret;
                }
                catch { /* ignore */ }
            }
        }
        if (!clientId || !clientSecret) {
            throw new Error('Set gmailConnector.clientId/clientSecret in settings.');
        }
        return { clientId, clientSecret };
    }
    _startOAuthFlow(clientId, scopes) {
        return new Promise((resolve, reject) => {
            let listenPort = 0;
            const server = http.createServer((req, res) => {
                const parsed = url.parse(req.url || '', true);
                if (parsed.pathname !== '/callback') {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                const code = parsed.query.code;
                const error = parsed.query.error;
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                if (code) {
                    res.end(SUCCESS_HTML);
                    server.close();
                    resolve({ code, redirectUri: `http://127.0.0.1:${listenPort}/callback` });
                }
                else {
                    res.end(FAILURE_HTML(error));
                    server.close();
                    reject(new Error(error || 'OAuth cancelled'));
                }
            });
            server.listen(0, '127.0.0.1', () => {
                listenPort = server.address().port;
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
    _exchangeCode(clientId, clientSecret, code, redirectUri) {
        return this._postForm('https://oauth2.googleapis.com/token', {
            client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code',
        });
    }
    _refreshAccessToken(clientId, clientSecret, refreshToken) {
        return this._postForm('https://oauth2.googleapis.com/token', {
            client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token',
        });
    }
    _fetchUserInfo(accessToken) {
        return new Promise((resolve, reject) => {
            https.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    }
                    catch {
                        reject(new Error('Failed to parse user info'));
                    }
                });
            }).on('error', reject);
        });
    }
    _postForm(urlStr, params) {
        return new Promise((resolve, reject) => {
            const body = new URLSearchParams(params).toString();
            const parsed = new URL(urlStr);
            const req = https.request({
                hostname: parsed.hostname, path: parsed.pathname, method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(json.error_description || json.error));
                        }
                        else {
                            resolve(json);
                        }
                    }
                    catch {
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
exports.GoogleAuthProvider = GoogleAuthProvider;
const SUCCESS_HTML = `<!DOCTYPE html><html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9}.card{text-align:center;padding:40px;border-radius:12px;background:#161b22;border:1px solid #30363d}.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 8px}p{color:#8b949e}</style></head><body><div class="card"><div class="icon">&#10004;</div><h2>Gmail Connected!</h2><p>You can close this tab and return to VS Code.</p></div></body></html>`;
const FAILURE_HTML = (error) => `<!DOCTYPE html><html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d1117;color:#c9d1d9}.card{text-align:center;padding:40px;border-radius:12px;background:#161b22;border:1px solid #30363d}.icon{font-size:48px;margin-bottom:16px}h2{margin:0 0 8px}p{color:#8b949e}</style></head><body><div class="card"><div class="icon">&#10008;</div><h2>Connection Failed</h2><p>${error || "Unknown error"}</p></div></body></html>`;
//# sourceMappingURL=googleAuthProvider.js.map