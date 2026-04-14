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
exports.ghRequest = ghRequest;
const https = __importStar(require("https"));
const vscode = __importStar(require("vscode"));
// ── GitHub REST API client (pure Node.js, zero deps) ────────
function getToken() {
    const config = vscode.workspace.getConfiguration('githubConnector');
    const token = config.get('token') || process.env.GITHUB_TOKEN || '';
    if (!token) {
        throw new Error('Set githubConnector.token in VS Code settings or GITHUB_TOKEN env var. ' +
            'Create a token at https://github.com/settings/tokens with repo, read:org scopes.');
    }
    return token;
}
function ghRequest(method, urlPath, body) {
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
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => {
                if (!res.statusCode || res.statusCode >= 400) {
                    let msg = `GitHub API ${res.statusCode}: ${urlPath}`;
                    try {
                        msg += ' — ' + JSON.parse(data).message;
                    }
                    catch { /* ignore */ }
                    reject(new Error(msg));
                    return;
                }
                try {
                    resolve(data ? JSON.parse(data) : {});
                }
                catch {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}
//# sourceMappingURL=githubClient.js.map