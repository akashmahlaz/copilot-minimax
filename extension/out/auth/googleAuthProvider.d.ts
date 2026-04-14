import * as vscode from 'vscode';
export interface AccountData {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    saved_at?: number;
    email?: string;
    label: string;
}
export declare class GoogleAuthProvider implements vscode.AuthenticationProvider {
    private _context;
    static readonly id = "google-gmail";
    static readonly scopes: string[];
    private _onDidChangeSessions;
    readonly onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>;
    private _sessions;
    constructor(_context: vscode.ExtensionContext);
    /** Add a new Gmail account with a label. Opens OAuth flow. */
    addAccount(label: string): Promise<AccountData>;
    /** Switch active account by label. */
    switchAccount(label: string): AccountData | undefined;
    /** Remove an account by label. */
    removeAccountByLabel(label: string): void;
    /** Get all connected account labels with emails. */
    listAccounts(): Array<{
        label: string;
        email: string;
        active: boolean;
    }>;
    /** Get the active account label. */
    getActiveAccountLabel(): string;
    /** Get an access token for a specific account (by label). If no label, uses active. */
    getAccessTokenFor(label?: string): Promise<string | undefined>;
    private _tryRestore;
    private _rebuildSessions;
    private _makeSession;
    getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]>;
    createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession>;
    removeSession(_sessionId?: string): Promise<void>;
    getAccessToken(): Promise<string | undefined>;
    private _promptLabel;
    private _getClientCreds;
    private _startOAuthFlow;
    private _exchangeCode;
    private _refreshAccessToken;
    private _fetchUserInfo;
    private _postForm;
}
//# sourceMappingURL=googleAuthProvider.d.ts.map