import * as vscode from 'vscode';
import { GmailClient } from '../gmail/gmailClient';
import { GoogleAuthProvider } from '../auth/googleAuthProvider';

export function registerGmailTools(context: vscode.ExtensionContext, client: GmailClient, authProvider: GoogleAuthProvider): void {

    // ── Add Gmail Account ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_add_account', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ label: string }>, _token) {
                const label = options.input?.label;
                if (!label) {
                    return textResult('Please provide a label for this account (e.g. "personal", "work", "client").');
                }
                try {
                    const account = await authProvider.addAccount(label.trim().toLowerCase());
                    return textResult(
                        `Gmail account added!\n\n` +
                        `- **Label:** ${account.label}\n` +
                        `- **Email:** ${account.email}\n` +
                        `- **Status:** Active (now the default account)\n\n` +
                        `You can add more accounts with different labels, and switch between them.`
                    );
                } catch (e: any) {
                    return textResult(`Failed to add account: ${e.message}`);
                }
            }
        })
    );

    // ── List All Accounts ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_list_accounts', {
            async invoke(_options, _token) {
                const accounts = authProvider.listAccounts();
                if (accounts.length === 0) {
                    return textResult('No Gmail accounts connected. Use **gmail_add_account** to add one.');
                }
                const lines = accounts.map(a => {
                    const marker = a.active ? ' ← **ACTIVE**' : '';
                    return `- **${a.label}** → ${a.email}${marker}`;
                });
                return textResult(
                    `Connected Gmail accounts (${accounts.length}):\n\n${lines.join('\n')}\n\n` +
                    `Use gmail_switch_account to change the active account.`
                );
            }
        })
    );

    // ── Switch Account ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_switch_account', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ label: string }>, _token) {
                const label = options.input?.label;
                if (!label) {
                    const accounts = authProvider.listAccounts();
                    const labels = accounts.map(a => `"${a.label}" (${a.email})`).join(', ');
                    return textResult(`Provide a label to switch to. Available: ${labels}`);
                }
                const account = authProvider.switchAccount(label.trim().toLowerCase());
                if (account) {
                    return textResult(`Switched to **${account.label}** (${account.email}). All Gmail tools now use this account.`);
                }
                return textResult(`Account "${label}" not found. Use gmail_list_accounts to see available accounts.`);
            }
        })
    );

    // ── Remove Account ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_remove_account', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ label: string }>, _token) {
                const label = options.input?.label;
                if (!label) {
                    return textResult('Provide the label of the account to remove.');
                }
                authProvider.removeAccountByLabel(label.trim().toLowerCase());
                const remaining = authProvider.listAccounts();
                if (remaining.length > 0) {
                    const active = remaining.find(a => a.active);
                    return textResult(`Account "${label}" removed. Active account is now **${active?.label}** (${active?.email}).`);
                }
                return textResult(`Account "${label}" removed. No accounts remaining.`);
            }
        })
    );

    // ── Connection Status ───────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_connection_status', {
            async invoke(_options, _token) {
                const accounts = authProvider.listAccounts();
                if (accounts.length === 0) {
                    return textResult('No Gmail accounts connected. Use gmail_add_account to add one.');
                }
                const active = accounts.find(a => a.active);
                const lines = accounts.map(a => {
                    const marker = a.active ? ' ← ACTIVE' : '';
                    return `- **${a.label}** → ${a.email}${marker}`;
                });
                return textResult(
                    `**Active account:** ${active?.label} (${active?.email})\n` +
                    `**All accounts (${accounts.length}):**\n${lines.join('\n')}`
                );
            }
        })
    );

    // ── Check Inbox ─────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_check_inbox', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ maxResults?: number; query?: string; account?: string }>, _token: vscode.CancellationToken) {
                if (options.input?.account) { authProvider.switchAccount(options.input.account); }
                const active = authProvider.getActiveAccountLabel();
                const max = options.input?.maxResults ?? 15;
                const query = options.input?.query || 'in:inbox';

                const messages = await client.listMessages(query, max);
                if (messages.length === 0) {
                    return textResult(`No emails found in inbox. (Account: ${active})`);
                }

                const lines = messages.map((msg, i) => {
                    const unread = msg.isUnread ? '[UNREAD] ' : '';
                    const from = msg.from.replace(/<.*>/, '').trim();
                    return `${i + 1}. ${unread}**${msg.subject || '(no subject)'}**\n   From: ${from} | Date: ${msg.date}\n   ${msg.snippet.substring(0, 120)}\n   ID: ${msg.id}`;
                });

                return textResult(
                    `📧 **${active}** account — ${messages.length} emails:\n\n${lines.join('\n\n')}\n\nUse gmail_read_email with a message ID to read the full email.`
                );
            }
        })
    );

    // ── Search Emails ───────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_search_emails', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ query: string; maxResults?: number; account?: string }>, _token: vscode.CancellationToken) {
                if (options.input?.account) { authProvider.switchAccount(options.input.account); }
                const active = authProvider.getActiveAccountLabel();
                const query = options.input?.query || '';
                const max = options.input?.maxResults ?? 10;

                if (!query) { return textResult('Please provide a search query.'); }

                const messages = await client.listMessages(query, max);
                if (messages.length === 0) {
                    return textResult(`No emails found for: ${query} (Account: ${active})`);
                }

                const lines = messages.map((msg, i) => {
                    const from = msg.from.replace(/<.*>/, '').trim();
                    return `${i + 1}. **${msg.subject || '(no subject)'}**\n   From: ${from} | Date: ${msg.date}\n   ${msg.snippet.substring(0, 120)}\n   ID: ${msg.id}`;
                });

                return textResult(
                    `🔍 **${active}** — search "${query}" — ${messages.length} results:\n\n${lines.join('\n\n')}`
                );
            }
        })
    );

    // ── Read Email ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_read_email', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ messageId: string; account?: string }>, _token: vscode.CancellationToken) {
                if (options.input?.account) { authProvider.switchAccount(options.input.account); }
                const id = options.input?.messageId;
                if (!id) { return textResult('Please provide a messageId.'); }
                const active = authProvider.getActiveAccountLabel();

                const email = await client.getMessage(id);
                await client.markAsRead(id);

                return textResult(
                    `📧 **${active}** account\n\n` +
                    `**Subject:** ${email.subject || '(no subject)'}\n` +
                    `**From:** ${email.from}\n` +
                    `**To:** ${email.to}\n` +
                    `**Date:** ${email.date}\n` +
                    `**Labels:** ${email.labelIds.join(', ')}\n\n` +
                    `---\n\n${email.body || '(empty body)'}\n\n---\n` +
                    `Message ID: ${email.id} | Thread ID: ${email.threadId}`
                );
            }
        })
    );

    // ── Send Email ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_send_email', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ to: string; subject: string; body: string; account?: string }>, _token: vscode.CancellationToken) {
                if (options.input?.account) { authProvider.switchAccount(options.input.account); }
                const { to, subject, body } = options.input || {} as any;
                if (!to || !subject || !body) { return textResult('Missing required fields: to, subject, body'); }
                const active = authProvider.getActiveAccountLabel();

                await client.sendEmail(to, subject, body);

                return textResult(`Email sent from **${active}** account!\n\n**To:** ${to}\n**Subject:** ${subject}`);
            }
        })
    );

    // ── Reply to Email ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_reply_to_email', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ messageId: string; body: string; account?: string }>, _token: vscode.CancellationToken) {
                if (options.input?.account) { authProvider.switchAccount(options.input.account); }
                const { messageId, body } = options.input || {} as any;
                if (!messageId || !body) { return textResult('Missing required fields: messageId, body'); }
                const active = authProvider.getActiveAccountLabel();

                const original = await client.getMessage(messageId);
                await client.replyToEmail(messageId, body);

                return textResult(`Reply sent from **${active}**!\n\n**To:** ${original.from}\n**Subject:** Re: ${original.subject}`);
            }
        })
    );

    // ── Get Labels ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('gmail_get_labels', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{ account?: string }>, _token: vscode.CancellationToken) {
                if (options.input?.account) { authProvider.switchAccount(options.input.account); }
                const labels = await client.getLabels();
                const system = labels.filter(l => l.type === 'system').map(l => l.name);
                const user = labels.filter(l => l.type === 'user').map(l => l.name);

                return textResult(
                    `**System labels:** ${system.join(', ')}\n\n**Custom labels:** ${user.length ? user.join(', ') : '(none)'}`
                );
            }
        })
    );
}

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
