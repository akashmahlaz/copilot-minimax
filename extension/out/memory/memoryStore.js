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
exports.memoryAdd = memoryAdd;
exports.memoryRemove = memoryRemove;
exports.memoryReplace = memoryReplace;
exports.memoryList = memoryList;
exports.memorySnapshot = memorySnapshot;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// ── Constants ───────────────────────────────────────────────
const MEMORY_DIR = path.join(os.homedir(), '.copilot-minimax');
const MEMORY_FILE = path.join(MEMORY_DIR, 'memory.json');
const MEMORY_CHAR_LIMIT = 2200; // ~800 tokens — agent notes
const USER_CHAR_LIMIT = 1375; // ~500 tokens — user profile
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
function ensureDir() {
    if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }
}
function load() {
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
    }
    catch {
        return { memory: [], user: [] };
    }
}
function save(store) {
    ensureDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), 'utf-8');
}
function totalChars(entries) {
    return entries.reduce((sum, e) => sum + e.content.length, 0);
}
function charLimit(target) {
    return target === 'memory' ? MEMORY_CHAR_LIMIT : USER_CHAR_LIMIT;
}
function scanForInjection(content) {
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
function memoryAdd(target, content) {
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
function memoryRemove(target, substring) {
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
function memoryReplace(target, oldSubstring, newContent) {
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
function memoryList(target) {
    const store = load();
    const targets = target ? [target] : ['memory', 'user'];
    const sections = [];
    for (const t of targets) {
        const entries = store[t];
        const used = totalChars(entries);
        const limit = charLimit(t);
        const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
        const label = t === 'memory' ? 'MEMORY (agent notes)' : 'USER PROFILE';
        if (entries.length === 0) {
            sections.push(`**${label}** [0% — 0/${limit} chars]\n_Empty_`);
        }
        else {
            const lines = entries.map(e => `• ${e.content}`).join('\n');
            sections.push(`**${label}** [${pct}% — ${used}/${limit} chars]\n${lines}`);
        }
    }
    return sections.join('\n\n---\n\n');
}
/**
 * Returns a compact memory snapshot for injection into tool responses.
 * Only returns non-empty entries. Returns empty string if no memory exists.
 */
function memorySnapshot() {
    const store = load();
    const parts = [];
    if (store.memory.length > 0) {
        const used = totalChars(store.memory);
        const pct = Math.round((used / MEMORY_CHAR_LIMIT) * 100);
        const lines = store.memory.map(e => e.content).join(' § ');
        parts.push(`🧠 MEMORY [${pct}%]: ${lines}`);
    }
    if (store.user.length > 0) {
        const used = totalChars(store.user);
        const pct = Math.round((used / USER_CHAR_LIMIT) * 100);
        const lines = store.user.map(e => e.content).join(' § ');
        parts.push(`👤 USER [${pct}%]: ${lines}`);
    }
    if (parts.length === 0) {
        return '';
    }
    return parts.join('\n') + '\n\n---\n\n';
}
//# sourceMappingURL=memoryStore.js.map