import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ───────────────────────────────────────────────────

export interface MemoryEntry {
    content: string;
    created: string; // ISO timestamp
}

export interface MemoryStore {
    memory: MemoryEntry[];   // Agent's personal notes (environment, conventions, lessons)
    user: MemoryEntry[];     // User profile (preferences, style, expectations)
}

// ── Constants ───────────────────────────────────────────────

const MEMORY_DIR = path.join(os.homedir(), '.copilot-minimax');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.json');
const MEMORY_CHAR_LIMIT = 2200;  // ~800 tokens — agent notes
const USER_CHAR_LIMIT = 1375;    // ~500 tokens — user profile

// ── Injection-pattern blocklist ─────────────────────────────

const BLOCKED_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now\s+(a\s+)?/i,
    /system\s*:\s*/i,
    /\<\|im_start\|/i,
    /\<\|im_end\|/i,
    /ASSISTANT\s*:/i,
    /HUMAN\s*:/i,
    /<script/i,
    /javascript:/i,
    /data:text\/html/i,
];

// ── Helpers ─────────────────────────────────────────────────

function ensureDir(): void {
    if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
}

function load(): MemoryStore {
    ensureDir();
    if (!fs.existsSync(MEMORY_FILE)) {
        return { memory: [], user: [] };
    }
    try {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
        const data = JSON.parse(raw);
        return {
            memory: Array.isArray(data.memory) ? data.memory : [],
            user: Array.isArray(data.user) ? data.user : [],
        };
    } catch {
        return { memory: [], user: [] };
    }
}

function save(store: MemoryStore): void {
    ensureDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function totalChars(entries: MemoryEntry[]): number {
    return entries.reduce((sum, e) => sum + e.content.length, 0);
}

function charLimit(target: 'memory' | 'user'): number {
    return target === 'memory' ? MEMORY_CHAR_LIMIT : USER_CHAR_LIMIT;
}

function scanForInjection(content: string): string | null {
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(content)) {
            return `Blocked: content matches injection pattern (${pattern.source})`;
        }
    }
    // Check for invisible Unicode characters
    if (/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/.test(content)) {
        return 'Blocked: content contains invisible Unicode characters';
    }
    return null;
}

// ── Public API ──────────────────────────────────────────────

export function memoryAdd(target: 'memory' | 'user', content: string): { success: boolean; message: string } {
    const trimmed = content.trim();
    if (!trimmed) {
        return { success: false, message: 'Content cannot be empty.' };
    }

    const injectionError = scanForInjection(trimmed);
    if (injectionError) {
        return { success: false, message: injectionError };
    }

    const store = load();
    const entries = store[target];
    const limit = charLimit(target);
    const used = totalChars(entries);

    // Duplicate check
    if (entries.some(e => e.content === trimmed)) {
        return { success: true, message: 'Entry already exists — no duplicate added.' };
    }

    if (used + trimmed.length > limit) {
        const existing = entries.map((e, i) => `[${i}] ${e.content}`).join('\n');
        return {
            success: false,
            message: `${target} at ${used}/${limit} chars. Adding this entry (${trimmed.length} chars) would exceed the limit. Replace or remove existing entries first.\n\nCurrent entries:\n${existing}\n\nUsage: ${used}/${limit}`,
        };
    }

    entries.push({ content: trimmed, created: new Date().toISOString() });
    save(store);

    return {
        success: true,
        message: `Added to ${target}. Usage: ${used + trimmed.length}/${limit} chars (${entries.length} entries).`,
    };
}

export function memoryRemove(target: 'memory' | 'user', substring: string): { success: boolean; message: string } {
    const store = load();
    const entries = store[target];
    const matches = entries.filter(e => e.content.toLowerCase().includes(substring.toLowerCase()));

    if (matches.length === 0) {
        return { success: false, message: `No entry in ${target} matches "${substring}".` };
    }
    if (matches.length > 1) {
        const items = matches.map(m => `• ${m.content.substring(0, 80)}...`).join('\n');
        return { success: false, message: `"${substring}" matches ${matches.length} entries — be more specific:\n${items}` };
    }

    const idx = entries.indexOf(matches[0]);
    entries.splice(idx, 1);
    save(store);

    return {
        success: true,
        message: `Removed from ${target}. Now ${totalChars(entries)}/${charLimit(target)} chars (${entries.length} entries).`,
    };
}

