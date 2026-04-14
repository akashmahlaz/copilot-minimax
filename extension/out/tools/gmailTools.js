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
const googleAuthProvider_1 = require("../auth/googleAuthProvider");
function registerGmailTools(context, client, authProvider) {
    // ── Connect Gmail Account ───────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_connect_account', {
        async invoke(_options, _token) {
            try {
                const session = await vscode.authentication.getSession(googleAuthProvider_1.GoogleAuthProvider.id, googleAuthProvider_1.GoogleAuthProvider.scopes, { createIfNone: true });
                if (session) {
                    return textResult(`Gmail connected successfully as **${session.account.label}**. You can now use the other Gmail tools.`);
                }
                return textResult('Gmail connection was cancelled.');
            }
            catch (e) {
                return textResult(`Failed to connect Gmail: ${e.message}`);
            }
        }
    }));
    // ── Disconnect Gmail Account ────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_disconnect_account', {
        async invoke(_options, _token) {
            try {
                await authProvider.removeSession();
                return textResult('Gmail account disconnected. Token removed.');
            }
            catch (e) {
                return textResult(`Failed to disconnect: ${e.message}`);
            }
        }
    }));
    // ── Connection Status ───────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_connection_status', {
        async invoke(_options, _token) {
            const sessions = await authProvider.getSessions();
            if (sessions.length > 0) {
                const s = sessions[0];
                return textResult(`Gmail is connected as **${s.account.label}** (${s.account.id}).`);
            }
            return textResult('Gmail is **not connected**. Use the gmail_connect_account tool to connect.');
        }
    }));
    // ── Check Inbox ─────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_check_inbox', {
        async invoke(options, _token) {
            const max = options.input?.maxResults ?? 15;
            const query = options.input?.query || 'in:inbox';
            const messages = await client.listMessages(query, max);
            if (messages.length === 0) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('No emails found in inbox.')
                ]);
            }
            const lines = messages.map((msg, i) => {
                const unread = msg.isUnread ? '[UNREAD] ' : '';
                const from = msg.from.replace(/<.*>/, '').trim();
                return `${i + 1}. ${unread}**${msg.subject || '(no subject)'}**\n   From: ${from} | Date: ${msg.date}\n   ${msg.snippet.substring(0, 120)}\n   ID: ${msg.id}`;
            });
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Found ${messages.length} emails:\n\n${lines.join('\n\n')}\n\nUse gmail_read_email with a message ID to read the full email.`)
            ]);
        }
    }));
    // ── Search Emails ───────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_search_emails', {
        async invoke(options, _token) {
            const query = options.input?.query || '';
            const max = options.input?.maxResults ?? 10;
            if (!query) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Please provide a search query.')
                ]);
            }
            const messages = await client.listMessages(query, max);
            if (messages.length === 0) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart(`No emails found for: ${query}`)
                ]);
            }
            const lines = messages.map((msg, i) => {
                const from = msg.from.replace(/<.*>/, '').trim();
                return `${i + 1}. **${msg.subject || '(no subject)'}**\n   From: ${from} | Date: ${msg.date}\n   ${msg.snippet.substring(0, 120)}\n   ID: ${msg.id}`;
            });
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Search results for "${query}" — ${messages.length} emails:\n\n${lines.join('\n\n')}`)
            ]);
        }
    }));
    // ── Read Email ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_read_email', {
        async invoke(options, _token) {
            const id = options.input?.messageId;
            if (!id) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Please provide a messageId.')
                ]);
            }
            const email = await client.getMessage(id);
            await client.markAsRead(id);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`**Subject:** ${email.subject || '(no subject)'}\n` +
                    `**From:** ${email.from}\n` +
                    `**To:** ${email.to}\n` +
                    `**Date:** ${email.date}\n` +
                    `**Labels:** ${email.labelIds.join(', ')}\n\n` +
                    `---\n\n${email.body || '(empty body)'}\n\n---\n` +
                    `Message ID: ${email.id} | Thread ID: ${email.threadId}`)
            ]);
        }
    }));
    // ── Send Email ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_send_email', {
        async invoke(options, _token) {
            const { to, subject, body } = options.input || {};
            if (!to || !subject || !body) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Missing required fields: to, subject, body')
                ]);
            }
            await client.sendEmail(to, subject, body);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Email sent successfully!\n\n**To:** ${to}\n**Subject:** ${subject}`)
            ]);
        }
    }));
    // ── Reply to Email ──────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_reply_to_email', {
        async invoke(options, _token) {
            const { messageId, body } = options.input || {};
            if (!messageId || !body) {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('Missing required fields: messageId, body')
                ]);
            }
            const original = await client.getMessage(messageId);
            await client.replyToEmail(messageId, body);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`Reply sent!\n\n**To:** ${original.from}\n**Subject:** Re: ${original.subject}`)
            ]);
        }
    }));
    // ── Get Labels ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('gmail_get_labels', {
        async invoke(_options, _token) {
            const labels = await client.getLabels();
            const system = labels.filter(l => l.type === 'system').map(l => l.name);
            const user = labels.filter(l => l.type === 'user').map(l => l.name);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`**System labels:** ${system.join(', ')}\n\n**Custom labels:** ${user.length ? user.join(', ') : '(none)'}`)
            ]);
        }
    }));
}
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
//# sourceMappingURL=gmailTools.js.map