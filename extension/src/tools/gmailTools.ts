import * as vscode from 'vscode';
import { GmailClient } from '../gmail/gmailClient';
import { GoogleAuthProvider } from '../auth/googleAuthProvider';
import { memorySnapshot } from '../memory/memoryStore';
import { logToolCall } from '../session/sessionStore';

// ── Helpers ─────────────────────────────────────────────────

/** Returns a summary of all connected accounts — prepended to every tool response
 *  so the LLM always knows what accounts exist, even in a fresh window. */
function accountContext(authProvider: GoogleAuthProvider): string {
    const accounts = authProvider.listAccounts();
    if (accounts.length === 0) {
        return '📧 **No Gmail accounts connected.** Use gmail_add_account to add one.\n\n---\n\n';
    }
    const parts = accounts.map(a => {
        const marker = a.active ? ' ✅' : '';
        return `${a.label} (${a.email})${marker}`;
    });
    return `📧 **Accounts:** ${parts.join(' · ')}\n\n---\n\n`;
}

/** Use a specific account's token for one operation, then restore. */
async function withAccount(
    authProvider: GoogleAuthProvider,
    client: GmailClient,
    label: string | undefined,
    fn: () => Promise<string>,
): Promise<string> {
    const usedLabel = label || authProvider.getActiveAccountLabel() || '?';
    if (label) {
        const token = await authProvider.getAccessTokenFor(label);
        if (!token) { throw new Error(`Account "${label}" not found or expired. Use gmail_list_accounts to see available.`); }
        client.useToken(token);
    }
    try {
        return await fn();
    } finally {
        client.clearToken();
    }
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(memorySnapshot() + text)]);
}

