import * as vscode from 'vscode';
import * as https from 'https';
import { memorySnapshot } from '../memory/memoryStore';
import { logToolCall } from '../session/sessionStore';

// ── Vercel API Client ───────────────────────────────────────

function getVercelToken(): string {
    const config = vscode.workspace.getConfiguration('vercelConnector');
    const token = config.get<string>('token') || '';
    if (!token) {
        throw new Error('Set vercelConnector.token in VS Code settings (Vercel → Settings → Tokens).');
    }
    return token;
}

function vercelGet(path: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
        https.get(`https://api.vercel.com${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        }, res => {
            let data = '';
            res.on('data', (c: string) => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) { reject(new Error(json.error.message || JSON.stringify(json.error))); }
                    else { resolve(json); }
                } catch { reject(new Error('Failed to parse Vercel response')); }
            });
        }).on('error', reject);
    });
}

function vercelPost(path: string, token: string, body: object): Promise<any> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const parsed = new URL(`https://api.vercel.com${path}`);
        const req = https.request({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload).toString(),
            },
        }, res => {
            let data = '';
            res.on('data', (c: string) => data += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) { reject(new Error(json.error.message || JSON.stringify(json.error))); }
                    else { resolve(json); }
                } catch { resolve(data); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(memorySnapshot() + text)]);
}

function logged<T>(toolName: string, fn: (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken) => Promise<vscode.LanguageModelToolResult>) {
    return async (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> => {
        const result = await fn(options, token);
        const text = (result.content[0] as any)?.value || '';
        logToolCall(toolName, options.input as any, text);
        return result;
    };
}

export function registerVercelTools(context: vscode.ExtensionContext): void {

    // ── List Projects ───────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('vercel_list_projects', {
            invoke: logged('vercel_list_projects', async (options: vscode.LanguageModelToolInvocationOptions<{ limit?: number }>, _token) => {
                const token = getVercelToken();
                const limit = options.input?.limit || 10;
                const data = await vercelGet(`/v9/projects?limit=${limit}`, token);
                const projects = data.projects || [];
                if (!projects.length) { return textResult('No Vercel projects found.'); }
                const lines = projects.map((p: any) =>
                    `- **${p.name}** | Framework: ${p.framework || 'N/A'} | Updated: ${new Date(p.updatedAt).toLocaleDateString()}`
                );
                return textResult(`Found ${projects.length} Vercel projects:\n\n${lines.join('\n')}`);
            })
        })
    );

    // ── List Deployments ────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('vercel_list_deployments', {
            invoke: logged('vercel_list_deployments', async (options: vscode.LanguageModelToolInvocationOptions<{ projectName?: string; limit?: number }>, _token) => {
                const token = getVercelToken();
                const { projectName, limit } = options.input || {} as any;
                let path = `/v6/deployments?limit=${limit || 10}`;
                if (projectName) { path += `&projectId=${encodeURIComponent(projectName)}`; }
                const data = await vercelGet(path, token);
                const deps = data.deployments || [];
                if (!deps.length) { return textResult('No deployments found.'); }
                const lines = deps.map((d: any) => {
                    const state = d.readyState || d.state || '?';
                    const url = d.url ? `https://${d.url}` : 'N/A';
                    return `- **${d.name}** | State: ${state} | URL: ${url} | Created: ${new Date(d.created).toLocaleDateString()}`;
                });
                return textResult(`Found ${deps.length} deployments:\n\n${lines.join('\n')}`);
            })
        })
    );

    // ── Get Deployment Details ───────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('vercel_deployment_details', {
            invoke: logged('vercel_deployment_details', async (options: vscode.LanguageModelToolInvocationOptions<{ deploymentId: string }>, _token) => {
                const token = getVercelToken();
                const { deploymentId } = options.input || {} as any;
                if (!deploymentId) { return textResult('Provide deploymentId.'); }
                const d = await vercelGet(`/v13/deployments/${deploymentId}`, token);
                return textResult(
                    `**Deployment Details**\n\n` +
                    `- **Name:** ${d.name}\n` +
                    `- **URL:** https://${d.url}\n` +
                    `- **State:** ${d.readyState || d.state}\n` +
                    `- **Created:** ${new Date(d.created).toISOString()}\n` +
                    `- **Target:** ${d.target || 'preview'}\n` +
                    `- **Git:** ${d.meta?.githubCommitMessage || 'N/A'}\n` +
                    `- **Branch:** ${d.meta?.githubCommitRef || 'N/A'}`
                );
            })
        })
    );

    // ── List Domains ────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('vercel_list_domains', {
            invoke: logged('vercel_list_domains', async (options: vscode.LanguageModelToolInvocationOptions<{ limit?: number }>, _token) => {
                const token = getVercelToken();
                const limit = options.input?.limit || 20;
                const data = await vercelGet(`/v5/domains?limit=${limit}`, token);
                const domains = data.domains || [];
                if (!domains.length) { return textResult('No domains found.'); }
                const lines = domains.map((d: any) =>
                    `- **${d.name}** | Verified: ${d.verified ? 'Yes' : 'No'} | Nameservers: ${(d.intendedNameservers || []).join(', ') || 'N/A'}`
                );
                return textResult(`Found ${domains.length} domains:\n\n${lines.join('\n')}`);
            })
        })
    );

    // ── List Environment Variables ───────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('vercel_list_env_vars', {
            invoke: logged('vercel_list_env_vars', async (options: vscode.LanguageModelToolInvocationOptions<{ projectName: string }>, _token) => {
                const token = getVercelToken();
                const { projectName } = options.input || {} as any;
                if (!projectName) { return textResult('Provide projectName.'); }
                const data = await vercelGet(`/v9/projects/${encodeURIComponent(projectName)}/env`, token);
                const envs = data.envs || [];
                if (!envs.length) { return textResult(`No env vars in project ${projectName}.`); }
                const lines = envs.map((e: any) =>
                    `- \`${e.key}\` | Target: ${(e.target || []).join(', ')} | Type: ${e.type}`
                );
                return textResult(`Env vars for **${projectName}**:\n\n${lines.join('\n')}\n\n(Values are hidden for security)`);
            })
        })
    );
}
