import * as vscode from 'vscode';
import { logToolCall } from '../session/sessionStore';
import { memorySnapshot } from '../memory/memoryStore';

// ── Telegram Bridge ─────────────────────────────────────────
// Polls Telegram Bot API for incoming messages, forwards them
// to Copilot's LLM (with tool access), and sends the response
// back to Telegram. Pure HTTP — zero dependencies.

// ── Types ───────────────────────────────────────────────────

interface TgUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
}

interface TgChat {
    id: number;
    type: string;
    title?: string;
    first_name?: string;
    username?: string;
}

interface TgMessage {
    message_id: number;
    from?: TgUser;
    chat: TgChat;
    date: number;
    text?: string;
    caption?: string;
    reply_to_message?: TgMessage;
}

interface TgUpdate {
    update_id: number;
    message?: TgMessage;
    edited_message?: TgMessage;
}

// ── Constants ───────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const MAX_RESPONSE_LENGTH = 4000;   // Telegram max message ~4096 chars
const TYPING_INTERVAL_MS = 4000;    // re-send "typing" action every 4s

// ── TelegramBridge ──────────────────────────────────────────

export class TelegramBridge implements vscode.Disposable {
    private botToken: string | undefined;
    private pollTimer: ReturnType<typeof setInterval> | undefined;
    private lastUpdateId = 0;
    private processing = false;
    private queue: { chatId: number; text: string; from: string }[] = [];
    private botUsername: string | undefined;
    private disposables: vscode.Disposable[] = [];

    // ── Public status getters ───────────────────────────────

    isPolling(): boolean { return !!this.pollTimer; }
    getBotUsername(): string | undefined { return this.botUsername; }
    isConfigured(): boolean { return !!this.botToken; }
    getQueueLength(): number { return this.queue.length; }
    isProcessing(): boolean { return this.processing; }

