import * as vscode from 'vscode';
export declare class TelegramBridge implements vscode.Disposable {
    private botToken;
    private pollTimer;
    private lastUpdateId;
    private processing;
    private queue;
    private botUsername;
    private disposables;
    isPolling(): boolean;
    getBotUsername(): string | undefined;
    isConfigured(): boolean;
    getQueueLength(): number;
    isProcessing(): boolean;
    constructor();
    start(): Promise<void>;
    private restart;
    private startPolling;
    private stopPolling;
    dispose(): void;
    private tg;
    private sendMessage;
    private sendTyping;
    private splitMessage;
    private poll;
    private processMessage;
    private selectModel;
    private processQueue;
}
//# sourceMappingURL=telegramBridge.d.ts.map