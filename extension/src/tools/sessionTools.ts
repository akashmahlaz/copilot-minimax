import * as vscode from 'vscode';
import { listSessions, searchSessions, getSession, setParentSession } from '../session/sessionStore';

// ── Helpers ─────────────────────────────────────────────────

function textResult(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

// ── Tool Registration ───────────────────────────────────────

export function registerSessionTools(context: vscode.ExtensionContext): void {

    // ── session_search ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('session_search', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{
                query: string;
                maxResults?: number;
            }>, _token) {
                const query = options.input?.query;
                if (!query) {
                    return textResult('Please provide a search query (e.g. "vercel deployment", "gmail john", "s3 bucket").');
                }

                const max = options.input?.maxResults ?? 15;
                const results = searchSessions(query, max);

                if (results.length === 0) {
                    return textResult(`No past sessions match "${query}". Try broader keywords.`);
                }

                const lines = results.map((r, i) => {
                    return `**${i + 1}.** \`${r.tool}\` — ${r.sessionDate}\n   Input: ${r.input.substring(0, 120)}\n   Output: ${r.output.substring(0, 150)}…\n   Session: ${r.sessionId}`;
                });

                return textResult(
                    `🔍 **Session search: "${query}"** — ${results.length} result(s)\n\n${lines.join('\n\n')}\n\n` +
                    `Use session_resume with a session ID to load full context.`
                );
            }
        })
    );

    // ── session_list ────────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('session_list', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{
                limit?: number;
            }>, _token) {
                const limit = options.input?.limit ?? 20;
                const sessions = listSessions(limit);

                if (sessions.length === 0) {
                    return textResult('No past sessions found. Sessions are recorded as you use tools.');
                }

                const lines = sessions.map((s, i) => {
                    const date = s.startTime.slice(0, 16).replace('T', ' ');
                    return `${i + 1}. **${s.id}** — ${date} — ${s.toolCount} tool call(s)\n   ${s.preview}`;
                });

                return textResult(
                    `📋 **Past sessions** (${sessions.length} most recent)\n\n${lines.join('\n\n')}\n\n` +
                    `Use session_search to find specific conversations, or session_resume with a session ID.`
                );
            }
        })
    );

    // ── session_resume ──────────────────────────────────────

    context.subscriptions.push(
        vscode.lm.registerTool('session_resume', {
            async invoke(options: vscode.LanguageModelToolInvocationOptions<{
                sessionId: string;
            }>, _token) {
                const id = options.input?.sessionId;
                if (!id) {
                    return textResult('Please provide a session ID. Use session_list to browse available sessions.');
                }

                const session = getSession(id);
                if (!session) {
                    return textResult(`Session "${id}" not found. Use session_list to see available sessions.`);
                }

                // Set lineage — current session is a child of the resumed one
                setParentSession(id);

                const lineage = session.parentId ? `\nParent session: ${session.parentId}` : '';

                const entries = session.entries.map((e, i) => {
                    const time = e.timestamp.slice(11, 16);
                    return `**${i + 1}. ${e.tool}** (${time})\n   → ${e.input.substring(0, 150)}\n   ← ${e.output.substring(0, 200)}`;
                });

                return textResult(
                    `📂 **Session ${session.id}**\n` +
                    `Started: ${session.startTime.slice(0, 16).replace('T', ' ')}\n` +
                    `Ended: ${session.endTime.slice(0, 16).replace('T', ' ')}\n` +
                    `Tool calls: ${session.toolCount}${lineage}\n\n` +
                    `---\n\n${entries.join('\n\n')}\n\n---\n\n` +
                    `This is the full context from that session. You can continue from where it left off.`
                );
            }
        })
    );
}
