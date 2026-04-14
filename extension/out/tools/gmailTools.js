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
exports.registerGmailTools = registerGmailTools;
const vscode = __importStar(require("vscode"));
const memoryStore_1 = require("../memory/memoryStore");
const sessionStore_1 = require("../session/sessionStore");
// ── Helpers ─────────────────────────────────────────────────
/** Returns a summary of all connected accounts — prepended to every tool response
 *  so the LLM always knows what accounts exist, even in a fresh window. */
function accountContext(authProvider) {
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
async function withAccount(authProvider, client, label, fn) {
    const usedLabel = label || authProvider.getActiveAccountLabel() || '?';
    if (label) {
        const token = await authProvider.getAccessTokenFor(label);
        if (!token) {
            throw new Error(`Account "${label}" not found or expired. Use gmail_list_accounts to see available.`);
        }
        client.useToken(token);
    }
    try {
        return await fn();
    }
    finally {
        client.clearToken();
    }
}
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart((0, memoryStore_1.memorySnapshot)() + text)]);
}
/** Wrap a tool invoke function to automatically log the call to session store. */
function logged(toolName, fn) {
    return async (options, token) => {
        const result = await fn(options, token);
        const text = result.content[0]?.value || '';
        (0, sessionStore_1.logToolCall)(toolName, options.input, text);
        return result;
    };
}
// ── Tool Registration ───────────────────────────────────────
function registerGmailTools(context, client, authProvider) {
    // ── Add Gmail Account ───────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_add_account', {
        invoke: logged('gmail_add_account', async (options, _token) => {
            const label = options.input?.label;
            if (!label) {
                return textResult(accountContext(authProvider) + 'Please provide a label for this account (e.g. "personal", "work", "client").');
            }
            try {
                const account = await authProvider.addAccount(label.trim().toLowerCase());
                return textResult(accountContext(authProvider) +
                    `✅ Gmail account added!\n\n` +
                    `- **Label:** ${account.label}\n` +
                    `- **Email:** ${account.email}\n` +
                    `- **Status:** Active (now the default account)\n\n` +
                    `You can add more accounts with different labels, and switch between them.`);
            }
            catch (e) {
                return textResult(accountContext(authProvider) + `Failed to add account: ${e.message}`);
            }
        })
    }));
    // ── List All Accounts ───────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_list_accounts', {
        invoke: logged('gmail_list_accounts', async (_options, _token) => {
            const accounts = authProvider.listAccounts();
            if (accounts.length === 0) {
                return textResult('📧 **No Gmail accounts connected.** Use gmail_add_account to add one.');
            }
            const lines = accounts.map(a => {
                const marker = a.active ? ' ← **ACTIVE**' : '';
                return `- **${a.label}** → ${a.email}${marker}`;
            });
            return textResult(`📧 **Connected Gmail accounts (${accounts.length}):**\n\n${lines.join('\n')}\n\n` +
                `Use gmail_switch_account to change the active account, or pass \`account: "label"\` to any Gmail tool.`);
        })
    }));
    // ── Switch Account ──────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_switch_account', {
        invoke: logged('gmail_switch_account', async (options, _token) => {
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
    }));
    // ── Remove Account ──────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_remove_account', {
        invoke: logged('gmail_remove_account', async (options, _token) => {
            const label = options.input?.label;
            if (!label) {
                return textResult(accountContext(authProvider) + 'Provide the label of the account to remove.');
            }
            authProvider.removeAccountByLabel(label.trim().toLowerCase());
            vscode.commands.executeCommand('gmail-connector.refreshStatusBar');
            return textResult(accountContext(authProvider) + `Account "${label}" removed.`);
        })
    }));
    // ── Connection Status ───────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_connection_status', {
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
            return textResult(`**Active account:** ${active?.label} (${active?.email})\n` +
                `**All accounts (${accounts.length}):**\n${lines.join('\n')}\n\n` +
                `Accounts are stored globally and persist across all VS Code windows.`);
        })
    }));
    // ── Check Inbox ─────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_check_inbox', {
        invoke: logged('gmail_check_inbox', async (options, _token) => {
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
    }));
    // ── Search Emails ───────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_search_emails', {
        invoke: logged('gmail_search_emails', async (options, _token) => {
            const account = options.input?.account;
            const query = options.input?.query || '';
            const max = options.input?.maxResults ?? 10;
            const usedLabel = account || authProvider.getActiveAccountLabel();
            if (!query) {
                return textResult(accountContext(authProvider) + 'Please provide a search query.');
            }
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
    }));
    // ── Read Email ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_read_email', {
        invoke: logged('gmail_read_email', async (options, _token) => {
            const account = options.input?.account;
            const id = options.input?.messageId;
            if (!id) {
                return textResult(accountContext(authProvider) + 'Please provide a messageId.');
            }
            const usedLabel = account || authProvider.getActiveAccountLabel();
            const result = await withAccount(authProvider, client, account, async () => {
                const email = await client.getMessage(id);
                await client.markAsRead(id);
                return (`📧 **${usedLabel}** account\n\n` +
                    `**Subject:** ${email.subject || '(no subject)'}\n` +
                    `**From:** ${email.from}\n` +
                    `**To:** ${email.to}\n` +
                    `**Date:** ${email.date}\n` +
                    `**Labels:** ${email.labelIds.join(', ')}\n\n` +
                    `---\n\n${email.body || '(empty body)'}\n\n---\n` +
                    `Message ID: ${email.id} | Thread ID: ${email.threadId}`);
            });
            return textResult(accountContext(authProvider) + result);
        })
    }));
    // ── Send Email ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_send_email', {
        invoke: logged('gmail_send_email', async (options, _token) => {
            const account = options.input?.account;
            const { to, subject, body } = options.input || {};
            if (!to || !subject || !body) {
                return textResult(accountContext(authProvider) + 'Missing required fields: to, subject, body');
            }
            const usedLabel = account || authProvider.getActiveAccountLabel();
            const result = await withAccount(authProvider, client, account, async () => {
                await client.sendEmail(to, subject, body);
                return `✅ Email sent from **${usedLabel}**!\n\n**To:** ${to}\n**Subject:** ${subject}`;
            });
            return textResult(accountContext(authProvider) + result);
        })
    }));
    // ── Reply to Email ──────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_reply_to_email', {
        invoke: logged('gmail_reply_to_email', async (options, _token) => {
            const account = options.input?.account;
            const { messageId, body } = options.input || {};
            if (!messageId || !body) {
                return textResult(accountContext(authProvider) + 'Missing required fields: messageId, body');
            }
            const usedLabel = account || authProvider.getActiveAccountLabel();
            const result = await withAccount(authProvider, client, account, async () => {
                const original = await client.getMessage(messageId);
                await client.replyToEmail(messageId, body);
                return `✅ Reply sent from **${usedLabel}**!\n\n**To:** ${original.from}\n**Subject:** Re: ${original.subject}`;
            });
            return textResult(accountContext(authProvider) + result);
        })
    }));
    // ── Get Labels ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_get_labels', {
        invoke: logged('gmail_get_labels', async (options, _token) => {
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
    }));
}
//# sourceMappingURL=gmailTools.js.map