    constructor() {
        // Read token from VS Code settings
        this.botToken = vscode.workspace
            .getConfiguration('telegramConnector')
            .get<string>('botToken');

        // Watch for config changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('telegramConnector.botToken')) {
                    const newToken = vscode.workspace
                        .getConfiguration('telegramConnector')
                        .get<string>('botToken');
                    if (newToken !== this.botToken) {
                        this.botToken = newToken;
                        this.restart();
                    }
                }
            })
        );
    }

    // ── Lifecycle ───────────────────────────────────────────

    async start(): Promise<void> {
        if (!this.botToken) {
            console.error('[TelegramBridge] No bot token configured — bridge inactive.');
            return;
        }

        try {
            const me = await this.tg<TgUser>('getMe');
            this.botUsername = me.username;
            console.error(`[TelegramBridge] Bot: @${me.username} (${me.first_name})`);
            vscode.window.showInformationMessage(`Telegram bot @${me.username} connected — send it a message!`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`[TelegramBridge] Failed to connect: ${msg}`);
            vscode.window.showWarningMessage(`Telegram bot connection failed: ${msg}`);
            return;
        }

        this.startPolling();
    }

    private restart(): void {
        this.stopPolling();
        this.start().catch(() => {});
    }

    private startPolling(): void {
        if (this.pollTimer) { return; }
        this.pollTimer = setInterval(() => this.poll().catch(() => {}), POLL_INTERVAL_MS);
        this.poll().catch(() => {});
    }

    private stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    dispose(): void {
        this.stopPolling();
        this.disposables.forEach(d => d.dispose());
    }

    // ── Telegram API ────────────────────────────────────────

    private async tg<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
        const res = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        const data = await res.json() as { ok: boolean; result: T; description?: string };
        if (!data.ok) {
            throw new Error(data.description || 'Telegram API error');
        }
        return data.result;
    }

    private async sendMessage(chatId: number, text: string): Promise<void> {
        // Split long messages
        const chunks = this.splitMessage(text);
        for (const chunk of chunks) {
            try {
                await this.tg('sendMessage', {
                    chat_id: chatId,
                    text: chunk,
                    parse_mode: 'Markdown',
                });
            } catch {
                // Retry without markdown if parsing fails
                await this.tg('sendMessage', {
                    chat_id: chatId,
                    text: chunk,
                }).catch(() => {});
            }
        }
    }

    private async sendTyping(chatId: number): Promise<void> {
        await this.tg('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    }

    private splitMessage(text: string): string[] {
        if (text.length <= MAX_RESPONSE_LENGTH) { return [text]; }
        const chunks: string[] = [];
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

    private async poll(): Promise<void> {
        if (!this.botToken) { return; }

        try {
            const updates = await this.tg<TgUpdate[]>('getUpdates', {
                offset: this.lastUpdateId + 1,
                timeout: 1,
                allowed_updates: ['message'],
            });

            for (const update of updates) {
                this.lastUpdateId = update.update_id;
                const msg = update.message;
                if (!msg) { continue; }

                const text = msg.text || msg.caption || '';
                if (!text.trim()) { continue; }

                // Skip /start command — just greet
                if (text === '/start') {
                    await this.sendMessage(msg.chat.id,
                        `👋 Hi ${msg.from?.first_name || 'there'}! I'm your Copilot assistant.\n\nSend me any message and I'll process it with GitHub Copilot, with full access to your tools (Gmail, GitHub, AWS, memory, etc).`
                    );
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
        } catch (e) {
            // Silent — will retry next tick
        }
    }

    // ── Message → Copilot → Response ────────────────────────

    private async processMessage(chatId: number, text: string, from: string): Promise<void> {
        this.processing = true;
        logToolCall('telegram_incoming', { chatId, from, text }, `From ${from}: ${text.substring(0, 100)}`);

        // Show VS Code notification
        vscode.window.showInformationMessage(
            `💬 Telegram (${from}): ${text.substring(0, 80)}${text.length > 80 ? '…' : ''}`
        );

        // Send "typing" indicator
        await this.sendTyping(chatId);
        const typingInterval = setInterval(() => this.sendTyping(chatId), TYPING_INTERVAL_MS);

        try {
            const model = await this.selectModel();
            if (!model) {
                await this.sendMessage(chatId, '❌ Copilot is not available. Make sure the Copilot extension is active in VS Code.');
                return;
            }

            const memoryCtx = memorySnapshot();
            const systemPrompt = [
                memoryCtx,
                'You are an AI assistant powered by Copilot, accessed via Telegram.',
                'Be concise but thorough. Format responses for Telegram (Markdown supported).',
                'You have access to Gmail, GitHub, AWS, Vercel, Memory, and Session tools.',
                `The user\'s name is: ${from}`,
            ].join('\n');

            const messages: vscode.LanguageModelChatMessage[] = [
                vscode.LanguageModelChatMessage.User(`[System Context]\n${systemPrompt}`),
                vscode.LanguageModelChatMessage.User(text),
            ];

            const cts = new vscode.CancellationTokenSource();
            const timeout = setTimeout(() => cts.cancel(), 3 * 60 * 1000);

            const response = await model.sendRequest(
                messages,
                { tools: [...vscode.lm.tools] },
                cts.token
            );

            let fullText = '';
            const maxToolRounds = 5;
            let toolRound = 0;

            // Stream response, handling tool calls inline
            for await (const chunk of response.stream) {
                if (chunk instanceof vscode.LanguageModelTextPart) {
                    fullText += chunk.value;
                } else if (chunk instanceof vscode.LanguageModelToolCallPart && toolRound < maxToolRounds) {
                    toolRound++;
                    try {
                        const toolResult = await vscode.lm.invokeTool(
                            chunk.name,
                            { toolInvocationToken: undefined, input: chunk.input as Record<string, unknown> }
                        );
                        const resultText = (toolResult.content[0] as vscode.LanguageModelTextPart)?.value || 'No result';

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
                    } catch (toolErr) {
                        const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
                        fullText += `\n[Tool ${chunk.name} failed: ${errMsg}]`;
                    }
                }
            }

            clearTimeout(timeout);

            if (fullText.trim()) {
                await this.sendMessage(chatId, fullText.trim());
            } else {
                await this.sendMessage(chatId, '🤔 No response generated. Try rephrasing your question.');
            }

            logToolCall('telegram_outgoing', { chatId, text: fullText }, `To ${chatId}: ${fullText.substring(0, 100)}`);

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes('cancel')) {
                await this.sendMessage(chatId, `❌ Error: ${msg}`);
                logToolCall('telegram_error', { chatId, error: msg }, '');
            }
        } finally {
            clearInterval(typingInterval);
            this.processing = false;
            this.processQueue();
        }
    }

    private async selectModel(): Promise<vscode.LanguageModelChat | undefined> {
        try {
            const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (models.length > 0) { return models[0]; }
            const all = await vscode.lm.selectChatModels();
            return all[0];
        } catch {
            return undefined;
        }
    }

    private processQueue(): void {
        const next = this.queue.shift();
        if (next) {
            this.processMessage(next.chatId, next.text, next.from).catch(() => {});
        }
    }
}
