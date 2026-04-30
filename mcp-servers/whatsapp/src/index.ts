#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── CJS Interop ─────────────────────────────────────────────
// Baileys and qrcode are CJS packages. createRequire ensures reliable
// interop in our ESM context (required by MCP SDK).

const cjsRequire = createRequire(import.meta.url);

const baileys: Record<string, unknown> = cjsRequire('baileys');
const makeWASocket = baileys.default as (config: Record<string, unknown>) => WASocket;
const useMultiFileAuthState = (baileys.useMultiFileAuthState
    ?? (cjsRequire('baileys/lib/Utils/use-multi-file-auth-state') as Record<string, unknown>)
        .useMultiFileAuthState) as (folder: string) => Promise<AuthState>;

const QRCode = cjsRequire('qrcode') as QRCodeLib;

// ── Minimal type declarations for CJS imports ───────────────

interface WASocket {
    ev: { on(event: string, handler: (...args: any[]) => void): void };
    user?: { id: string };
    sendMessage(jid: string, content: { text: string }): Promise<unknown>;
    end(error: unknown): void;
}

interface AuthState {
    state: unknown;
    saveCreds: () => Promise<void>;
}

interface QRCodeLib {
    toBuffer(text: string, opts?: Record<string, unknown>): Promise<Buffer>;
    toString(text: string, opts?: Record<string, unknown>): Promise<string>;
}

// ── Constants ───────────────────────────────────────────────

const AUTH_DIR = path.join(os.homedir(), '.copilot-minimax', 'whatsapp-mcp-auth');
const STATE_FILE = path.join(os.homedir(), '.copilot-minimax', 'whatsapp-state.json');

// ── Connection State ────────────────────────────────────────

type Status = 'disconnected' | 'connecting' | 'connected';

let socket: WASocket | null = null;
let connectionStatus: Status = 'disconnected';
let ownJid: string | undefined;
let currentQR: string | undefined;

// ── In-memory Message Store ─────────────────────────────────

interface StoredMessage {
    id: string;
    chatJid: string;
    fromMe: boolean;
    sender: string;
    text: string;
    timestamp: number;
}

const MAX_PER_CHAT = 100;
const messageStore = new Map<string, StoredMessage[]>();

/** Write connection state to a shared file so the VS Code extension can show a proper QR panel. */
async function writeStateFile(state: { status: Status; qrPng?: string; jid?: string }): Promise<void> {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, ts: Date.now() }) + '\n');
    } catch { /* best-effort — extension watcher is optional */ }
}

function storeMsg(msg: StoredMessage): void {
    let chat = messageStore.get(msg.chatJid);
    if (!chat) {
        chat = [];
        messageStore.set(msg.chatJid, chat);
    }
    chat.push(msg);
    if (chat.length > MAX_PER_CHAT) { chat.shift(); }
}

// ── WhatsApp Connection ─────────────────────────────────────

