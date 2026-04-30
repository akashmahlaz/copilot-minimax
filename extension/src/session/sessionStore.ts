import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ───────────────────────────────────────────────────

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

// ── Constants ───────────────────────────────────────────────

const MAX_OUTPUT_CHARS = 500;
const MAX_ENTRIES_PER_SESSION = 200;
const MAX_SESSIONS = 500;

// ── State ───────────────────────────────────────────────────

let db: Database.Database | null = null;
let currentSessionId: string | null = null;

// ── Paths (functions for testability — respects os.homedir mock) ──

function dbDir(): string {
    return path.join(os.homedir(), '.copilot-minimax');
}

function dbPath(): string {
    return path.join(dbDir(), 'sessions.db');
}

function jsonSessionsDir(): string {
    return path.join(dbDir(), 'sessions');
}

// ── Database ────────────────────────────────────────────────

function ensureDb(): Database.Database {
    if (db) { return db; }

    const dir = dbDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            tool_count INTEGER DEFAULT 0,
            preview TEXT DEFAULT '',
            parent_id TEXT
        );

        CREATE TABLE IF NOT EXISTS entries (
            rowid INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            tool TEXT NOT NULL,
            input TEXT DEFAULT '{}',
            output TEXT DEFAULT '',
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
            tool, input, output,
            content='entries',
            content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
            INSERT INTO entries_fts(rowid, tool, input, output)
            VALUES (new.rowid, new.tool, new.input, new.output);
        END;

        CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, tool, input, output)
            VALUES ('delete', old.rowid, old.tool, old.input, old.output);
        END;

        CREATE INDEX IF NOT EXISTS idx_entries_session ON entries(session_id);
    `);

    migrateJsonSessions();

    return db;
}

// ── JSON → SQLite Migration ─────────────────────────────────

function migrateJsonSessions(): void {
    const jsonDir = jsonSessionsDir();
    const indexFile = path.join(jsonDir, 'index.json');
    if (!fs.existsSync(indexFile)) { return; }

    try {
        const index: Array<{
            id: string;
            startTime: string;
            endTime: string;
            toolCount: number;
            preview: string;
        }> = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));

        const d = db!;
        const insertSession = d.prepare(
            'INSERT OR IGNORE INTO sessions (id, start_time, end_time, tool_count, preview) VALUES (?, ?, ?, ?, ?)'
        );
        const insertEntry = d.prepare(
            'INSERT INTO entries (session_id, timestamp, tool, input, output) VALUES (?, ?, ?, ?, ?)'
        );

        const migrate = d.transaction(() => {
            for (const meta of index) {
                const safeId = meta.id.replace(/[^a-zA-Z0-9_-]/g, '');
                const sessFile = path.join(jsonDir, `${safeId}.json`);
                if (!fs.existsSync(sessFile)) { continue; }

                try {
                    const session = JSON.parse(fs.readFileSync(sessFile, 'utf-8'));
                    insertSession.run(meta.id, meta.startTime, meta.endTime, meta.toolCount, meta.preview);

                    for (const entry of session.entries || []) {
                        insertEntry.run(meta.id, entry.timestamp, entry.tool, entry.input, entry.output);
                    }
                } catch { /* skip corrupt session files */ }
            }
        });

        migrate();

        // Rename JSON dir so migration doesn't re-run
        const bakDir = jsonDir + '.migrated';
        if (!fs.existsSync(bakDir)) {
            fs.renameSync(jsonDir, bakDir);
        }
    } catch { /* migration is best-effort */ }
}

// ── Helpers ─────────────────────────────────────────────────

function generateId(): string {
    const date = new Date().toISOString().slice(0, 10);
    const rand = Math.random().toString(36).slice(2, 6);
    return `${date}_${rand}`;
}

function sanitizeInput(input: Record<string, unknown> | undefined): string {
    if (!input) { return '{}'; }
    const clean: Record<string, unknown> = {};
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

/** Sanitize FTS5 query — quote each term to prevent operator injection. */
function sanitizeFtsQuery(query: string): string {
    const cleaned = query.replace(/[^\w\s@._-]/g, ' ');
    const terms = cleaned.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) { return ''; }
    return terms.map(t => `"${t}"`).join(' ');
}

// ── Public API ──────────────────────────────────────────────

export function logToolCall(tool: string, input: Record<string, unknown> | undefined, output: string): void {
    try {
        const d = ensureDb();

        if (!currentSessionId) {
            currentSessionId = generateId();
        }

        const existing = d.prepare(
            'SELECT tool_count FROM sessions WHERE id = ?'
        ).get(currentSessionId) as { tool_count: number } | undefined;

        if (existing && existing.tool_count >= MAX_ENTRIES_PER_SESSION) { return; }

        const sanitizedInput = sanitizeInput(input);
        const truncatedOutput = output.substring(0, MAX_OUTPUT_CHARS);
        const now = new Date().toISOString();

        if (!existing) {
            d.prepare(
                'INSERT INTO sessions (id, start_time, end_time, tool_count, preview) VALUES (?, ?, ?, 0, ?)'
            ).run(currentSessionId, now, now, `${tool}: ${sanitizedInput.substring(0, 100)}`);
        }

        d.prepare(
            'INSERT INTO entries (session_id, timestamp, tool, input, output) VALUES (?, ?, ?, ?, ?)'
        ).run(currentSessionId, now, tool, sanitizedInput, truncatedOutput);

        d.prepare(
            'UPDATE sessions SET end_time = ?, tool_count = tool_count + 1 WHERE id = ?'
        ).run(now, currentSessionId);

        // Prune oldest sessions beyond limit
        const count = (d.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt;
        if (count > MAX_SESSIONS) {
            const excess = count - MAX_SESSIONS;
            d.prepare(`
                DELETE FROM entries WHERE session_id IN (
                    SELECT id FROM sessions ORDER BY start_time ASC LIMIT ?
                )
            `).run(excess);
            d.prepare(`
                DELETE FROM sessions WHERE id IN (
                    SELECT id FROM sessions ORDER BY start_time ASC LIMIT ?
                )
            `).run(excess);
        }
    } catch {
        // Logging should never break tool execution
    }
}

export function listSessions(limit: number = 20): SessionMeta[] {
    try {
        const d = ensureDb();
        const rows = d.prepare(
            'SELECT id, start_time, end_time, tool_count, preview, parent_id FROM sessions ORDER BY start_time DESC LIMIT ?'
        ).all(limit) as Array<{
            id: string;
            start_time: string;
            end_time: string;
            tool_count: number;
            preview: string;
            parent_id: string | null;
        }>;

        return rows.map(r => ({
            id: r.id,
            startTime: r.start_time,
            endTime: r.end_time,
            toolCount: r.tool_count,
            preview: r.preview,
            parentId: r.parent_id,
        }));
    } catch { return []; }
}

export function searchSessions(query: string, maxResults: number = 15): Array<{
    sessionId: string;
    sessionDate: string;
    tool: string;
    input: string;
    output: string;
    timestamp: string;
}> {
    try {
        const d = ensureDb();
        const ftsQuery = sanitizeFtsQuery(query);
        if (!ftsQuery) { return []; }

        const rows = d.prepare(`
            SELECT e.session_id, s.start_time, e.tool, e.input, e.output, e.timestamp
            FROM entries_fts fts
            JOIN entries e ON e.rowid = fts.rowid
            JOIN sessions s ON s.id = e.session_id
            WHERE entries_fts MATCH ?
            ORDER BY rank
            LIMIT ?
        `).all(ftsQuery, maxResults) as Array<{
            session_id: string;
            start_time: string;
            tool: string;
            input: string;
            output: string;
            timestamp: string;
        }>;

        return rows.map(r => ({
            sessionId: r.session_id,
            sessionDate: r.start_time.slice(0, 10),
            tool: r.tool,
            input: r.input,
            output: r.output,
            timestamp: r.timestamp,
        }));
    } catch { return []; }
}

export function getSession(id: string): Session | null {
    try {
        const d = ensureDb();
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');

        const row = d.prepare(
            'SELECT id, start_time, end_time, tool_count, preview, parent_id FROM sessions WHERE id = ?'
        ).get(safeId) as {
            id: string;
            start_time: string;
            end_time: string;
            tool_count: number;
            preview: string;
            parent_id: string | null;
        } | undefined;

        if (!row) { return null; }

        const entries = d.prepare(
            'SELECT timestamp, tool, input, output FROM entries WHERE session_id = ? ORDER BY rowid ASC'
        ).all(safeId) as SessionEntry[];

        return {
            id: row.id,
            startTime: row.start_time,
            endTime: row.end_time,
            toolCount: row.tool_count,
            preview: row.preview,
            parentId: row.parent_id,
            entries,
        };
    } catch { return null; }
}

export function getCurrentSessionId(): string | null {
    return currentSessionId;
}

export function setParentSession(parentId: string): void {
    if (!currentSessionId) { return; }
    try {
        const d = ensureDb();
        d.prepare('UPDATE sessions SET parent_id = ? WHERE id = ?').run(parentId, currentSessionId);
    } catch { /* best effort */ }
}

export function closeDb(): void {
    if (db) {
        db.close();
        db = null;
    }
    currentSessionId = null;
}
