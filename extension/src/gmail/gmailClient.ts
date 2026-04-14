import * as https from 'https';
import { GoogleAuthProvider } from '../auth/googleAuthProvider';

// ── Types ───────────────────────────────────────────────────

export interface EmailMessage {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    body: string;
    labelIds: string[];
    isUnread: boolean;
}

export interface GmailLabel {
    id: string;
    name: string;
    type: string;
}

// ── Client ──────────────────────────────────────────────────

export class GmailClient {
    private _tokenOverride?: string;

    constructor(private auth: GoogleAuthProvider) {}

    /** Set a per-request token override (for multi-account operations). */
    useToken(token: string): void { this._tokenOverride = token; }
    /** Clear the token override back to default (active account). */
    clearToken(): void { this._tokenOverride = undefined; }

    async listMessages(query?: string, maxResults = 20): Promise<EmailMessage[]> {
        const token = await this._requireToken();

        const params = new URLSearchParams({ maxResults: String(maxResults) });
        if (query) { params.set('q', query); }

        const list = await this._get(`/gmail/v1/users/me/messages?${params}`, token);
        if (!list.messages?.length) { return []; }

        const messages: EmailMessage[] = [];
        for (const stub of list.messages.slice(0, maxResults)) {
            try {
                const detail = await this._get(`/gmail/v1/users/me/messages/${stub.id}?format=full`, token);
                messages.push(parseMessage(detail));
            } catch { /* skip failed fetches */ }
        }
        return messages;
    }

    async getMessage(id: string): Promise<EmailMessage> {
        const token = await this._requireToken();
        const detail = await this._get(`/gmail/v1/users/me/messages/${id}?format=full`, token);
        return parseMessage(detail);
    }

    async sendEmail(to: string, subject: string, body: string): Promise<void> {
        const token = await this._requireToken();
        const raw = buildRawEmail(to, subject, body);
        await this._post('/gmail/v1/users/me/messages/send', token, { raw });
    }

    async replyToEmail(messageId: string, body: string): Promise<void> {
        const token = await this._requireToken();
        const original = await this.getMessage(messageId);
        const to = original.from;
        const subject = original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`;
        const raw = buildRawEmail(to, subject, body, messageId, original.threadId);
        await this._post('/gmail/v1/users/me/messages/send', token, { raw, threadId: original.threadId });
    }

    async modifyLabels(messageId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void> {
        const token = await this._requireToken();
        await this._post(`/gmail/v1/users/me/messages/${messageId}/modify`, token, { addLabelIds, removeLabelIds });
    }

    async markAsRead(messageId: string): Promise<void> {
        await this.modifyLabels(messageId, [], ['UNREAD']);
    }

    async markAsUnread(messageId: string): Promise<void> {
        await this.modifyLabels(messageId, ['UNREAD'], []);
    }

    async archiveMessage(messageId: string): Promise<void> {
        await this.modifyLabels(messageId, [], ['INBOX']);
    }

    async trashMessage(messageId: string): Promise<void> {
        const token = await this._requireToken();
        await this._post(`/gmail/v1/users/me/messages/${messageId}/trash`, token, {});
    }

    async getLabels(): Promise<GmailLabel[]> {
        const token = await this._requireToken();
        const data = await this._get('/gmail/v1/users/me/labels', token);
        return data.labels || [];
    }

    // ── Internals ───────────────────────────────────────────

    private async _requireToken(): Promise<string> {
        if (this._tokenOverride) { return this._tokenOverride; }
        const token = await this.auth.getAccessToken();
        if (!token) { throw new Error('Not authenticated — connect Gmail first.'); }
        return token;
    }

    private _get(path: string, token: string): Promise<any> {
        return new Promise((resolve, reject) => {
            https.get(`https://www.googleapis.com${path}`, {
                headers: { Authorization: `Bearer ${token}` },
            }, (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) { reject(new Error(json.error.message || JSON.stringify(json.error))); }
                        else { resolve(json); }
                    } catch { reject(new Error('Failed to parse Gmail API response')); }
                });
            }).on('error', reject);
        });
    }

    private _post(path: string, token: string, body: object): Promise<any> {
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
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.error) { reject(new Error(json.error.message || JSON.stringify(json.error))); }
                        else { resolve(json); }
                    } catch { resolve({}); }
                });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
    }
}

// ── Helpers ─────────────────────────────────────────────────

function parseMessage(data: any): EmailMessage {
    const headers: Array<{ name: string; value: string }> = data.payload?.headers || [];
    const hdr = (name: string) =>
        headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    let body = '';
    if (data.payload?.body?.data) {
        body = Buffer.from(data.payload.body.data, 'base64url').toString('utf-8');
    } else if (data.payload?.parts) {
        const textPart = data.payload.parts.find((p: any) => p.mimeType === 'text/plain');
        const htmlPart = data.payload.parts.find((p: any) => p.mimeType === 'text/html');
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

function buildRawEmail(
    to: string, subject: string, body: string,
    inReplyTo?: string, _threadId?: string
): string {
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
