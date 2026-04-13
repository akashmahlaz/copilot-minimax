import * as vscode from 'vscode';
export declare class GoogleAuthProvider implements vscode.AuthenticationProvider {
    private _context;
    static readonly id = "google-gmail";
    static readonly scopes: string[];
    private _onDidChangeSessions;
    readonly onDidChangeSessions: vscode.Event<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>;
    private _sessions;
    private _refreshToken;
    constructor(_context: vscode.ExtensionContext);
    private _restoreSession;
    getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]>;
    createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession>;
    removeSession(_sessionId?: string): Promise<void>;
    /**
     * Get a valid access token, refreshing if necessary.
     */
    getAccessToken(): Promise<string | undefined>;
    private _startOAuthFlow;
    private _exchangeCode;
    private _refreshAccessToken;
    private _fetchUserInfo;
    private _postForm;
}
//# sourceMappingURL=googleAuthProvider.d.ts.map