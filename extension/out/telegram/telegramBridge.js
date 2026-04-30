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
exports.TelegramBridge = void 0;
const vscode = __importStar(require("vscode"));
const sessionStore_1 = require("../session/sessionStore");
const memoryStore_1 = require("../memory/memoryStore");
// ── Constants ───────────────────────────────────────────────
const POLL_INTERVAL_MS = 2000;
const MAX_RESPONSE_LENGTH = 4000; // Telegram max message ~4096 chars
const TYPING_INTERVAL_MS = 4000; // re-send "typing" action every 4s
// ── TelegramBridge ──────────────────────────────────────────
class TelegramBridge {
    botToken;
    pollTimer;
    lastUpdateId = 0;
    processing = false;
    queue = [];
    botUsername;
    disposables = [];
    // ── Public status getters ───────────────────────────────
    isPolling() { return !!this.pollTimer; }
    getBotUsername() { return this.botUsername; }
    isConfigured() { return !!this.botToken; }
    getQueueLength() { return this.queue.length; }
    isProcessing() { return this.processing; }
    constructor() {
        // Read token from VS Code settings
        this.botToken = vscode.workspace
            .getConfiguration('telegramConnector')
            .get('botToken');
        // Watch for config changes
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('telegramConnector.botToken')) {
                const newToken = vscode.workspace
                    .getConfiguration('telegramConnector')
                    .get('botToken');
                if (newToken !== this.botToken) {
                    this.botToken = newToken;
                    this.restart();
                }
            }
        }));
    }
    // ── Lifecycle ───────────────────────────────────────────
    async start() {
        if (!this.botToken) {
            console.error('[TelegramBridge] No bot token configured — bridge inactive.');
            return;
        }
        try {
            const me = await this.tg('getMe');
            this.botUsername = me.username;
            console.error(`[TelegramBridge] Bot: @${me.username} (${me.first_name})`);
            vscode.window.showInformationMessage(`Telegram bot @${me.username} connected — send it a message!`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[TelegramBridge] Failed to connect: ${msg}`);
            vscode.window.showWarningMessage(`Telegram bot connection failed: ${msg}`);
            return;
        }
        this.startPolling();
    }
    restart() {
        this.stopPolling();
        this.start().catch(() => { });
    }
    startPolling() {
        if (this.pollTimer) {
            return;
        }
        this.pollTimer = setInterval(() => this.poll().catch(() => { }), POLL_INTERVAL_MS);
        this.poll().catch(() => { });
    }
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }
    dispose() {
        this.stopPolling();
        this.disposables.forEach(d => d.dispose());
    }
    // ── Telegram API ────────────────────────────────────────
    async tg(method, params = {}) {
        const res = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!data.ok) {
            throw new Error(data.description || 'Telegram API error');
        }
        return data.result;
    }
    async sendMessage(chatId, text) {
        // Split long messages
        const chunks = this.splitMessage(text);
        for (const chunk of chunks) {
            try {
                await this.tg('sendMessage', {
                    chat_id: chatId,
                    text: chunk,
                    parse_mode: 'Markdown',
                });
            }
            catch {
                // Retry without markdown if parsing fails
                await this.tg('sendMessage', {
                    chat_id: chatId,
                    text: chunk,
                }).catch(() => { });
            }
        }
    }
    async sendTyping(chatId) {
        await this.tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => { });
    }
    splitMessage(text) {
        if (text.length <= MAX_RESPONSE_LENGTH) {
            return [text];
        }
        const chunks = [];
        let remaining = text;
        while (remaining.length > 0) {
            if (remaining.length <= MAX_RESPONSE_LENGTH) {
                chunks.push(remaining);
                break;
            }
            // Try to split at a newline or space
            let splitAt = remaining.lastIndexOf('\n', MAX_RESPONSE_LENGTH);
            if (splitAt < MAX_RESPONSE_LENGTH / 2) {
                splitAt = remaining.lastIndexOf(' ', MAX_RESPONSE_LENGTH);
            }
            if (splitAt < MAX_RESPONSE_LENGTH / 2) {
                splitAt = MAX_RESPONSE_LENGTH;
            }
            chunks.push(remaining.substring(0, splitAt));
            remaining = remaining.substring(splitAt).trimStart();
        }
        return chunks;
    }
    // ── Polling ─────────────────────────────────────────────
    async poll() {
        if (!this.botToken) {
            return;
        }
        try {
            const updates = await this.tg('getUpdates', {
                offset: this.lastUpdateId + 1,
                timeout: 1,
                allowed_updates: ['message'],
            });
            for (const update of updates) {
                this.lastUpdateId = update.update_id;
                const msg = update.message;
                if (!msg) {
                    continue;
                }
                const text = msg.text || msg.caption || '';
                if (!text.trim()) {
                    continue;
                }
                // Skip /start command — just greet
                if (text === '/start') {
                    await this.sendMessage(msg.chat.id, `👋 Hi ${msg.from?.first_name || 'there'}! I'm your Copilot assistant.\n\nSend me any message and I'll process it with GitHub Copilot, with full access to your tools (Gmail, GitHub, AWS, memory, etc).`);
                    continue;
                }
                const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown';
                if (this.processing) {
                    if (this.queue.length >= 3) {
                        await this.sendMessage(msg.chat.id, '⏳ I\'m still processing. Please wait a moment...');
                        continue;
                    }
                    this.queue.push({ chatId: msg.chat.id, text, from: fromName });
                    continue;
                }
                await this.processMessage(msg.chat.id, text, fromName);
            }
        }
        catch (e) {
            // Silent — will retry next tick
        }
    }
    // ── Message → Copilot → Response ────────────────────────
    async processMessage(chatId, text, from) {
        this.processing = true;
        (0, sessionStore_1.logToolCall)('telegram_incoming', { chatId, from, text }, `From ${from}: ${text.substring(0, 100)}`);
        // Show VS Code notification
        vscode.window.showInformationMessage(`💬 Telegram (${from}): ${text.substring(0, 80)}${text.length > 80 ? '…' : ''}`);
        // Send "typing" indicator
        await this.sendTyping(chatId);
        const typingInterval = setInterval(() => this.sendTyping(chatId), TYPING_INTERVAL_MS);
        try {
            const model = await this.selectModel();
            if (!model) {
                await this.sendMessage(chatId, '❌ Copilot is not available. Make sure the Copilot extension is active in VS Code.');
                return;
            }
            const memoryCtx = (0, memoryStore_1.memorySnapshot)();
            const systemPrompt = [
                memoryCtx,
                'You are an AI assistant powered by Copilot, accessed via Telegram.',
                'Be concise but thorough. Format responses for Telegram (Markdown supported).',
                'You have access to Gmail, GitHub, AWS, Vercel, Memory, and Session tools.',
                `The user\'s name is: ${from}`,
            ].join('\n');
            const messages = [
                vscode.LanguageModelChatMessage.User(`[System Context]\n${systemPrompt}`),
                vscode.LanguageModelChatMessage.User(text),
            ];
            const cts = new vscode.CancellationTokenSource();
            const timeout = setTimeout(() => cts.cancel(), 3 * 60 * 1000);
            const response = await model.sendRequest(messages, { tools: [...vscode.lm.tools] }, cts.token);
            let fullText = '';
            const maxToolRounds = 5;
            let toolRound = 0;
            // Stream response, handling tool calls inline
            for await (const chunk of response.stream) {
                if (chunk instanceof vscode.LanguageModelTextPart) {
                    fullText += chunk.value;
                }
                else if (chunk instanceof vscode.LanguageModelToolCallPart && toolRound < maxToolRounds) {
                    toolRound++;
                    try {
                        const toolResult = await vscode.lm.invokeTool(chunk.name, { toolInvocationToken: undefined, input: chunk.input });
                        const resultText = toolResult.content[0]?.value || 'No result';
                        // Append tool interaction and continue conversation
                        messages.push(vscode.LanguageModelChatMessage.Assistant(`[Tool: ${chunk.name}]`));
                        messages.push(vscode.LanguageModelChatMessage.User(`[Tool Result]\n${resultText.substring(0, 2000)}`));
                        const followUp = await model.sendRequest(messages, { tools: [...vscode.lm.tools] }, cts.token);
                        for await (const fc of followUp.stream) {
                            if (fc instanceof vscode.LanguageModelTextPart) {
                                fullText += fc.value;
                            }
                            // Skip nested tool calls to avoid infinite loops
                        }
                    }
                    catch (toolErr) {
                        const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                        fullText += `\n[Tool ${chunk.name} failed: ${errMsg}]`;
                    }
                }
            }
            clearTimeout(timeout);
            if (fullText.trim()) {
                await this.sendMessage(chatId, fullText.trim());
            }
            else {
                await this.sendMessage(chatId, '🤔 No response generated. Try rephrasing your question.');
            }
            (0, sessionStore_1.logToolCall)('telegram_outgoing', { chatId, text: fullText }, `To ${chatId}: ${fullText.substring(0, 100)}`);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes('cancel')) {
                await this.sendMessage(chatId, `❌ Error: ${msg}`);
                (0, sessionStore_1.logToolCall)('telegram_error', { chatId, error: msg }, '');
            }
        }
        finally {
            clearInterval(typingInterval);
            this.processing = false;
            this.processQueue();
        }
    }
    async selectModel() {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (models.length > 0) {
                return models[0];
            }
            const all = await vscode.lm.selectChatModels();
            return all[0];
        }
        catch {
            return undefined;
        }
    }
    processQueue() {
        const next = this.queue.shift();
        if (next) {
            this.processMessage(next.chatId, next.text, next.from).catch(() => { });
        }
    }
}
exports.TelegramBridge = TelegramBridge;
//# sourceMappingURL=telegramBridge.js.map