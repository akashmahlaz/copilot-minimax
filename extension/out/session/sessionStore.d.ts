export interface SessionEntry {
    timestamp: string;
    tool: string;
    input: string;
    output: string;
}
export interface Session {
    id: string;
    startTime: string;
    endTime: string;
    toolCount: number;
    preview: string;
    entries: SessionEntry[];
}
interface SessionIndex {
    id: string;
    startTime: string;
    endTime: string;
    toolCount: number;
    preview: string;
}
/**
 * Record a tool invocation to the current session.
 * Called by every tool's textResult wrapper.
 */
export declare function logToolCall(tool: string, input: Record<string, any> | undefined, output: string): void;
/**
 * List past sessions (most recent first).
 */
export declare function listSessions(limit?: number): SessionIndex[];
/**
 * Search across all sessions for a keyword/phrase.
 * Returns matching entries with session context.
 */
export declare function searchSessions(query: string, maxResults?: number): Array<{
    sessionId: string;
    sessionDate: string;
    tool: string;
    input: string;
    output: string;
    timestamp: string;
}>;
/**
 * Load full session details for resuming context.
 */
export declare function getSession(id: string): Session | null;
/**
 * Get current session ID (for reference).
 */
export declare function getCurrentSessionId(): string | null;
export {};
//# sourceMappingURL=sessionStore.d.ts.map