export interface MemoryEntry {
    content: string;
    created: string;
}
export interface MemoryStore {
    memory: MemoryEntry[];
    user: MemoryEntry[];
}
export declare function memoryAdd(target: 'memory' | 'user', content: string): {
    success: boolean;
    message: string;
};
export declare function memoryRemove(target: 'memory' | 'user', substring: string): {
    success: boolean;
    message: string;
};
export declare function memoryReplace(target: 'memory' | 'user', oldSubstring: string, newContent: string): {
    success: boolean;
    message: string;
};
export declare function memoryList(target?: 'memory' | 'user'): string;
/**
 * Returns a compact memory snapshot for injection into tool responses.
 * Only returns non-empty entries. Returns empty string if no memory exists.
 */
export declare function memorySnapshot(): string;
//# sourceMappingURL=memoryStore.d.ts.map