async function connect(): Promise<void> {
    console.error(`[whatsapp-mcp] connect() called, current status: ${connectionStatus}`);
    if (connectionStatus === 'connected' && socket) { return; }

    if (socket) {
        try { socket.end(undefined); } catch { /* ignore */ }
        socket = null;
    }

    connectionStatus = 'connecting';

    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    console.error(`[whatsapp-mcp] auth dir: ${AUTH_DIR}`);

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    console.error('[whatsapp-mcp] auth state loaded, creating socket...');

    // Baileys expects a pino-compatible logger. Both the parent and child()
    // instances must have all log-level methods or Baileys crashes.
    // child() must also be recursive since Baileys calls child().child().
    const noop = (): void => { /* noop */ };
    function makeSilentLogger(): Record<string, unknown> {
        const logger: Record<string, unknown> = {
            level: 'silent',
            debug: noop, info: noop, warn: noop, error: noop, fatal: noop, trace: noop,
            child: () => makeSilentLogger(),
        };
        return logger;
    }
    const silentLogger = makeSilentLogger();

    const sock = makeWASocket({
        // Override hardcoded WA protocol version — rc.9 ships 1027934701 which
        // WhatsApp rejects with 405. See github.com/WhiskeySockets/Baileys/issues/2376
        version: [2, 3000, 1034074495],
        auth: state,
        printQRInTerminal: false,
        logger: silentLogger,
        getMessage: async () => undefined,
    });
    console.error('[whatsapp-mcp] socket created, waiting for events...');

    sock.ev.on('connection.update', (update: Record<string, unknown>) => {
        // Log to stderr for diagnostics (stdout is reserved for MCP JSON-RPC)
        console.error(`[whatsapp-mcp] connection.update: ${JSON.stringify(update)}`);
        if (update.qr) {
            currentQR = update.qr as string;
            connectionStatus = 'connecting';
            console.error('[whatsapp-mcp] QR code received');
            // Generate base64 PNG for the VS Code webview panel
            QRCode.toBuffer(currentQR, { type: 'png', margin: 2, width: 280 }).then((buf: Buffer) => {
                writeStateFile({ status: 'connecting', qrPng: buf.toString('base64') });
            }).catch(() => { /* ignore render failure */ });
        }
        if (update.connection === 'open') {
            connectionStatus = 'connected';
            ownJid = sock.user?.id;
            currentQR = undefined;
            console.error(`[whatsapp-mcp] connected as ${ownJid}`);
            writeStateFile({ status: 'connected', jid: ownJid });
        }
        if (update.connection === 'close') {
            connectionStatus = 'disconnected';
            socket = null;
            console.error('[whatsapp-mcp] connection closed');
            writeStateFile({ status: 'disconnected' });

            const err = update.lastDisconnect as Record<string, any> | undefined;
            const statusCode = err?.error?.output?.statusCode;
            if (statusCode === 401) {
                // Logged out — wipe auth so a fresh QR is generated next time
                try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
            } else {
                setTimeout(() => { connect().catch(() => { /* ignore */ }); }, 3000);
            }
        }
    });

    sock.ev.on('messages.upsert', (payload: Record<string, any>) => {
        const msgs: any[] = payload.messages || [];
        for (const msg of msgs) {
            if (!msg.message) { continue; }

            const chatJid: string = msg.key?.remoteJid || '';
            if (chatJid === 'status@broadcast') { continue; }

            const text: string =
                msg.message?.conversation
                || msg.message?.extendedTextMessage?.text
                || msg.message?.imageMessage?.caption
                || '';
            if (!text) { continue; }

            storeMsg({
                id: msg.key?.id || '',
                chatJid,
                fromMe: Boolean(msg.key?.fromMe),
                sender: msg.key?.fromMe ? (ownJid || 'me') : (msg.key?.participant || chatJid),
                text,
                timestamp: typeof msg.messageTimestamp === 'number'
                    ? msg.messageTimestamp
                    : Math.floor(Date.now() / 1000),
            });
        }
    });

    sock.ev.on('creds.update', () => { saveCreds().catch(() => { /* ignore */ }); });

    socket = sock;
}

// Don't auto-connect — wait for whatsapp_connect tool call.
// This avoids races when the MCP server starts up.

// ── Helpers ─────────────────────────────────────────────────

function normalizeJid(input: string): string {
    if (input.includes('@')) { return input; }
    return input.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
}

/** Read connectionStatus through a function to defeat TS control-flow narrowing. */
function getStatus(): Status { return connectionStatus; }

async function qrContent(): Promise<Array<{ type: 'text'; text: string }>> {
    if (!currentQR) {
        return [{ type: 'text' as const, text: `WhatsApp status: ${connectionStatus}. No QR code available yet — Baileys may still be connecting to WhatsApp servers. Try again in a few seconds.` }];
    }
    try {
        // Render QR as UTF-8 text block — Copilot Chat doesn't support MCP image content
        const qrText: string = await QRCode.toString(currentQR, { type: 'utf8', small: true });
        return [{
            type: 'text' as const,
            text: `**Scan this QR code with WhatsApp:**\nOpen WhatsApp → Settings → Linked Devices → Link a Device\n\n\`\`\`\n${qrText}\`\`\`\n\nQR expires in ~60 seconds. If it expires, call whatsapp_connect again.`,
        }];
    } catch {
        return [{ type: 'text' as const, text: `QR code is available but rendering failed. Raw QR data length: ${currentQR.length}. Try whatsapp_status again.` }];
    }
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
    name: 'copilot-minimax-whatsapp',
    version: '1.0.0',
});

// ── whatsapp_status ─────────────────────────────────────────

server.tool(
    'whatsapp_status',
    'Check WhatsApp connection status. Returns a QR code image if waiting for authentication.',
    {},
    async () => {
        if (connectionStatus === 'connected') {
            return { content: [{ type: 'text' as const, text: `WhatsApp connected as ${ownJid}` }] };
        }
        return { content: await qrContent() };
    },
);

// ── whatsapp_connect ────────────────────────────────────────

server.tool(
    'whatsapp_connect',
    'Connect to WhatsApp. Initiates a connection and returns a QR code to scan if not already authenticated.',
    {},
    async () => {
        if (connectionStatus === 'connected') {
            return { content: [{ type: 'text' as const, text: `Already connected as ${ownJid}` }] };
        }

        try {
            await connect();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text' as const, text: `Connection failed: ${msg}` }] };
        }

        // Poll for up to 15 seconds — Baileys needs time to reach WhatsApp servers and get a QR
        for (let i = 0; i < 30; i++) {
            await new Promise<void>(resolve => setTimeout(resolve, 500));
            if (getStatus() === 'connected') {
                return { content: [{ type: 'text' as const, text: `Connected as ${ownJid}` }] };
            }
            if (currentQR) { break; }
        }

        if (currentQR) {
            return { content: [{ type: 'text' as const, text: '**QR code ready!** A WhatsApp Connect panel should have opened in VS Code. Scan the QR code there with your phone.\n\nOpen WhatsApp → Settings → Linked Devices → Link a Device\n\nIf the panel didn\'t open, run the command **"WhatsApp: Connect WhatsApp"** from the Command Palette (Ctrl+Shift+P).' }] };
        }

        return { content: await qrContent() };
    },
);

