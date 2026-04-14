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
exports.registerVercelTools = registerVercelTools;
const vscode = __importStar(require("vscode"));
const https = __importStar(require("https"));
// ── Vercel API Client ───────────────────────────────────────
function getVercelToken() {
    const config = vscode.workspace.getConfiguration('vercelConnector');
    const token = config.get('token') || '';
    if (!token) {
        throw new Error('Set vercelConnector.token in VS Code settings (Vercel → Settings → Tokens).');
    }
    return token;
}
function vercelGet(path, token) {
    return new Promise((resolve, reject) => {
        https.get(`https://api.vercel.com${path}`, {
            headers: { Authorization: `Bearer ${token}` },
        }, res => {
            let data = '';
            res.on('data', (c) => data += c);
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
                    reject(new Error('Failed to parse Vercel response'));
                }
            });
        }).on('error', reject);
    });
}
function vercelPost(path, token, body) {
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
            res.on('data', (c) => data += c);
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
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
function registerVercelTools(context) {
    // ── List Projects ───────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('vercel_list_projects', {
        async invoke(options, _token) {
            const token = getVercelToken();
            const limit = options.input?.limit || 10;
            const data = await vercelGet(`/v9/projects?limit=${limit}`, token);
            const projects = data.projects || [];
            if (!projects.length) {
                return textResult('No Vercel projects found.');
            }
            const lines = projects.map((p) => `- **${p.name}** | Framework: ${p.framework || 'N/A'} | Updated: ${new Date(p.updatedAt).toLocaleDateString()}`);
            return textResult(`Found ${projects.length} Vercel projects:\n\n${lines.join('\n')}`);
        }
    }));
    // ── List Deployments ────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('vercel_list_deployments', {
        async invoke(options, _token) {
            const token = getVercelToken();
            const { projectName, limit } = options.input || {};
            let path = `/v6/deployments?limit=${limit || 10}`;
            if (projectName) {
                path += `&projectId=${encodeURIComponent(projectName)}`;
            }
            const data = await vercelGet(path, token);
            const deps = data.deployments || [];
            if (!deps.length) {
                return textResult('No deployments found.');
            }
            const lines = deps.map((d) => {
                const state = d.readyState || d.state || '?';
                const url = d.url ? `https://${d.url}` : 'N/A';
                return `- **${d.name}** | State: ${state} | URL: ${url} | Created: ${new Date(d.created).toLocaleDateString()}`;
            });
            return textResult(`Found ${deps.length} deployments:\n\n${lines.join('\n')}`);
        }
    }));
    // ── Get Deployment Details ───────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('vercel_deployment_details', {
        async invoke(options, _token) {
            const token = getVercelToken();
            const { deploymentId } = options.input || {};
            if (!deploymentId) {
                return textResult('Provide deploymentId.');
            }
            const d = await vercelGet(`/v13/deployments/${deploymentId}`, token);
            return textResult(`**Deployment Details**\n\n` +
                `- **Name:** ${d.name}\n` +
                `- **URL:** https://${d.url}\n` +
                `- **State:** ${d.readyState || d.state}\n` +
                `- **Created:** ${new Date(d.created).toISOString()}\n` +
                `- **Target:** ${d.target || 'preview'}\n` +
                `- **Git:** ${d.meta?.githubCommitMessage || 'N/A'}\n` +
                `- **Branch:** ${d.meta?.githubCommitRef || 'N/A'}`);
        }
    }));
    // ── List Domains ────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('vercel_list_domains', {
        async invoke(options, _token) {
            const token = getVercelToken();
            const limit = options.input?.limit || 20;
            const data = await vercelGet(`/v5/domains?limit=${limit}`, token);
            const domains = data.domains || [];
            if (!domains.length) {
                return textResult('No domains found.');
            }
            const lines = domains.map((d) => `- **${d.name}** | Verified: ${d.verified ? 'Yes' : 'No'} | Nameservers: ${(d.intendedNameservers || []).join(', ') || 'N/A'}`);
            return textResult(`Found ${domains.length} domains:\n\n${lines.join('\n')}`);
        }
    }));
    // ── List Environment Variables ───────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('vercel_list_env_vars', {
        async invoke(options, _token) {
            const token = getVercelToken();
            const { projectName } = options.input || {};
            if (!projectName) {
                return textResult('Provide projectName.');
            }
            const data = await vercelGet(`/v9/projects/${encodeURIComponent(projectName)}/env`, token);
            const envs = data.envs || [];
            if (!envs.length) {
                return textResult(`No env vars in project ${projectName}.`);
            }
            const lines = envs.map((e) => `- \`${e.key}\` | Target: ${(e.target || []).join(', ')} | Type: ${e.type}`);
            return textResult(`Env vars for **${projectName}**:\n\n${lines.join('\n')}\n\n(Values are hidden for security)`);
        }
    }));
}
//# sourceMappingURL=vercelTools.js.map