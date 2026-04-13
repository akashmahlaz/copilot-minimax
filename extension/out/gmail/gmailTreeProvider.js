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
exports.GmailTreeProvider = void 0;
const vscode = __importStar(require("vscode"));
class GmailTreeProvider {
    client;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(client) {
        this.client = client;
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    async getChildren(element) {
        if (element) {
            return [];
        }
        try {
            const messages = await this.client.listMessages('in:inbox', 25);
            if (messages.length === 0) {
                return [EmailTreeItem.info('Your inbox is empty')];
            }
            return messages.map(msg => EmailTreeItem.fromEmail(msg));
        }
        catch {
            // Not connected — welcome view will show the connect button
            return [];
        }
    }
    getTreeItem(element) {
        return element;
    }
}
exports.GmailTreeProvider = GmailTreeProvider;
class EmailTreeItem extends vscode.TreeItem {
    messageId;
    constructor(label) {
        super(label, vscode.TreeItemCollapsibleState.None);
    }
    static info(text) {
        const item = new EmailTreeItem(text);
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }
    static fromEmail(msg) {
        const subject = msg.subject || '(no subject)';
        const sender = msg.from.replace(/<.*>/, '').trim();
        const item = new EmailTreeItem(subject);
        item.messageId = msg.id;
        item.description = sender;
        item.contextValue = 'email';
        item.tooltip = new vscode.MarkdownString(`**${escapeMarkdown(subject)}**\n\nFrom: ${escapeMarkdown(sender)}\n\n${escapeMarkdown(msg.snippet)}`);
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
function escapeMarkdown(text) {
    return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}
//# sourceMappingURL=gmailTreeProvider.js.map