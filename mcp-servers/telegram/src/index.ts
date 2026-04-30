#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// ── Telegram Bot API (pure fetch — zero dependencies) ───────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

interface TelegramResponse<T> {
    ok: boolean;
    result: T;
    description?: string;
}

interface TelegramUser {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
}

interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
}

interface TelegramMessage {
    message_id: number;
    from?: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
    caption?: string;
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
    edited_message?: TelegramMessage;
    channel_post?: TelegramMessage;
}

async function tg<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
    });
    const data = await res.json() as TelegramResponse<T>;
    if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description || 'unknown'}`);
    }
    return data.result;
}

// ── In-memory Message Buffer ────────────────────────────────

interface StoredMessage {
    id: number;
    chatId: number;
    chatTitle: string;
    fromName: string;
    fromId: number;
    text: string;
    timestamp: number;
}

const MAX_PER_CHAT = 200;
const messageStore = new Map<number, StoredMessage[]>();
let lastUpdateId = 0;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let botInfo: TelegramUser | undefined;

function storeMsg(msg: StoredMessage): void {
    let chat = messageStore.get(msg.chatId);
    if (!chat) {
        chat = [];
        messageStore.set(msg.chatId, chat);
    }
    chat.push(msg);
    if (chat.length > MAX_PER_CHAT) { chat.shift(); }
}

function chatTitle(chat: TelegramChat): string {
    if (chat.title) { return chat.title; }
    const parts = [chat.first_name, chat.last_name].filter(Boolean);
    return parts.join(' ') || `chat:${chat.id}`;
}

function userName(user: TelegramUser | undefined): string {
    if (!user) { return 'unknown'; }
    const parts = [user.first_name, user.last_name].filter(Boolean);
    return parts.join(' ') || user.username || `user:${user.id}`;
}

// ── Polling ─────────────────────────────────────────────────

async function pollUpdates(): Promise<void> {
    try {
        const updates = await tg<TelegramUpdate[]>('getUpdates', {
            offset: lastUpdateId + 1,
            timeout: 1,
            allowed_updates: ['message', 'edited_message', 'channel_post'],
        });

        for (const update of updates) {
            lastUpdateId = update.update_id;
            const msg = update.message || update.edited_message || update.channel_post;
            if (!msg) { continue; }

            const text = msg.text || msg.caption || '';
            if (!text) { continue; }

            storeMsg({
                id: msg.message_id,
                chatId: msg.chat.id,
                chatTitle: chatTitle(msg.chat),
                fromName: userName(msg.from),
                fromId: msg.from?.id || 0,
                text,
                timestamp: msg.date,
            });
        }
    } catch (e) {
        // Silently ignore poll errors — they'll retry on next tick
        console.error(`[telegram-mcp] poll error: ${e instanceof Error ? e.message : String(e)}`);
    }
}

function startPolling(): void {
    if (pollTimer) { return; }
    // Poll every 3 seconds
    pollTimer = setInterval(() => { pollUpdates().catch(() => {}); }, 3000);
    // Initial poll immediately
    pollUpdates().catch(() => {});
}

function stopPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = undefined;
    }
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
    name: 'copilot-minimax-telegram',
    version: '1.0.0',
});

// ── telegram_status ─────────────────────────────────────────

server.tool(
    'telegram_status',
    'Check Telegram bot connection status. Returns bot info and polling state.',
    {},
    async () => {
        if (!BOT_TOKEN) {
            return { content: [{ type: 'text' as const, text: 'Telegram bot token not configured. Set the TELEGRAM_BOT_TOKEN environment variable.' }] };
        }

        try {
            if (!botInfo) {
                botInfo = await tg<TelegramUser>('getMe');
            }
            const chatCount = messageStore.size;
            const msgCount = [...messageStore.values()].reduce((sum, msgs) => sum + msgs.length, 0);
            return {
                content: [{
                    type: 'text' as const,
                    text: `**Telegram Bot Connected** ✅\n\n` +
                        `- Bot: @${botInfo.username} (${botInfo.first_name})\n` +
                        `- Bridge: managed by VS Code extension (polls for incoming messages and forwards to Copilot)\n` +
                        `- MCP message buffer: ${msgCount} messages across ${chatCount} chats`,
                }],
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text' as const, text: `Telegram connection failed: ${msg}` }] };
        }
    },
);

// ── telegram_send_message ───────────────────────────────────

server.tool(
    'telegram_send_message',
    'Send a Telegram message to a chat. Provide a chat ID (numeric) or @username for public chats.',
    {
        chat_id: z.union([z.string(), z.number()]).describe('Chat ID (numeric) or @username for public channels/groups'),
        text: z.string().describe('Message text to send (supports Markdown)'),
        parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional().default('Markdown').describe('Text formatting mode'),
    },
    async ({ chat_id, text, parse_mode }) => {
        if (!BOT_TOKEN) {
            return { content: [{ type: 'text' as const, text: 'Telegram bot token not configured.' }] };
        }

        try {
            const sent = await tg<TelegramMessage>('sendMessage', {
                chat_id,
                text,
                parse_mode,
            });
            return {
                content: [{
                    type: 'text' as const,
                    text: `Message sent to ${chatTitle(sent.chat)} (message ID: ${sent.message_id})`,
                }],
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text' as const, text: `Send failed: ${msg}` }] };
        }
    },
);

// ── telegram_read_messages ──────────────────────────────────

server.tool(
    'telegram_read_messages',
    'Read recent messages from a Telegram chat. Only messages received since the MCP server started are available.',
    {
        chat_id: z.number().describe('Numeric chat ID'),
        limit: z.number().optional().default(20).describe('Number of messages to return (default: 20)'),
    },
    async ({ chat_id, limit }) => {
        // On-demand poll before reading (no auto-polling — bridge owns continuous poll)
        if (BOT_TOKEN) { await pollUpdates(); }

        const stored = messageStore.get(chat_id) || [];
        const recent = stored.slice(-limit);

        if (recent.length === 0) {
            return {
                content: [{
                    type: 'text' as const,
                    text: `No messages for chat ${chat_id}. Messages are buffered while the server polls. Make sure someone has sent a message to the bot.`,
                }],
            };
        }

        const lines = recent.map(m => {
            const time = new Date(m.timestamp * 1000).toISOString().slice(11, 16);
            return `[${time}] ${m.fromName}: ${m.text}`;
        });

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
);

// ── telegram_list_chats ─────────────────────────────────────

server.tool(
    'telegram_list_chats',
    'List Telegram chats with recent message activity since the MCP server started.',
    {
        limit: z.number().optional().default(20).describe('Number of chats to return'),
    },
    async ({ limit }) => {
        // On-demand poll before listing
        if (BOT_TOKEN) { await pollUpdates(); }

        const chats = [...messageStore.entries()]
            .map(([chatId, msgs]) => {
                const last = msgs[msgs.length - 1];
                return { chatId, title: last.chatTitle, lastText: last.text.substring(0, 100), lastTs: last.timestamp, count: msgs.length };
            })
            .sort((a, b) => b.lastTs - a.lastTs)
            .slice(0, limit);

        if (chats.length === 0) {
            return { content: [{ type: 'text' as const, text: 'No chats yet. Send a message to the bot to get started.' }] };
        }

        const lines = chats.map((c, i) => {
            const time = new Date(c.lastTs * 1000).toISOString().slice(0, 16).replace('T', ' ');
            return `${i + 1}. **${c.title}** (ID: ${c.chatId}, ${c.count} msgs) — ${time}\n   ${c.lastText}`;
        });

        return { content: [{ type: 'text' as const, text: `**Active chats:**\n\n${lines.join('\n\n')}` }] };
    },
);

// ── telegram_search_messages ────────────────────────────────

server.tool(
    'telegram_search_messages',
    'Search through buffered Telegram messages by keyword.',
    {
        query: z.string().describe('Search keywords'),
        chat_id: z.number().optional().describe('Limit search to a specific chat ID'),
        limit: z.number().optional().default(20).describe('Maximum results'),
    },
    async ({ query, chat_id, limit }) => {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) {
            return { content: [{ type: 'text' as const, text: 'Provide search keywords.' }] };
        }

        const results: Array<StoredMessage & { score: number }> = [];

        const entries = chat_id
            ? [[chat_id, messageStore.get(chat_id) || []] as const]
            : [...messageStore.entries()];

        for (const [, msgs] of entries) {
            for (const m of msgs) {
                const lower = m.text.toLowerCase();
                const matched = terms.filter(t => lower.includes(t)).length;
                if (matched > 0) {
                    results.push({ ...m, score: matched / terms.length });
                }
            }
        }

        results.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
        const top = results.slice(0, limit);

        if (top.length === 0) {
            return { content: [{ type: 'text' as const, text: `No messages matching "${query}".` }] };
        }

        const lines = top.map((m, i) => {
            const time = new Date(m.timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
            return `${i + 1}. [${time}] ${m.fromName} in ${m.chatTitle}:\n   ${m.text.substring(0, 200)}`;
        });

        return {
            content: [{
                type: 'text' as const,
                text: `**Search: "${query}"** — ${top.length} result(s)\n\n${lines.join('\n\n')}`,
            }],
        };
    },
);

// ── telegram_get_chat_info ──────────────────────────────────

server.tool(
    'telegram_get_chat_info',
    'Get info about a Telegram chat (group, channel, or user).',
    {
        chat_id: z.union([z.string(), z.number()]).describe('Chat ID or @username'),
    },
    async ({ chat_id }) => {
        if (!BOT_TOKEN) {
            return { content: [{ type: 'text' as const, text: 'Telegram bot token not configured.' }] };
        }

        try {
            const chat = await tg<TelegramChat & {
                description?: string;
                bio?: string;
                invite_link?: string;
            }>('getChat', { chat_id });

            const lines = [
                `**${chatTitle(chat)}**`,
                `- Type: ${chat.type}`,
                `- ID: ${chat.id}`,
            ];
            if (chat.username) { lines.push(`- Username: @${chat.username}`); }
            if (chat.description) { lines.push(`- Description: ${chat.description}`); }
            if (chat.bio) { lines.push(`- Bio: ${chat.bio}`); }
            if (chat.invite_link) { lines.push(`- Invite: ${chat.invite_link}`); }

            return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text' as const, text: `Failed to get chat info: ${msg}` }] };
        }
    },
);

// ── Start ───────────────────────────────────────────────────

async function main(): Promise<void> {
    if (!BOT_TOKEN) {
        console.error('[telegram-mcp] WARNING: TELEGRAM_BOT_TOKEN not set. Tools will return errors.');
    } else {
        // Verify token (no auto-polling — the extension bridge handles continuous polling)
        try {
            botInfo = await tg<TelegramUser>('getMe');
            console.error(`[telegram-mcp] Bot: @${botInfo.username} (${botInfo.first_name})`);
            console.error('[telegram-mcp] Auto-polling disabled — extension bridge is the primary poller.');
        } catch (e) {
            console.error(`[telegram-mcp] Failed to connect: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error('Telegram MCP server failed:', err);
    process.exit(1);
});
