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
    parentId: string | null;
    entries: SessionEntry[];
}
export interface SessionMeta {
    id: string;
    startTime: string;
    endTime: string;
    toolCount: number;
    preview: string;
    parentId: string | null;
}
export declare function logToolCall(tool: string, input: Record<string, unknown> | undefined, output: string): void;
export declare function listSessions(limit?: number): SessionMeta[];
export declare function searchSessions(query: string, maxResults?: number): Array<{
    sessionId: string;
    sessionDate: string;
    tool: string;
    input: string;
    output: string;
    timestamp: string;
}>;
export declare function getSession(id: string): Session | null;
export declare function getCurrentSessionId(): string | null;
export declare function setParentSession(parentId: string): void;
export declare function closeDb(): void;
//# sourceMappingURL=sessionStore.d.ts.map