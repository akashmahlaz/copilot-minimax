import * as vscode from 'vscode';
import { GmailClient, EmailMessage } from './gmailClient';
export declare class GmailTreeProvider implements vscode.TreeDataProvider<EmailTreeItem> {
    private client;
    private _onDidChangeTreeData;
    readonly onDidChangeTreeData: vscode.Event<EmailTreeItem | undefined>;
    constructor(client: GmailClient);
    refresh(): void;
    getChildren(element?: EmailTreeItem): Promise<EmailTreeItem[]>;
    getTreeItem(element: EmailTreeItem): vscode.TreeItem;
}
declare class EmailTreeItem extends vscode.TreeItem {
    messageId?: string;
    private constructor();
    static info(text: string): EmailTreeItem;
    static fromEmail(msg: EmailMessage): EmailTreeItem;
}
export {};
//# sourceMappingURL=gmailTreeProvider.d.ts.map