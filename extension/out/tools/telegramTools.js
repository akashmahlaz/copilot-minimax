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
exports.registerTelegramTools = registerTelegramTools;
const vscode = __importStar(require("vscode"));
const sessionStore_1 = require("../session/sessionStore");
// ── Helpers ─────────────────────────────────────────────────
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
// ── Tool Registration ───────────────────────────────────────
function registerTelegramTools(context, bridge) {
    // ── telegram_setup ──────────────────────────────────────
    // Allows Copilot to configure the Telegram bot token from chat.
    context.subscriptions.push(vscode.lm.registerTool('telegram_setup', {
        async invoke(options, _token) {
            const config = vscode.workspace.getConfiguration('telegramConnector');
            const inputToken = options.input?.botToken?.trim();
            const existingToken = config.get('botToken') || '';
            const token = inputToken || existingToken;
            // No token anywhere — ask for one
            if (!token) {
                return textResult('❌ No Telegram bot token found.\n\n' +
                    '**How to get one:**\n' +
                    '1. Open Telegram and message @BotFather\n' +
                    '2. Send `/newbot` and follow the prompts\n' +
                    '3. Copy the token and tell me: "set up telegram with token 123456:ABC-DEF..."\n');
            }
            // Basic format validation
            if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
                return textResult('Invalid token format. It should look like `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`.');
            }
            // Verify token against Telegram API before saving
            try {
                const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { method: 'GET' });
                const data = await res.json();
                if (!data.ok) {
                    return textResult(`Token rejected by Telegram: ${data.description || 'unknown error'}. Check your token and try again.`);
                }
                const botName = data.result?.username || data.result?.first_name || 'unknown';
                // Save token to VS Code settings (only if new or changed)
                if (inputToken && inputToken !== existingToken) {
                    await config.update('botToken', token, vscode.ConfigurationTarget.Global);
                }
                // Optionally set allowed chat IDs
                const allowedIds = options.input?.allowedChatIds;
                if (allowedIds && allowedIds.length > 0) {
                    await config.update('allowedChatIds', allowedIds, vscode.ConfigurationTarget.Global);
                }
                (0, sessionStore_1.logToolCall)('telegram_setup', { botUsername: botName }, `Configured @${botName}`);
                // Restart bridge if token changed (config watcher handles this,
                // but we also start it if it wasn't running)
                if (!bridge.isPolling()) {
                    bridge.start().catch(() => { });
                }
                return textResult(`✅ Telegram bot @${botName} configured successfully!\n\n` +
                    `The bridge will start automatically — send a message to @${botName} on Telegram and it will be processed by Copilot with full tool access.\n\n` +
                    (allowedIds?.length ? `Allowed chat IDs: ${allowedIds.join(', ')}` : 'All chats are allowed (set `telegramConnector.allowedChatIds` to restrict).'));
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return textResult(`Failed to verify token: ${msg}`);
            }
        },
    }));
    // ── telegram_status_check ───────────────────────────────
    // Checks if the Telegram bridge is configured and the token is valid.
    context.subscriptions.push(vscode.lm.registerTool('telegram_status_check', {
        async invoke(_options, _token) {
            const config = vscode.workspace.getConfiguration('telegramConnector');
            const botToken = config.get('botToken') || '';
            if (!botToken) {
                return textResult('❌ Telegram bot not configured.\n\n' +
                    'To set up, provide your bot token (from @BotFather on Telegram) and I\'ll configure it for you.\n' +
                    'Example: "Set up Telegram with token 123456:ABC-DEF..."');
            }
            try {
                const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { method: 'GET' });
                const data = await res.json();
                if (!data.ok) {
                    return textResult(`⚠️ Token is set but invalid: ${data.description}. Use telegram_setup with a new token.`);
                }
                const botName = data.result?.username || data.result?.first_name || 'unknown';
                const allowedIds = config.get('allowedChatIds') || [];
                const polling = bridge.isPolling();
                const processing = bridge.isProcessing();
                const queueLen = bridge.getQueueLength();
                const lines = [
                    `✅ **Telegram bot: @${botName}**`,
                    `Bridge polling: ${polling ? '🟢 active' : '🔴 stopped'}`,
                    `Processing: ${processing ? 'yes' : 'idle'}`,
                    queueLen > 0 ? `Queue: ${queueLen} message(s)` : '',
                    `Allowed chats: ${allowedIds.length > 0 ? allowedIds.join(', ') : 'all'}`,
                    '',
                    polling
                        ? `Send a message to @${botName} on Telegram — it will be processed by Copilot.`
                        : `Bridge is not polling. This usually means VS Code just started — try reloading the window or saying "setup telegram" to restart it.`,
                ].filter(Boolean);
                return textResult(lines.join('\n'));
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return textResult(`⚠️ Token set but verification failed: ${msg}`);
            }
        },
    }));
}
//# sourceMappingURL=telegramTools.js.map