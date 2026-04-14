import * as vscode from 'vscode';
/**
 * Shared tool result helper that:
 * 1. Prepends memory snapshot to every response
 * 2. Logs the tool call to the session store
 *
 * All tool files should use this instead of a local textResult.
 */
export declare function toolResult(toolName: string, input: Record<string, any> | undefined, text: string): vscode.LanguageModelToolResult;
//# sourceMappingURL=toolResult.d.ts.map