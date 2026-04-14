import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ───────────────────────────────────────────────────

export interface SessionEntry {
    timestamp: string;       // ISO timestamp
    tool: string;            // Tool name (e.g. 'gmail_check_inbox')
    input: string;           // Summarised input (sanitized — no tokens/secrets)
    output: string;          // First 500 chars of output
}

export interface Session {
    id: string;              // e.g. '2026-04-14_a3f1'
    startTime: string;       // ISO timestamp of first entry
    endTime: string;         // ISO timestamp of last entry
    toolCount: number;
    preview: string;         // First tool call summary
    entries: SessionEntry[];
}

interface SessionIndex {
    id: string;
    startTime: string;
    endTime: string;
    toolCount: number;
    preview: string;
}

// ── Constants ───────────────────────────────────────────────

const SESSIONS_DIR = path.join(os.homedir(), '.copilot-minimax', 'sessions');
const INDEX_FILE = path.join(SESSIONS_DIR, 'index.json');
const MAX_OUTPUT_CHARS = 500;      // Stored per entry
const MAX_ENTRIES_PER_SESSION = 200;
const MAX_SESSIONS = 500;          // Prune oldest beyond this

// ── State ───────────────────────────────────────────────────

let currentSessionId: string | null = null;

// ── Helpers ─────────────────────────────────────────────────

function ensureDir(): void {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
}

function generateId(): string {
    const date = new Date().toISOString().slice(0, 10);  // 2026-04-14
    const rand = Math.random().toString(36).slice(2, 6); // 4-char random
    return `${date}_${rand}`;
}

function loadIndex(): SessionIndex[] {
    ensureDir();
    if (!fs.existsSync(INDEX_FILE)) { return []; }
    try {
        return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    } catch { return []; }
}

function saveIndex(index: SessionIndex[]): void {
    ensureDir();
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf-8');
}

function sessionPath(id: string): string {
    // Sanitize id to prevent path traversal
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.join(SESSIONS_DIR, `${safe}.json`);
}

function loadSession(id: string): Session | null {
    const p = sessionPath(id);
    if (!fs.existsSync(p)) { return null; }
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch { return null; }
}

function saveSession(session: Session): void {
    ensureDir();
    fs.writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
}

/** Sanitize input — remove tokens, secrets, keys */
function sanitizeInput(input: Record<string, any> | undefined): string {
    if (!input) { return '{}'; }
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
        const lk = k.toLowerCase();
        if (lk.includes('token') || lk.includes('secret') || lk.includes('key') || lk.includes('password')) {
            clean[k] = '***';
        } else if (typeof v === 'string' && v.length > 200) {
            clean[k] = v.substring(0, 200) + '…';
        } else {
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
export function logToolCall(tool: string, input: Record<string, any> | undefined, output: string): void {
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

        if (session.entries.length >= MAX_ENTRIES_PER_SESSION) { return; }

        const entry: SessionEntry = {
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
        const existing = index.findIndex(s => s.id === session!.id);
        const meta: SessionIndex = {
            id: session.id,
            startTime: session.startTime,
            endTime: session.endTime,
            toolCount: session.toolCount,
            preview: session.preview,
        };
        if (existing >= 0) {
            index[existing] = meta;
        } else {
            index.push(meta);
        }

        // Prune oldest sessions
        if (index.length > MAX_SESSIONS) {
            const removed = index.splice(0, index.length - MAX_SESSIONS);
            for (const r of removed) {
                const p = sessionPath(r.id);
                if (fs.existsSync(p)) { fs.unlinkSync(p); }
            }
        }

        saveIndex(index);
    } catch {
        // Logging should never break tool execution
    }
}

/**
 * List past sessions (most recent first).
 */
export function listSessions(limit: number = 20): SessionIndex[] {
    const index = loadIndex();
    return index.slice(-limit).reverse();
}

/**
 * Search across all sessions for a keyword/phrase.
 * Returns matching entries with session context.
 */
export function searchSessions(query: string, maxResults: number = 15): Array<{
    sessionId: string;
    sessionDate: string;
    tool: string;
    input: string;
    output: string;
    timestamp: string;
}> {
    const index = loadIndex();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results: Array<{
        sessionId: string;
        sessionDate: string;
        tool: string;
        input: string;
        output: string;
        timestamp: string;
    }> = [];

    // Search most recent sessions first
    for (let i = index.length - 1; i >= 0 && results.length < maxResults; i--) {
        const meta = index[i];
        const session = loadSession(meta.id);
        if (!session) { continue; }

        for (const entry of session.entries) {
            if (results.length >= maxResults) { break; }

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
export function getSession(id: string): Session | null {
    return loadSession(id);
}

/**
 * Get current session ID (for reference).
 */
export function getCurrentSessionId(): string | null {
    return currentSessionId;
}