/** Wrap a tool invoke function to automatically log the call to session store. */
function logged<T>(toolName: string, fn: (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken) => Promise<vscode.LanguageModelToolResult>) {
    return async (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> => {
        const result = await fn(options, token);
        const text = (result.content[0] as any)?.value || '';
        logToolCall(toolName, options.input as any, text);
        return result;
    };
}

// ── Tool Registration ───────────────────────────────────────

export function registerGmailTools(context: vscode.ExtensionContext, client: GmailClient, authProvider: GoogleAuthProvider): void {

    // ── Add Gmail Account ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_add_account', {
            invoke: logged('gmail_add_account', async (options: vscode.LanguageModelToolInvocationOptions<{ label: string }>, _token) => {
                const label = options.input?.label;
                if (!label) {
                    return textResult(accountContext(authProvider) + 'Please provide a label for this account (e.g. "personal", "work", "client").');
                }
                try {
                    const account = await authProvider.addAccount(label.trim().toLowerCase());
                    return textResult(
                        accountContext(authProvider) +
                        `✅ Gmail account added!\n\n` +
                        `- **Label:** ${account.label}\n` +
                        `- **Email:** ${account.email}\n` +
                        `- **Status:** Active (now the default account)\n\n` +
                        `You can add more accounts with different labels, and switch between them.`
                    );
                } catch (e: any) {
                    return textResult(accountContext(authProvider) + `Failed to add account: ${e.message}`);
                }
            })
        })
    );

    // ── List All Accounts ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_list_accounts', {
            invoke: logged('gmail_list_accounts', async (_options, _token) => {
                const accounts = authProvider.listAccounts();
                if (accounts.length === 0) {
                    return textResult('📧 **No Gmail accounts connected.** Use gmail_add_account to add one.');
                }
                const lines = accounts.map(a => {
                    const marker = a.active ? ' ← **ACTIVE**' : '';
                    return `- **${a.label}** → ${a.email}${marker}`;
                });
                return textResult(
                    `📧 **Connected Gmail accounts (${accounts.length}):**\n\n${lines.join('\n')}\n\n` +
                    `Use gmail_switch_account to change the active account, or pass \`account: "label"\` to any Gmail tool.`
                );
            })
        })
    );

    // ── Switch Account ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_switch_account', {
            invoke: logged('gmail_switch_account', async (options: vscode.LanguageModelToolInvocationOptions<{ label: string }>, _token) => {
                const label = options.input?.label;
                if (!label) {
                    const accounts = authProvider.listAccounts();
                    const labels = accounts.map(a => `"${a.label}" (${a.email})`).join(', ');
                    return textResult(accountContext(authProvider) + `Provide a label to switch to. Available: ${labels}`);
                }
                const account = authProvider.switchAccount(label.trim().toLowerCase());
                if (account) {
                    // Fire status bar update
                    vscode.commands.executeCommand('gmail-connector.refreshStatusBar');
                    return textResult(accountContext(authProvider) + `Switched to **${account.label}** (${account.email}). All Gmail tools now use this account by default.`);
                }
                return textResult(accountContext(authProvider) + `Account "${label}" not found. Use gmail_list_accounts to see available accounts.`);
            })
        })
    );

    // ── Remove Account ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_remove_account', {
            invoke: logged('gmail_remove_account', async (options: vscode.LanguageModelToolInvocationOptions<{ label: string }>, _token) => {
                const label = options.input?.label;
                if (!label) {
                    return textResult(accountContext(authProvider) + 'Provide the label of the account to remove.');
                }
                authProvider.removeAccountByLabel(label.trim().toLowerCase());
                vscode.commands.executeCommand('gmail-connector.refreshStatusBar');
                return textResult(accountContext(authProvider) + `Account "${label}" removed.`);
            })
        })
    );

    // ── Connection Status ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_connection_status', {
            invoke: logged('gmail_connection_status', async (_options, _token) => {
                const accounts = authProvider.listAccounts();
                if (accounts.length === 0) {
                    return textResult('📧 **No Gmail accounts connected.** Use gmail_add_account to add one.\n\nAccounts are stored globally at ~/.copilot-gmail/ and persist across all VS Code windows.');
                }
                const active = accounts.find(a => a.active);
                const lines = accounts.map(a => {
                    const marker = a.active ? ' ← ACTIVE' : '';
                    return `- **${a.label}** → ${a.email}${marker}`;
                });
                return textResult(
                    `**Active account:** ${active?.label} (${active?.email})\n` +
                    `**All accounts (${accounts.length}):**\n${lines.join('\n')}\n\n` +
                    `Accounts are stored globally and persist across all VS Code windows.`
                );
            })
        })
    );

    // ── Check Inbox ─────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_check_inbox', {
            invoke: logged('gmail_check_inbox', async (options: vscode.LanguageModelToolInvocationOptions<{ maxResults?: number; query?: string; account?: string }>, _token: vscode.CancellationToken) => {
                const account = options.input?.account;
                const max = options.input?.maxResults ?? 15;
                const query = options.input?.query || 'in:inbox';
                const usedLabel = account || authProvider.getActiveAccountLabel();

                const result = await withAccount(authProvider, client, account, async () => {
                    const messages = await client.listMessages(query, max);
                    if (messages.length === 0) {
                        return `No emails found in inbox.`;
                    }
                    const lines = messages.map((msg, i) => {
                        const unread = msg.isUnread ? '[UNREAD] ' : '';
                        const from = msg.from.replace(/<.*>/, '').trim();
                        return `${i + 1}. ${unread}**${msg.subject || '(no subject)'}**\n   From: ${from} | Date: ${msg.date}\n   ${msg.snippet.substring(0, 120)}\n   ID: ${msg.id}`;
                    });
                    return `**${usedLabel}** — ${messages.length} emails:\n\n${lines.join('\n\n')}\n\nUse gmail_read_email with a message ID to read full content.`;
                });

                return textResult(accountContext(authProvider) + result);
            })
        })
    );

    // ── Search Emails ───────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_search_emails', {
            invoke: logged('gmail_search_emails', async (options: vscode.LanguageModelToolInvocationOptions<{ query: string; maxResults?: number; account?: string }>, _token: vscode.CancellationToken) => {
                const account = options.input?.account;
                const query = options.input?.query || '';
                const max = options.input?.maxResults ?? 10;
                const usedLabel = account || authProvider.getActiveAccountLabel();

                if (!query) { return textResult(accountContext(authProvider) + 'Please provide a search query.'); }

                const result = await withAccount(authProvider, client, account, async () => {
                    const messages = await client.listMessages(query, max);
                    if (messages.length === 0) {
                        return `No emails found for: ${query}`;
                    }
                    const lines = messages.map((msg, i) => {
                        const from = msg.from.replace(/<.*>/, '').trim();
                        return `${i + 1}. **${msg.subject || '(no subject)'}**\n   From: ${from} | Date: ${msg.date}\n   ${msg.snippet.substring(0, 120)}\n   ID: ${msg.id}`;
                    });
                    return `🔍 **${usedLabel}** — search "${query}" — ${messages.length} results:\n\n${lines.join('\n\n')}`;
                });

                return textResult(accountContext(authProvider) + result);
            })
        })
    );

    // ── Read Email ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_read_email', {
            invoke: logged('gmail_read_email', async (options: vscode.LanguageModelToolInvocationOptions<{ messageId: string; account?: string }>, _token: vscode.CancellationToken) => {
                const account = options.input?.account;
                const id = options.input?.messageId;
                if (!id) { return textResult(accountContext(authProvider) + 'Please provide a messageId.'); }
                const usedLabel = account || authProvider.getActiveAccountLabel();

                const result = await withAccount(authProvider, client, account, async () => {
                    const email = await client.getMessage(id);
                    await client.markAsRead(id);
                    return (
                        `📧 **${usedLabel}** account\n\n` +
                        `**Subject:** ${email.subject || '(no subject)'}\n` +
                        `**From:** ${email.from}\n` +
                        `**To:** ${email.to}\n` +
                        `**Date:** ${email.date}\n` +
                        `**Labels:** ${email.labelIds.join(', ')}\n\n` +
                        `---\n\n${email.body || '(empty body)'}\n\n---\n` +
                        `Message ID: ${email.id} | Thread ID: ${email.threadId}`
                    );
                });

                return textResult(accountContext(authProvider) + result);
            })
        })
    );

    // ── Send Email ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_send_email', {
            invoke: logged('gmail_send_email', async (options: vscode.LanguageModelToolInvocationOptions<{ to: string; subject: string; body: string; account?: string }>, _token: vscode.CancellationToken) => {
                const account = options.input?.account;
                const { to, subject, body } = options.input || {} as any;
                if (!to || !subject || !body) { return textResult(accountContext(authProvider) + 'Missing required fields: to, subject, body'); }
                const usedLabel = account || authProvider.getActiveAccountLabel();

                const result = await withAccount(authProvider, client, account, async () => {
                    await client.sendEmail(to, subject, body);
                    return `✅ Email sent from **${usedLabel}**!\n\n**To:** ${to}\n**Subject:** ${subject}`;
                });

                return textResult(accountContext(authProvider) + result);
            })
        })
    );

    // ── Reply to Email ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_reply_to_email', {
            invoke: logged('gmail_reply_to_email', async (options: vscode.LanguageModelToolInvocationOptions<{ messageId: string; body: string; account?: string }>, _token: vscode.CancellationToken) => {
                const account = options.input?.account;
                const { messageId, body } = options.input || {} as any;
                if (!messageId || !body) { return textResult(accountContext(authProvider) + 'Missing required fields: messageId, body'); }
                const usedLabel = account || authProvider.getActiveAccountLabel();

                const result = await withAccount(authProvider, client, account, async () => {
                    const original = await client.getMessage(messageId);
                    await client.replyToEmail(messageId, body);
                    return `✅ Reply sent from **${usedLabel}**!\n\n**To:** ${original.from}\n**Subject:** Re: ${original.subject}`;
                });

                return textResult(accountContext(authProvider) + result);
            })
        })
    );

    // ── Get Labels ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_get_labels', {
            invoke: logged('gmail_get_labels', async (options: vscode.LanguageModelToolInvocationOptions<{ account?: string }>, _token: vscode.CancellationToken) => {
                const account = options.input?.account;
                const usedLabel = account || authProvider.getActiveAccountLabel();

                const result = await withAccount(authProvider, client, account, async () => {
                    const labels = await client.getLabels();
                    const system = labels.filter(l => l.type === 'system').map(l => l.name);
                    const user = labels.filter(l => l.type === 'user').map(l => l.name);
                    return `**${usedLabel}** labels:\n\n**System:** ${system.join(', ')}\n**Custom:** ${user.length ? user.join(', ') : '(none)'}`;
                });

                return textResult(accountContext(authProvider) + result);
            })
        })
    );
}
