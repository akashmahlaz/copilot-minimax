import * as vscode from 'vscode';
import { memorySnapshot } from '../memory/memoryStore';
import { logToolCall } from '../session/sessionStore';

/**
 * Shared tool result helper that:
 * 1. Prepends memory snapshot to every response
 * 2. Logs the tool call to the session store
 *
 * All tool files should use this instead of a local textResult.
 */
export function toolResult(toolName: string, input: Record<string, any> | undefined, text: string): vscode.LanguageModelToolResult {
    // Log to session (async-safe, never throws)
    logToolCall(toolName, input, text);

    // Prepend memory context
    const mem = memorySnapshot();
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(mem + text),
    ]);
}
