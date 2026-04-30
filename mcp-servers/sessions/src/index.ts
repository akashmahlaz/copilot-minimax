import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Database ────────────────────────────────────────────────

const DB_DIR = path.join(os.homedir(), '.copilot-minimax');
const DB_PATH = path.join(DB_DIR, 'sessions.db');

function openDb(): Database.Database {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Ensure tables exist (extension creates them, but be safe)
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

    return db;
}

/** Sanitize FTS5 query — quote each term to prevent operator injection. */
function sanitizeFtsQuery(query: string): string {
    const cleaned = query.replace(/[^\w\s@._-]/g, ' ');
    const terms = cleaned.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) { return ''; }
    return terms.map(t => `"${t}"`).join(' ');
}

// ── MCP Server ──────────────────────────────────────────────

const server = new McpServer({
    name: 'copilot-minimax-sessions',
    version: '1.0.0',
});

const db = openDb();

// ── session_search ──────────────────────────────────────────

server.tool(
    'session_search',
    'Full-text search across all past conversation sessions. Finds matching tool calls by tool name, input parameters, or output content. Use this when you need to recall something from a previous conversation.',
    {
        query: z.string().describe('Search query — keywords to match against tool names, inputs, and outputs'),
        maxResults: z.number().optional().default(15).describe('Maximum results to return (default: 15)'),
    },
    async ({ query, maxResults }) => {
        const ftsQuery = sanitizeFtsQuery(query);
        if (!ftsQuery) {
            return { content: [{ type: 'text' as const, text: 'Please provide a search query.' }] };
        }

        const rows = db.prepare(`
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

        if (rows.length === 0) {
            return { content: [{ type: 'text' as const, text: `No past sessions match "${query}". Try broader keywords.` }] };
        }

        const lines = rows.map((r, i) =>
            `**${i + 1}.** \`${r.tool}\` — ${r.start_time.slice(0, 10)}\n   Input: ${r.input.substring(0, 120)}\n   Output: ${r.output.substring(0, 150)}\n   Session: ${r.session_id}`
        );

        return {
            content: [{
                type: 'text' as const,
                text: `**Session search: "${query}"** — ${rows.length} result(s)\n\n${lines.join('\n\n')}\n\nUse session_resume with a session ID to load full context.`,
            }],
        };
    },
);

// ── session_list ────────────────────────────────────────────

server.tool(
    'session_list',
    'List past conversation sessions ordered by most recent. Shows session ID, date, tool count, and a preview of what was discussed.',
    {
        limit: z.number().optional().default(20).describe('Number of sessions to return (default: 20)'),
    },
    async ({ limit }) => {
        const rows = db.prepare(
            'SELECT id, start_time, end_time, tool_count, preview, parent_id FROM sessions ORDER BY start_time DESC LIMIT ?'
        ).all(limit) as Array<{
            id: string;
            start_time: string;
            end_time: string;
            tool_count: number;
            preview: string;
            parent_id: string | null;
        }>;

        if (rows.length === 0) {
            return { content: [{ type: 'text' as const, text: 'No past sessions found. Sessions are recorded as you use tools.' }] };
        }

        const lines = rows.map((s, i) => {
            const date = s.start_time.slice(0, 16).replace('T', ' ');
            const lineage = s.parent_id ? ` (continued from ${s.parent_id})` : '';
            return `${i + 1}. **${s.id}** — ${date} — ${s.tool_count} tool call(s)${lineage}\n   ${s.preview}`;
        });

        return {
            content: [{
                type: 'text' as const,
                text: `**Past sessions** (${rows.length} most recent)\n\n${lines.join('\n\n')}\n\nUse session_search to find specific conversations, or session_resume with a session ID.`,
            }],
        };
    },
);

// ── session_resume ──────────────────────────────────────────

server.tool(
    'session_resume',
    'Load the full context of a past session by ID. Returns all tool calls with their inputs and outputs so you can continue from where it left off.',
    {
        sessionId: z.string().describe('Session ID to resume (e.g. "2026-04-14_a3f1")'),
    },
    async ({ sessionId }) => {
        const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '');

        const session = db.prepare(
            'SELECT id, start_time, end_time, tool_count, preview, parent_id FROM sessions WHERE id = ?'
        ).get(safeId) as {
            id: string;
            start_time: string;
            end_time: string;
            tool_count: number;
            preview: string;
            parent_id: string | null;
        } | undefined;

        if (!session) {
            return { content: [{ type: 'text' as const, text: `Session "${sessionId}" not found. Use session_list to see available sessions.` }] };
        }

        const entries = db.prepare(
            'SELECT timestamp, tool, input, output FROM entries WHERE session_id = ? ORDER BY rowid ASC'
        ).all(safeId) as Array<{
            timestamp: string;
            tool: string;
            input: string;
            output: string;
        }>;

        const lineage = session.parent_id ? `\nParent session: ${session.parent_id}` : '';

        const entryLines = entries.map((e, i) => {
            const time = e.timestamp.slice(11, 16);
            return `**${i + 1}. ${e.tool}** (${time})\n   → ${e.input.substring(0, 150)}\n   ← ${e.output.substring(0, 200)}`;
        });

        return {
            content: [{
                type: 'text' as const,
                text: `**Session ${session.id}**\n` +
                    `Started: ${session.start_time.slice(0, 16).replace('T', ' ')}\n` +
                    `Ended: ${session.end_time.slice(0, 16).replace('T', ' ')}\n` +
                    `Tool calls: ${session.tool_count}${lineage}\n\n` +
                    `---\n\n${entryLines.join('\n\n')}\n\n---\n\n` +
                    `This is the full context from that session. You can continue from where it left off.`,
            }],
        };
    },
);

// ── Start ───────────────────────────────────────────────────

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    console.error('Sessions MCP server failed to start:', err);
    process.exit(1);
});