export function memoryReplace(target: 'memory' | 'user', oldSubstring: string, newContent: string): { success: boolean; message: string } {
    const trimmed = newContent.trim();
    if (!trimmed) {
        return { success: false, message: 'New content cannot be empty.' };
    }

    const injectionError = scanForInjection(trimmed);
    if (injectionError) {
        return { success: false, message: injectionError };
    }

    const store = load();
    const entries = store[target];
    const matches = entries.filter(e => e.content.toLowerCase().includes(oldSubstring.toLowerCase()));

    if (matches.length === 0) {
        return { success: false, message: `No entry in ${target} matches "${oldSubstring}".` };
    }
    if (matches.length > 1) {
        const items = matches.map(m => `• ${m.content.substring(0, 80)}...`).join('\n');
        return { success: false, message: `"${oldSubstring}" matches ${matches.length} entries — be more specific:\n${items}` };
    }

    const idx = entries.indexOf(matches[0]);
    const oldLen = entries[idx].content.length;
    const used = totalChars(entries) - oldLen;
    const limit = charLimit(target);

    if (used + trimmed.length > limit) {
        return {
            success: false,
            message: `Replacing would use ${used + trimmed.length}/${limit} chars — exceeds limit. Shorten the new content.`,
        };
    }

    entries[idx] = { content: trimmed, created: new Date().toISOString() };
    save(store);

    return {
        success: true,
        message: `Replaced in ${target}. Usage: ${used + trimmed.length}/${limit} chars (${entries.length} entries).`,
    };
}

export function memoryList(target?: 'memory' | 'user'): string {
    const store = load();
    const targets: ('memory' | 'user')[] = target ? [target] : ['memory', 'user'];
    const sections: string[] = [];

    for (const t of targets) {
        const entries = store[t];
        const used = totalChars(entries);
        const limit = charLimit(t);
        const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
        const label = t === 'memory' ? 'MEMORY (agent notes)' : 'USER PROFILE';

        if (entries.length === 0) {
            sections.push(`**${label}** [0% — 0/${limit} chars]\n_Empty_`);
        } else {
            const lines = entries.map(e => `• ${e.content}`).join('\n');
            sections.push(`**${label}** [${pct}% — ${used}/${limit} chars]\n${lines}`);
        }
    }

    return sections.join('\n\n---\n\n');
}

/**
 * Returns a compact memory snapshot for injection into tool responses.
 * Includes proactive guidance when memory is empty or under-utilized,
 * coaching the LLM to remember things about the user and environment.
 */
export function memorySnapshot(): string {
    const store = load();
    const parts: string[] = [];

    const memUsed = totalChars(store.memory);
    const userUsed = totalChars(store.user);
    const memPct = MEMORY_CHAR_LIMIT > 0 ? Math.round((memUsed / MEMORY_CHAR_LIMIT) * 100) : 0;
    const userPct = USER_CHAR_LIMIT > 0 ? Math.round((userUsed / USER_CHAR_LIMIT) * 100) : 0;

    if (store.memory.length > 0) {
        const lines = store.memory.map(e => e.content).join(' § ');
        parts.push(`🧠 MEMORY [${memPct}%]: ${lines}`);
    }

    if (store.user.length > 0) {
        const lines = store.user.map(e => e.content).join(' § ');
        parts.push(`👤 USER [${userPct}%]: ${lines}`);
    }

    // Proactive guidance: nudge the LLM to remember things when memory is low
    if (memPct < 40 || userPct < 40) {
        const nudges: string[] = [];
        if (userPct < 40) {
            nudges.push(
                'Memory is under-utilized. PROACTIVELY use memory_add when you learn: ' +
                'user preferences, corrections ("don\'t do X"), personal details (name, role, timezone), ' +
                'or communication style. The most valuable memory prevents the user from repeating themselves.'
            );
        }
        if (memPct < 40) {
            nudges.push(
                'Save environment facts (OS, tools, project structure), conventions, and lessons learned ' +
                'to memory target "memory". Keep entries concise and information-dense.'
            );
        }
        parts.push(`💡 ${nudges.join(' ')}`);
    }

    if (parts.length === 0) {
        return (
            '💡 Memory is empty. PROACTIVELY use memory_add to save things you learn about the user ' +
            '(preferences, corrections, personal details → target "user") and environment ' +
            '(OS, tools, project structure, conventions → target "memory"). ' +
            'Don\'t wait to be asked — the best memory prevents the user from repeating themselves.\n\n---\n\n'
        );
    }

    return parts.join('\n') + '\n\n---\n\n';
}
