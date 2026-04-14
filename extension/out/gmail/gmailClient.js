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
exports.GmailClient = void 0;
const https = __importStar(require("https"));
// ── Client ──────────────────────────────────────────────────
class GmailClient {
    auth;
    _tokenOverride;
    constructor(auth) {
        this.auth = auth;
    }
    /** Set a per-request token override (for multi-account operations). */
    useToken(token) { this._tokenOverride = token; }
    /** Clear the token override back to default (active account). */
    clearToken() { this._tokenOverride = undefined; }
    async listMessages(query, maxResults = 20) {
        const token = await this._requireToken();
        const params = new URLSearchParams({ maxResults: String(maxResults) });
        if (query) {
            params.set('q', query);
        }
        const list = await this._get(`/gmail/v1/users/me/messages?${params}`, token);
        if (!list.messages?.length) {
            return [];
        }
        const messages = [];
        for (const stub of list.messages.slice(0, maxResults)) {
            try {
                const detail = await this._get(`/gmail/v1/users/me/messages/${stub.id}?format=full`, token);
                messages.push(parseMessage(detail));
            }
            catch { /* skip failed fetches */ }
        }
        return messages;
    }
    async getMessage(id) {
        const token = await this._requireToken();
        const detail = await this._get(`/gmail/v1/users/me/messages/${id}?format=full`, token);
        return parseMessage(detail);
    }
    async sendEmail(to, subject, body) {
        const token = await this._requireToken();
        const raw = buildRawEmail(to, subject, body);
        await this._post('/gmail/v1/users/me/messages/send', token, { raw });
    }
    async replyToEmail(messageId, body) {
        const token = await this._requireToken();
        const original = await this.getMessage(messageId);
        const to = original.from;
        const subject = original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`;
        const raw = buildRawEmail(to, subject, body, messageId, original.threadId);
        await this._post('/gmail/v1/users/me/messages/send', token, { raw, threadId: original.threadId });
    }
    async modifyLabels(messageId, addLabelIds, removeLabelIds) {
        const token = await this._requireToken();
        await this._post(`/gmail/v1/users/me/messages/${messageId}/modify`, token, { addLabelIds, removeLabelIds });
    }
    async markAsRead(messageId) {
        await this.modifyLabels(messageId, [], ['UNREAD']);
    }
    async markAsUnread(messageId) {
        await this.modifyLabels(messageId, ['UNREAD'], []);
    }
    async archiveMessage(messageId) {
        await this.modifyLabels(messageId, [], ['INBOX']);
    }
    async trashMessage(messageId) {
        const token = await this._requireToken();
        await this._post(`/gmail/v1/users/me/messages/${messageId}/trash`, token, {});
    }
    async getLabels() {
        const token = await this._requireToken();
        const data = await this._get('/gmail/v1/users/me/labels', token);
        return data.labels || [];
    }
    // ── Internals ───────────────────────────────────────────
    async _requireToken() {
        if (this._tokenOverride) {
            return this._tokenOverride;
        }
        const token = await this.auth.getAccessToken();
        if (!token) {
            throw new Error('Not authenticated — connect Gmail first.');
        }
        return token;
    }
    _get(path, token) {
        return new Promise((resolve, reject) => {
            https.get(`https://www.googleapis.com${path}`, {
                headers: { Authorization: `Bearer ${token}` },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(json.error.message || JSON.stringify(json.error)));
                        }
                        else {
                            resolve(json);
                        }
                    }
                    catch {
                        reject(new Error('Failed to parse Gmail API response'));
                    }
                });
            }).on('error', reject);
        });
    }
    _post(path, token, body) {
        return new Promise((resolve, reject) => {
            const payload = JSON.stringify(body);
            const parsed = new URL(`https://www.googleapis.com${path}`);
            const req = https.request({
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) {
                            reject(new Error(json.error.message || JSON.stringify(json.error)));
                        }
                        else {
                            resolve(json);
                        }
                    }
                    catch {
                        resolve({});
                    }
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
}
exports.GmailClient = GmailClient;
// ── Helpers ─────────────────────────────────────────────────
function parseMessage(data) {
    const headers = data.payload?.headers || [];
    const hdr = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    let body = '';
    if (data.payload?.body?.data) {
        body = Buffer.from(data.payload.body.data, 'base64url').toString('utf-8');
    }
    else if (data.payload?.parts) {
        const textPart = data.payload.parts.find((p) => p.mimeType === 'text/plain');
        const htmlPart = data.payload.parts.find((p) => p.mimeType === 'text/html');
        const part = textPart || htmlPart;
        if (part?.body?.data) {
            body = Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }
    }
    return {
        id: data.id,
        threadId: data.threadId,
        subject: hdr('Subject'),
        from: hdr('From'),
        to: hdr('To'),
        date: hdr('Date'),
        snippet: data.snippet || '',
        body,
        labelIds: data.labelIds || [],
        isUnread: (data.labelIds || []).includes('UNREAD'),
    };
}
function buildRawEmail(to, subject, body, inReplyTo, _threadId) {
    const lines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'MIME-Version: 1.0',
    ];
    if (inReplyTo) {
        lines.push(`In-Reply-To: ${inReplyTo}`);
        lines.push(`References: ${inReplyTo}`);
    }
    lines.push('', body);
    return Buffer.from(lines.join('\r\n')).toString('base64url');
}
//# sourceMappingURL=gmailClient.js.map