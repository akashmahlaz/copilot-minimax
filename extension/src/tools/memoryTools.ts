import * as vscode from 'vscode';
import { memoryAdd, memoryRemove, memoryReplace, memoryList, memorySnapshot } from '../memory/memoryStore';
import { logToolCall } from '../session/sessionStore';

// ── Helpers ─────────────────────────────────────────────────

function textResult(text: string): vscode.LanguageModelToolResult {
    const snap = memorySnapshot();
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(snap + text)]);
}

function logged<T>(toolName: string, fn: (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken) => Promise<vscode.LanguageModelToolResult>) {
    return async (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken): Promise<vscode.LanguageModelToolResult> => {
        const result = await fn(options, token);
        const text = (result.content[0] as any)?.value || '';
        logToolCall(toolName, options.input as any, text);
        return result;
    };
}

/** Re-export for other tool files to prepend memory context. */
export { memorySnapshot };

// ── Tool Registration ───────────────────────────────────────

export function registerMemoryTools(context: vscode.ExtensionContext): void {

    // ── memory_add ──────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('memory_add', {
            prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<{ target: 'memory' | 'user'; content: string }>, _token) {
                const target = options.input?.target || 'memory';
                return { invocationMessage: `Saving to ${target}…` };
            },
            invoke: logged<{
                target: 'memory' | 'user';
                content: string;
            }>('memory_add', async (options, _token) => {
                const target = options.input?.target || 'memory';
                const content = options.input?.content;

                if (!content) {
                    return textResult('Please provide content to remember.');
                }

                if (target !== 'memory' && target !== 'user') {
                    return textResult('Target must be "memory" (agent notes) or "user" (user profile).');
                }

                const result = memoryAdd(target, content);
                return textResult(result.message);
            })
        })
    );

    // ── memory_remove ───────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('memory_remove', {
            prepareInvocation(_options, _token) {
                return { invocationMessage: 'Removing memory entry…' };
            },
            invoke: logged<{
                target: 'memory' | 'user';
                substring: string;
            }>('memory_remove', async (options, _token) => {
                const target = options.input?.target || 'memory';
                const substring = options.input?.substring;

                if (!substring) {
                    return textResult('Please provide a substring to identify the entry to remove.');
                }

                if (target !== 'memory' && target !== 'user') {
                    return textResult('Target must be "memory" or "user".');
                }

                const result = memoryRemove(target, substring);
                return textResult(result.message);
            })
        })
    );

    // ── memory_replace ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('memory_replace', {
            prepareInvocation(_options, _token) {
                return { invocationMessage: 'Updating memory entry…' };
            },
            invoke: logged<{
                target: 'memory' | 'user';
                old_text: string;
                content: string;
            }>('memory_replace', async (options, _token) => {
                const target = options.input?.target || 'memory';
                const oldText = options.input?.old_text;
                const content = options.input?.content;

                if (!oldText || !content) {
                    return textResult('Provide both old_text (substring to find) and content (replacement text).');
                }

                if (target !== 'memory' && target !== 'user') {
                    return textResult('Target must be "memory" or "user".');
                }

                const result = memoryReplace(target, oldText, content);
                return textResult(result.message);
            })
        })
    );

    // ── memory_list ─────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('memory_list', {
            prepareInvocation(_options, _token) {
                return { invocationMessage: 'Loading memory…' };
            },
            invoke: logged<{
                target?: 'memory' | 'user';
            }>('memory_list', async (options, _token) => {
                const target = options.input?.target;

                if (target && target !== 'memory' && target !== 'user') {
                    return textResult('Target must be "memory", "user", or omitted (show both).');
                }

                const listing = memoryList(target || undefined);
                return textResult(listing);
            })
        })
    );
}
