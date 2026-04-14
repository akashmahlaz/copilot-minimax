import * as https from 'https';
import * as vscode from 'vscode';

// ── GitHub REST API client (pure Node.js, zero deps) ────────

function getToken(): string {
    const config = vscode.workspace.getConfiguration('githubConnector');
    const token = config.get<string>('token') || process.env.GITHUB_TOKEN || '';
    if (!token) {
        throw new Error(
            'Set githubConnector.token in VS Code settings or GITHUB_TOKEN env var. ' +
            'Create a token at https://github.com/settings/tokens with repo, read:org scopes.'
        );
    }
    return token;
}

export function ghRequest(method: string, urlPath: string, body?: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const req = https.request({
            hostname: 'api.github.com',
            path: urlPath,
            method,
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'copilot-minimax-extension',
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) {
                    let msg = `GitHub API ${res.statusCode}: ${urlPath}`;
                    try { msg += ' — ' + JSON.parse(data).message; } catch { /* ignore */ }
                    reject(new Error(msg));
                    return;
                }
                try {
                    resolve(data ? JSON.parse(data) : {});
                } catch {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (payload) { req.write(payload); }
        req.end();
    });
}
