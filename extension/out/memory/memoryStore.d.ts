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
 * Includes proactive guidance when memory is empty or under-utilized,
 * coaching the LLM to remember things about the user and environment.
 */
export declare function memorySnapshot(): string;
//# sourceMappingURL=memoryStore.d.ts.map