// ── whatsapp_send_message ───────────────────────────────────

server.tool(
    'whatsapp_send_message',
    'Send a WhatsApp message. Provide a phone number with country code or a full JID.',
    {
        to: z.string().describe('Phone number with country code (e.g. "919876543210") or JID (e.g. "919876543210@s.whatsapp.net")'),
        text: z.string().describe('Message text to send'),
    },
    async ({ to, text }) => {
        if (!socket || connectionStatus !== 'connected') {
            return { content: [{ type: 'text' as const, text: 'WhatsApp not connected. Use whatsapp_connect first.' }] };
        }

        const jid = normalizeJid(to);
        try {
            await socket.sendMessage(jid, { text });
            return { content: [{ type: 'text' as const, text: `Message sent to ${jid}` }] };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { content: [{ type: 'text' as const, text: `Send failed: ${msg}` }] };
        }
    },
);

// ── whatsapp_read_messages ──────────────────────────────────

server.tool(
    'whatsapp_read_messages',
    'Read recent messages from a WhatsApp chat. Only messages received since server start are available.',
    {
        chat: z.string().describe('Phone number or JID of the chat'),
        limit: z.number().optional().default(20).describe('Number of messages to return (default: 20)'),
    },
    async ({ chat, limit }) => {
        const jid = normalizeJid(chat);
        const stored = messageStore.get(jid) || [];
        const recent = stored.slice(-limit);

        if (recent.length === 0) {
            return {
                content: [{
                    type: 'text' as const,
                    text: `No messages for ${jid}. Messages are buffered while the server runs.`,
                }],
            };
        }

        const lines = recent.map(m => {
            const time = new Date(m.timestamp * 1000).toISOString().slice(11, 16);
            const who = m.fromMe ? 'You' : m.sender.split('@')[0];
            return `[${time}] ${who}: ${m.text}`;
        });

        return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
);

// ── whatsapp_list_chats ─────────────────────────────────────

server.tool(
    'whatsapp_list_chats',
    'List WhatsApp chats with recent message activity since server start.',
    {
        limit: z.number().optional().default(20).describe('Number of chats to return'),
    },
    async ({ limit }) => {
        const chats = [...messageStore.entries()]
            .map(([jid, msgs]) => {
                const last = msgs[msgs.length - 1];
                return { jid, lastText: last.text.substring(0, 100), lastTs: last.timestamp, count: msgs.length };
            })
            .sort((a, b) => b.lastTs - a.lastTs)
            .slice(0, limit);

        if (chats.length === 0) {
            return { content: [{ type: 'text' as const, text: 'No chats yet. Messages appear after the server starts.' }] };
        }

        const lines = chats.map((c, i) => {
            const time = new Date(c.lastTs * 1000).toISOString().slice(0, 16).replace('T', ' ');
            return `${i + 1}. **${c.jid.split('@')[0]}** (${c.count} msgs) — ${time}\n   ${c.lastText}`;
        });

        return { content: [{ type: 'text' as const, text: `**Active chats:**\n\n${lines.join('\n\n')}` }] };
    },
);

// ── whatsapp_search_messages ────────────────────────────────

server.tool(
    'whatsapp_search_messages',
    'Search through buffered WhatsApp messages by keyword.',
    {
        query: z.string().describe('Search keywords'),
        limit: z.number().optional().default(20).describe('Maximum results'),
    },
    async ({ query, limit }) => {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (terms.length === 0) {
            return { content: [{ type: 'text' as const, text: 'Provide search keywords.' }] };
        }

        const results: Array<StoredMessage & { score: number }> = [];

        for (const [, msgs] of messageStore) {
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
            const who = m.fromMe ? 'You' : m.sender.split('@')[0];
            return `${i + 1}. [${time}] ${who} → ${m.chatJid.split('@')[0]}:\n   ${m.text.substring(0, 200)}`;
        });

        return {
            content: [{
                type: 'text' as const,
                text: `**Search: "${query}"** — ${top.length} result(s)\n\n${lines.join('\n\n')}`,
            }],
        };
    },
);

// ── Start ───────────────────────────────────────────────────

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error('WhatsApp MCP server failed:', err);
    process.exit(1);
});
