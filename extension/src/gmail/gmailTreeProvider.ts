import * as vscode from 'vscode';
import { GmailClient, EmailMessage } from './gmailClient';

export class GmailTreeProvider implements vscode.TreeDataProvider<EmailTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<EmailTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private client: GmailClient) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    async getChildren(element?: EmailTreeItem): Promise<EmailTreeItem[]> {
        if (element) { return []; }

        try {
            const messages = await this.client.listMessages('in:inbox', 25);

            if (messages.length === 0) {
                return [EmailTreeItem.info('Your inbox is empty')];
            }

            return messages.map(msg => EmailTreeItem.fromEmail(msg));
        } catch {
            // Not connected — welcome view will show the connect button
            return [];
        }
    }

    getTreeItem(element: EmailTreeItem): vscode.TreeItem {
        return element;
    }
}

class EmailTreeItem extends vscode.TreeItem {
    messageId?: string;

    private constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }

    static info(text: string): EmailTreeItem {
        const item = new EmailTreeItem(text);
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }

    static fromEmail(msg: EmailMessage): EmailTreeItem {
        const subject = msg.subject || '(no subject)';
        const sender = msg.from.replace(/<.*>/, '').trim();

        const item = new EmailTreeItem(subject);
        item.messageId = msg.id;
        item.description = sender;
        item.contextValue = 'email';

        item.tooltip = new vscode.MarkdownString(
            `**${escapeMarkdown(subject)}**\n\nFrom: ${escapeMarkdown(sender)}\n\n${escapeMarkdown(msg.snippet)}`
        );

        item.iconPath = msg.isUnread
            ? new vscode.ThemeIcon('mail', new vscode.ThemeColor('charts.blue'))
            : new vscode.ThemeIcon('mail-read');

        item.command = {
            command: 'gmail-connector.readEmail',
            title: 'Read Email',
            arguments: [item],
        };

        return item;
    }
}

function escapeMarkdown(text: string): string {
    return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}
