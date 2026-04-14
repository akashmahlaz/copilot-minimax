import { GoogleAuthProvider } from '../auth/googleAuthProvider';
export interface EmailMessage {
    id: string;
    threadId: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    snippet: string;
    body: string;
    labelIds: string[];
    isUnread: boolean;
}
export interface GmailLabel {
    id: string;
    name: string;
    type: string;
}
export declare class GmailClient {
    private auth;
    private _tokenOverride?;
    constructor(auth: GoogleAuthProvider);
    /** Set a per-request token override (for multi-account operations). */
    useToken(token: string): void;
    /** Clear the token override back to default (active account). */
    clearToken(): void;
    listMessages(query?: string, maxResults?: number): Promise<EmailMessage[]>;
    getMessage(id: string): Promise<EmailMessage>;
    sendEmail(to: string, subject: string, body: string): Promise<void>;
    replyToEmail(messageId: string, body: string): Promise<void>;
    modifyLabels(messageId: string, addLabelIds: string[], removeLabelIds: string[]): Promise<void>;
    markAsRead(messageId: string): Promise<void>;
    markAsUnread(messageId: string): Promise<void>;
    archiveMessage(messageId: string): Promise<void>;
    trashMessage(messageId: string): Promise<void>;
    getLabels(): Promise<GmailLabel[]>;
    private _requireToken;
    private _get;
    private _post;
}
//# sourceMappingURL=gmailClient.d.ts.map