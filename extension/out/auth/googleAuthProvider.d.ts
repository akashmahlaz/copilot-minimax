import * as vscode from 'vscode';
export declare class GoogleAuthProvider implements vscode.AuthenticationProvider {
    private _context;
    static readonly id = "google-gmail";
    static readonly scopes: string[];
    private _onDidChangeSessions;
    readonly onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>;
    private _sessions;
    constructor(_context: vscode.ExtensionContext);
    private _tryRestore;
    private _makeSession;
    getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]>;
    createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession>;
    removeSession(_sessionId?: string): Promise<void>;
    getAccessToken(): Promise<string | undefined>;
    private _getClientCreds;
    private _startOAuthFlow;
    private _exchangeCode;
    private _refreshAccessToken;
    private _fetchUserInfo;
    private _postForm;
}
//# sourceMappingURL=googleAuthProvider.d.ts.map