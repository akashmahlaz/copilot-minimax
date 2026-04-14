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
exports.logToolCall = logToolCall;
exports.listSessions = listSessions;
exports.searchSessions = searchSessions;
exports.getSession = getSession;
exports.getCurrentSessionId = getCurrentSessionId;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// ── Constants ───────────────────────────────────────────────
const SESSIONS_DIR = path.join(os.homedir(), '.copilot-minimax', 'sessions');
const INDEX_FILE = path.join(SESSIONS_DIR, 'index.json');
const MAX_OUTPUT_CHARS = 500; // Stored per entry
const MAX_ENTRIES_PER_SESSION = 200;
const MAX_SESSIONS = 500; // Prune oldest beyond this
// ── State ───────────────────────────────────────────────────
let currentSessionId = null;
// ── Helpers ─────────────────────────────────────────────────
function ensureDir() {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}
function generateId() {
    const date = new Date().toISOString().slice(0, 10); // 2026-04-14
    const rand = Math.random().toString(36).slice(2, 6); // 4-char random
    return `${date}_${rand}`;
}
function loadIndex() {
    ensureDir();
    if (!fs.existsSync(INDEX_FILE)) {
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
function saveIndex(index) {
    ensureDir();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}
function sessionPath(id) {
    // Sanitize id to prevent path traversal
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(SESSIONS_DIR, `${safe}.json`);
}
function loadSession(id) {
    const p = sessionPath(id);
    if (!fs.existsSync(p)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    catch {
        return null;
    }
}
function saveSession(session) {
    ensureDir();
    fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
}
/** Sanitize input — remove tokens, secrets, keys */
function sanitizeInput(input) {
    if (!input) {
        return '{}';
    }
    const clean = {};
    for (const [k, v] of Object.entries(input)) {
        const lk = k.toLowerCase();
        if (lk.includes('token') || lk.includes('secret') || lk.includes('key') || lk.includes('password')) {
            clean[k] = '***';
        }
        else if (typeof v === 'string' && v.length > 200) {
            clean[k] = v.substring(0, 200) + '…';
        }
        else {
            clean[k] = v;
        }
    }
    return JSON.stringify(clean);
}
// ── Public API ──────────────────────────────────────────────
/**
 * Record a tool invocation to the current session.
 * Called by every tool's textResult wrapper.
 */
function logToolCall(tool, input, output) {
    try {
        ensureDir();
        // Start new session if needed
        if (!currentSessionId) {
            currentSessionId = generateId();
        }
        let session = loadSession(currentSessionId);
        if (!session) {
            session = {
                id: currentSessionId,
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                toolCount: 0,
                preview: '',
                entries: [],
            };
        }
        if (session.entries.length >= MAX_ENTRIES_PER_SESSION) {
            return;
        }
        const entry = {
            timestamp: new Date().toISOString(),
            tool,
            input: sanitizeInput(input),
            output: output.substring(0, MAX_OUTPUT_CHARS),
        };
        session.entries.push(entry);
        session.endTime = entry.timestamp;
        session.toolCount = session.entries.length;
        if (!session.preview) {
            session.preview = `${tool}: ${entry.input.substring(0, 100)}`;
        }
        saveSession(session);
        // Update index
        const index = loadIndex();
        const existing = index.findIndex(s => s.id === session.id);
        const meta = {
            id: session.id,
            startTime: session.startTime,
            endTime: session.endTime,
            toolCount: session.toolCount,
            preview: session.preview,
        };
        if (existing >= 0) {
            index[existing] = meta;
        }
        else {
            index.push(meta);
        }
        // Prune oldest sessions
        if (index.length > MAX_SESSIONS) {
            const removed = index.splice(0, index.length - MAX_SESSIONS);
            for (const r of removed) {
                const p = sessionPath(r.id);
                if (fs.existsSync(p)) {
                    fs.unlinkSync(p);
                }
            }
        }
        saveIndex(index);
    }
    catch {
        // Logging should never break tool execution
    }
}
/**
 * List past sessions (most recent first).
 */
function listSessions(limit = 20) {
    const index = loadIndex();
    return index.slice(-limit).reverse();
}
/**
 * Search across all sessions for a keyword/phrase.
 * Returns matching entries with session context.
 */
function searchSessions(query, maxResults = 15) {
    const index = loadIndex();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = [];
    // Search most recent sessions first
    for (let i = index.length - 1; i >= 0 && results.length < maxResults; i--) {
        const meta = index[i];
        const session = loadSession(meta.id);
        if (!session) {
            continue;
        }
        for (const entry of session.entries) {
            if (results.length >= maxResults) {
                break;
            }
            const haystack = `${entry.tool} ${entry.input} ${entry.output}`.toLowerCase();
            if (terms.every(t => haystack.includes(t))) {
                results.push({
                    sessionId: session.id,
                    sessionDate: session.startTime.slice(0, 10),
                    tool: entry.tool,
                    input: entry.input,
                    output: entry.output,
                    timestamp: entry.timestamp,
                });
            }
        }
    }
    return results;
}
/**
 * Load full session details for resuming context.
 */
function getSession(id) {
    return loadSession(id);
}
/**
 * Get current session ID (for reference).
 */
function getCurrentSessionId() {
    return currentSessionId;
}
//# sourceMappingURL=sessionStore.js.map