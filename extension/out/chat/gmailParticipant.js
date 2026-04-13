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
exports.registerGmailParticipant = registerGmailParticipant;
const vscode = __importStar(require("vscode"));
function registerGmailParticipant(context, client) {
    const participant = vscode.chat.createChatParticipant('copilot-gmail-connector.gmail', async (request, _chatContext, stream, _token) => {
        try {
            switch (request.command) {
                case 'inbox': return await handleInbox(client, stream);
                case 'search': return await handleSearch(client, stream, request.prompt);
                case 'read': return await handleRead(client, stream, request.prompt);
                case 'compose': return await handleCompose(client, stream, request.prompt);
                case 'reply': return await handleReply(client, stream, request.prompt);
                case 'labels': return await handleLabels(client, stream);
                default: return await handleGeneral(client, stream, request.prompt);
            }
        }
        catch (e) {
            stream.markdown(`**Error:** ${e.message}\n\n` +
                'Make sure Gmail is connected — click the Gmail icon in the sidebar or run `Gmail: Connect Gmail Account`.');
        }
    });
    participant.iconPath = new vscode.ThemeIcon('mail');
    context.subscriptions.push(participant);
}
// ── Command Handlers ────────────────────────────────────────
async function handleInbox(client, stream) {
    stream.progress('Fetching inbox...');
    const messages = await client.listMessages('in:inbox', 15);
    if (messages.length === 0) {
        stream.markdown('Your inbox is empty! 🎉');
        return;
    }
    stream.markdown(`**Inbox** — ${messages.length} recent emails:\n\n`);
    for (const msg of messages) {
        const unread = msg.isUnread ? '🔵 ' : '';
        const from = msg.from.replace(/<.*>/, '').trim();
        stream.markdown(`${unread}**${msg.subject || '(no subject)'}**\n` +
            `From: ${from} · ${msg.date}\n` +
            `${msg.snippet.substring(0, 120)}…\n` +
            `ID: \`${msg.id}\`\n\n`);
    }
    stream.markdown('---\nUse `@gmail /read <ID>` to read a full email, `@gmail /search <query>` to search.');
}
async function handleSearch(client, stream, query) {
    if (!query.trim()) {
        stream.markdown('**Search examples:**\n\n' +
            '- `@gmail /search from:john`\n' +
            '- `@gmail /search subject:meeting after:2025/01/01`\n' +
            '- `@gmail /search is:unread has:attachment`');
        return;
    }
    stream.progress(`Searching: ${query}`);
    const messages = await client.listMessages(query, 10);
    if (messages.length === 0) {
        stream.markdown(`No emails found for: **${query}**`);
        return;
    }
    stream.markdown(`**Search results** for *${query}* — ${messages.length} found:\n\n`);
    for (const msg of messages) {
        const from = msg.from.replace(/<.*>/, '').trim();
        stream.markdown(`- **${msg.subject || '(no subject)'}** — ${from}\n` +
            `  ${msg.snippet.substring(0, 100)}…  \`${msg.id}\`\n\n`);
    }
}
async function handleRead(client, stream, prompt) {
    const idMatch = prompt.match(/\b([a-f0-9]{10,})\b/i);
    if (!idMatch) {
        stream.markdown('Provide an email ID. Run `@gmail /inbox` first to see IDs, then `@gmail /read <ID>`.');
        return;
    }
    stream.progress('Loading email...');
    const email = await client.getMessage(idMatch[1]);
    await client.markAsRead(idMatch[1]);
    stream.markdown(`## ${email.subject || '(no subject)'}\n\n` +
        `| | |\n|---|---|\n` +
        `| **From** | ${email.from} |\n` +
        `| **To** | ${email.to} |\n` +
        `| **Date** | ${email.date} |\n` +
        `| **Labels** | ${email.labelIds.join(', ')} |\n\n` +
        '---\n\n' +
        (email.body || '*Empty body*') + '\n\n' +
        '---\n' +
        `Reply: \`@gmail /reply ${email.id} your message\``);
}
async function handleCompose(client, stream, prompt) {
    const toMatch = prompt.match(/to:\s*(\S+@\S+)/i);
    const subjectMatch = prompt.match(/subject:\s*(.+?)(?=\s+body:|\s*$)/i);
    const bodyMatch = prompt.match(/body:\s*(.+)/is);
    if (!toMatch || !subjectMatch || !bodyMatch) {
        stream.markdown('**Compose format:**\n\n' +
            '```\n@gmail /compose to:user@example.com subject:Hello body:Your message here\n```\n\n' +
            'All three fields are required.');
        return;
    }
    const to = toMatch[1];
    const subject = subjectMatch[1].trim();
    const body = bodyMatch[1].trim();
    stream.progress(`Sending to ${to}...`);
    await client.sendEmail(to, subject, body);
    stream.markdown(`**Email sent!** ✅\n\n` +
        `| | |\n|---|---|\n` +
        `| **To** | ${to} |\n` +
        `| **Subject** | ${subject} |\n`);
}
async function handleReply(client, stream, prompt) {
    const idMatch = prompt.match(/\b([a-f0-9]{10,})\b/i);
    if (!idMatch) {
        stream.markdown('**Reply format:** `@gmail /reply <messageId> Your reply text`');
        return;
    }
    const replyBody = prompt.replace(idMatch[0], '').trim();
    if (!replyBody) {
        stream.markdown('Include your reply text after the message ID.');
        return;
    }
    stream.progress('Sending reply...');
    await client.replyToEmail(idMatch[1], replyBody);
    stream.markdown('**Reply sent!** ✅');
}
async function handleLabels(client, stream) {
    stream.progress('Loading labels...');
    const labels = await client.getLabels();
    stream.markdown('**Your Gmail labels:**\n\n');
    const system = labels.filter(l => l.type === 'system');
    const user = labels.filter(l => l.type === 'user');
    if (system.length) {
        stream.markdown('*System:* ' + system.map(l => `\`${l.name}\``).join(', ') + '\n\n');
    }
    if (user.length) {
        stream.markdown('*Custom:* ' + user.map(l => `\`${l.name}\``).join(', ') + '\n\n');
    }
}
async function handleGeneral(client, stream, prompt) {
    const lower = prompt.toLowerCase();
    if (lower.includes('unread') || lower.includes('new email')) {
        return handleSearch(client, stream, 'is:unread in:inbox');
    }
    if (lower.includes('sent')) {
        return handleSearch(client, stream, 'in:sent');
    }
    if (lower.includes('starred') || lower.includes('important')) {
        return handleSearch(client, stream, 'is:starred');
    }
    if (lower.includes('draft')) {
        return handleSearch(client, stream, 'in:drafts');
    }
    if (lower.includes('inbox') || lower.includes('mail') || lower.includes('email')) {
        return handleInbox(client, stream);
    }
    // Default: search
    stream.markdown(`Searching your emails for: **${prompt}**\n\n`);
    return handleSearch(client, stream, prompt);
}
//# sourceMappingURL=gmailParticipant.js.map