import * as vscode from 'vscode';
import { GoogleAuthProvider } from './auth/googleAuthProvider';
import { GmailClient } from './gmail/gmailClient';
import { GmailTreeProvider } from './gmail/gmailTreeProvider';
import { registerGmailParticipant } from './chat/gmailParticipant';
import { registerGmailTools } from './tools/gmailTools';
import { registerAwsTools } from './tools/awsTools';
import { registerVercelTools } from './tools/vercelTools';
import { registerMemoryTools } from './tools/memoryTools';
import { registerSessionTools } from './tools/sessionTools';

let gmailClient: GmailClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const authProvider = new GoogleAuthProvider(context);
    gmailClient = new GmailClient(authProvider);
    const treeProvider = new GmailTreeProvider(gmailClient);

    // Register Google auth provider
    context.subscriptions.push(
        vscode.authentication.registerAuthenticationProvider(
            GoogleAuthProvider.id,
            'Google (Gmail)',
            authProvider,
            { supportsMultipleAccounts: false }
        )
    );

    // Register sidebar tree view
    context.subscriptions.push(
        vscode.window.createTreeView('gmail-inbox', {
            treeDataProvider: treeProvider,
            showCollapseAll: false,
        })
    );

    // ── Commands ────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('gmail-connector.connect', async () => {
            try {
                const session = await vscode.authentication.getSession(
                    GoogleAuthProvider.id,
                    GoogleAuthProvider.scopes,
                    { createIfNone: true }
                );
                if (session) {
                    vscode.window.showInformationMessage(`Gmail connected as ${session.account.label}`);
                    treeProvider.refresh();
                }
            } catch (e: any) {
                vscode.window.showErrorMessage(`Gmail connection failed: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('gmail-connector.disconnect', async () => {
            await authProvider.removeSession();
            treeProvider.refresh();
            vscode.window.showInformationMessage('Gmail disconnected.');
        }),

        vscode.commands.registerCommand('gmail-connector.refresh', () => {
            treeProvider.refresh();
        }),

        vscode.commands.registerCommand('gmail-connector.compose', async () => {
            const to = await vscode.window.showInputBox({
                prompt: 'To (email address)',
                placeHolder: 'user@example.com',
                validateInput: v => v.includes('@') ? null : 'Enter a valid email',
            });
            if (!to) { return; }

            const subject = await vscode.window.showInputBox({ prompt: 'Subject' });
            if (subject === undefined) { return; }

            const body = await vscode.window.showInputBox({
                prompt: 'Message body',
                placeHolder: 'Type your message…',
            });
            if (body === undefined) { return; }

            try {
                await gmailClient!.sendEmail(to, subject, body);
                vscode.window.showInformationMessage(`Email sent to ${to}`);
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to send: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('gmail-connector.readEmail', async (item?: { messageId?: string }) => {
            const messageId = item?.messageId;
            if (!messageId) { return; }

            try {
                const email = await gmailClient!.getMessage(messageId);
                await gmailClient!.markAsRead(messageId);

                const panel = vscode.window.createWebviewPanel(
                    'gmailEmail',
                    email.subject || 'Email',
                    vscode.ViewColumn.One,
                    { enableScripts: false }
                );
                panel.webview.html = renderEmailWebview(email);
            } catch (e: any) {
                vscode.window.showErrorMessage(`Failed to read email: ${e.message}`);
            }
        }),

        vscode.commands.registerCommand('gmail-connector.openSetup', () => {
            const setupUri = vscode.Uri.joinPath(context.extensionUri, 'SETUP.md');
            vscode.commands.executeCommand('markdown.showPreview', setupUri);
        }),
    );

    // ── Copilot Chat Participant ────────────────────────────

    registerGmailParticipant(context, gmailClient);

    // ── Language Model Tools (show in Copilot tool picker) ──

    registerGmailTools(context, gmailClient, authProvider);
    registerAwsTools(context);
    registerVercelTools(context);
    registerMemoryTools(context);
    registerSessionTools(context);

    // ── Status Bar: Active Gmail Account ────────────────────

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    statusBar.command = 'gmail-connector.quickSwitch';
    context.subscriptions.push(statusBar);

    function updateStatusBar(): void {
        const accounts = authProvider.listAccounts();
        const active = accounts.find(a => a.active);
        if (active) {
            statusBar.text = `$(mail) ${active.label}`;
            statusBar.tooltip = `Gmail: ${active.email}\n${accounts.length} account(s) connected — click to switch`;
        } else {
            statusBar.text = '$(mail) No Gmail';
            statusBar.tooltip = 'Click to connect a Gmail account';
        }
        statusBar.show();
    }

    updateStatusBar();

    // Refresh status bar command (called by tools after switching)
    context.subscriptions.push(
        vscode.commands.registerCommand('gmail-connector.refreshStatusBar', () => {
            updateStatusBar();
        })
    );

    // Quick-pick account switcher
    context.subscriptions.push(
        vscode.commands.registerCommand('gmail-connector.quickSwitch', async () => {
            const accounts = authProvider.listAccounts();

            interface AccountItem extends vscode.QuickPickItem { accountLabel?: string; action?: string; }
            const items: AccountItem[] = accounts.map(a => ({
                label: `${a.active ? '$(check) ' : '     '}${a.label}`,
                description: a.email,
                detail: a.active ? 'Currently active' : undefined,
                accountLabel: a.label,
            }));
            items.push({ label: '$(add) Add new account...', description: '', action: 'add' });
            if (accounts.length > 0) {
                items.push({ label: '$(trash) Remove an account...', description: '', action: 'remove' });
            }

            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: accounts.length > 0 ? 'Switch Gmail account' : 'No accounts — add one',
                title: 'Gmail Accounts',
            }) as AccountItem | undefined;

            if (!pick) { return; }

            if (pick.action === 'add') {
                vscode.commands.executeCommand('gmail-connector.connect');
                return;
            }

            if (pick.action === 'remove') {
                const removeItems = accounts.map(a => ({
                    label: a.label,
                    description: a.email,
                    detail: a.active ? 'Active account' : undefined,
                }));
                const removePick = await vscode.window.showQuickPick(removeItems, {
                    placeHolder: 'Select account to remove',
                    title: 'Remove Gmail Account',
                });
                if (removePick) {
                    const confirm = await vscode.window.showWarningMessage(
                        `Remove Gmail account "${removePick.label}" (${removePick.description})?`,
                        { modal: true },
                        'Remove'
                    );
                    if (confirm === 'Remove') {
                        authProvider.removeAccountByLabel(removePick.label);
                        updateStatusBar();
                        vscode.window.showInformationMessage(`Gmail account "${removePick.label}" removed.`);
                    }
                }
                return;
            }

            if (pick.accountLabel) {
                const switched = authProvider.switchAccount(pick.accountLabel);
                if (switched) {
                    updateStatusBar();
                    vscode.window.showInformationMessage(`Gmail: switched to ${switched.label} (${switched.email})`);
                }
            }
        })
    );
}

export function deactivate(): void {
    gmailClient = undefined;
}

// ── Email Webview Renderer ──────────────────────────────────

function renderEmailWebview(email: {
    subject: string; from: string; to: string; date: string; body: string; labelIds: string[];
}): string {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
