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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const googleAuthProvider_1 = require("./auth/googleAuthProvider");
const gmailClient_1 = require("./gmail/gmailClient");
const gmailTreeProvider_1 = require("./gmail/gmailTreeProvider");
const gmailParticipant_1 = require("./chat/gmailParticipant");
let gmailClient;
function activate(context) {
    const authProvider = new googleAuthProvider_1.GoogleAuthProvider(context);
    gmailClient = new gmailClient_1.GmailClient(authProvider);
    const treeProvider = new gmailTreeProvider_1.GmailTreeProvider(gmailClient);
    // Register Google auth provider
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider(googleAuthProvider_1.GoogleAuthProvider.id, 'Google (Gmail)', authProvider, { supportsMultipleAccounts: false }));
    // Register sidebar tree view
    context.subscriptions.push(vscode.window.createTreeView('gmail-inbox', {
        treeDataProvider: treeProvider,
        showCollapseAll: false,
    }));
    // ── Commands ────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('gmail-connector.connect', async () => {
        try {
            const session = await vscode.authentication.getSession(googleAuthProvider_1.GoogleAuthProvider.id, googleAuthProvider_1.GoogleAuthProvider.scopes, { createIfNone: true });
            if (session) {
                vscode.window.showInformationMessage(`Gmail connected as ${session.account.label}`);
                treeProvider.refresh();
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Gmail connection failed: ${e.message}`);
        }
    }), vscode.commands.registerCommand('gmail-connector.disconnect', async () => {
        await authProvider.removeSession();
        treeProvider.refresh();
        vscode.window.showInformationMessage('Gmail disconnected.');
    }), vscode.commands.registerCommand('gmail-connector.refresh', () => {
        treeProvider.refresh();
    }), vscode.commands.registerCommand('gmail-connector.compose', async () => {
        const to = await vscode.window.showInputBox({
            prompt: 'To (email address)',
            placeHolder: 'user@example.com',
            validateInput: v => v.includes('@') ? null : 'Enter a valid email',
        });
        if (!to) {
            return;
        }
        const subject = await vscode.window.showInputBox({ prompt: 'Subject' });
        if (subject === undefined) {
            return;
        }
        const body = await vscode.window.showInputBox({
            prompt: 'Message body',
            placeHolder: 'Type your message…',
        });
        if (body === undefined) {
            return;
        }
        try {
            await gmailClient.sendEmail(to, subject, body);
            vscode.window.showInformationMessage(`Email sent to ${to}`);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to send: ${e.message}`);
        }
    }), vscode.commands.registerCommand('gmail-connector.readEmail', async (item) => {
        const messageId = item?.messageId;
        if (!messageId) {
            return;
        }
        try {
            const email = await gmailClient.getMessage(messageId);
            await gmailClient.markAsRead(messageId);
            const panel = vscode.window.createWebviewPanel('gmailEmail', email.subject || 'Email', vscode.ViewColumn.One, { enableScripts: false });
            panel.webview.html = renderEmailWebview(email);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to read email: ${e.message}`);
        }
    }), vscode.commands.registerCommand('gmail-connector.openSetup', () => {
        const setupUri = vscode.Uri.joinPath(context.extensionUri, 'SETUP.md');
        vscode.commands.executeCommand('markdown.showPreview', setupUri);
    }));
    // ── Copilot Chat Participant ────────────────────────────
    (0, gmailParticipant_1.registerGmailParticipant)(context, gmailClient);
}
function deactivate() {
    gmailClient = undefined;
}
// ── Email Webview Renderer ──────────────────────────────────
function renderEmailWebview(email) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family, system-ui); padding: 24px; color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
  .header { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 16px; margin-bottom: 20px; }
  .subject { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
  .meta { font-size: 13px; color: var(--vscode-descriptionForeground); margin: 4px 0; }
  .meta strong { color: var(--vscode-foreground); }
  .labels { margin-top: 8px; }
  .label { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); margin-right: 4px; }
  .body { font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
</style></head><body>
  <div class="header">
    <h1 class="subject">${esc(email.subject || '(no subject)')}</h1>
    <div class="meta"><strong>From:</strong> ${esc(email.from)}</div>
    <div class="meta"><strong>To:</strong> ${esc(email.to)}</div>
    <div class="meta"><strong>Date:</strong> ${esc(email.date)}</div>
    <div class="labels">${email.labelIds.map(l => `<span class="label">${esc(l)}</span>`).join('')}</div>
  </div>
  <div class="body">${esc(email.body || '(empty)')}</div>
</body></html>`;
}
//# sourceMappingURL=extension.js.map