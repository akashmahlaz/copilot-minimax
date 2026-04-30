import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Redirect os.homedir() to a temp dir before module import
let tmpDir: string;

vi.mock('os', async () => {
    const actual = await vi.importActual<typeof import('os')>('os');
    return {
        ...actual,
        homedir: () => tmpDir,
    };
});

let logToolCall: typeof import('../session/sessionStore').logToolCall;
let listSessions: typeof import('../session/sessionStore').listSessions;
let searchSessions: typeof import('../session/sessionStore').searchSessions;
let getSession: typeof import('../session/sessionStore').getSession;
let getCurrentSessionId: typeof import('../session/sessionStore').getCurrentSessionId;
let closeDb: typeof import('../session/sessionStore').closeDb;
let setParentSession: typeof import('../session/sessionStore').setParentSession;

beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimax-session-test-'));
    vi.resetModules();
    const mod = await import('../session/sessionStore');
    logToolCall = mod.logToolCall;
    listSessions = mod.listSessions;
    searchSessions = mod.searchSessions;
    getSession = mod.getSession;
    getCurrentSessionId = mod.getCurrentSessionId;
    closeDb = mod.closeDb;
    setParentSession = mod.setParentSession;
});

afterEach(() => {
    closeDb(); // Release DB handle before deleting temp dir
    if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

// ── logToolCall ─────────────────────────────────────────────

describe('logToolCall', () => {
    it('creates a session on first call', () => {
        logToolCall('gmail_check_inbox', { maxResults: 5 }, 'Found 3 emails');
        const id = getCurrentSessionId();
        expect(id).toBeTruthy();
        expect(id).toMatch(/^\d{4}-\d{2}-\d{2}_[a-z0-9]{4}$/);
    });

    it('persists session to SQLite DB', () => {
        logToolCall('gmail_check_inbox', {}, 'output text');
        const dbFile = path.join(tmpDir, '.copilot-minimax', 'sessions.db');
        expect(fs.existsSync(dbFile)).toBe(true);
    });

    it('records tool name, input, and output', () => {
        logToolCall('aws_s3_list_buckets', { region: 'us-east-1' }, 'Found 5 buckets');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        expect(session.entries).toHaveLength(1);
        expect(session.entries[0].tool).toBe('aws_s3_list_buckets');
        expect(session.entries[0].input).toContain('us-east-1');
        expect(session.entries[0].output).toContain('Found 5 buckets');
    });

    it('appends multiple calls to the same session', () => {
        logToolCall('tool_a', {}, 'out a');
        logToolCall('tool_b', {}, 'out b');
        logToolCall('tool_c', {}, 'out c');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        expect(session.entries).toHaveLength(3);
        expect(session.toolCount).toBe(3);
    });

    it('sanitizes tokens/secrets from input', () => {
        logToolCall('some_tool', {
            token: 'secret-abc-123',
            apiKey: 'key-xyz',
            password: 'mypass',
            query: 'normal value',
        }, 'output');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        const input = session.entries[0].input;
        expect(input).not.toContain('secret-abc-123');
        expect(input).not.toContain('key-xyz');
        expect(input).not.toContain('mypass');
        expect(input).toContain('***');
        expect(input).toContain('normal value');
    });

    it('truncates long output to 500 chars', () => {
        const longOutput = 'x'.repeat(1000);
        logToolCall('tool', {}, longOutput);
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        expect(session.entries[0].output.length).toBeLessThanOrEqual(500);
    });

    it('truncates long input values to 200 chars', () => {
        logToolCall('tool', { body: 'z'.repeat(500) }, 'out');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        const parsed = JSON.parse(session.entries[0].input);
        expect(parsed.body.length).toBeLessThanOrEqual(205); // 200 + "…"
    });

    it('sets preview from first tool call', () => {
        logToolCall('gmail_send_email', { to: 'john@example.com' }, 'Sent');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        expect(session.preview).toContain('gmail_send_email');
    });

    it('handles undefined input gracefully', () => {
        logToolCall('tool', undefined, 'output');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        expect(session.entries[0].input).toBe('{}');
    });

    it('creates database directory automatically', () => {
        logToolCall('tool', {}, 'out');
        const dir = path.join(tmpDir, '.copilot-minimax');
        expect(fs.existsSync(dir)).toBe(true);
    });
});

// ── listSessions ────────────────────────────────────────────

describe('listSessions', () => {
    it('returns empty array when no sessions exist', () => {
        expect(listSessions()).toEqual([]);
    });

    it('returns sessions most-recent-first', () => {
        // Log first session
        logToolCall('tool_1', {}, 'first session');
        const firstId = getCurrentSessionId()!;

        // Insert a second session directly with a later timestamp
        // by closing and re-opening (simulates a new session lifecycle)
        closeDb();

        // Re-import to get fresh module state (new session ID)
        // Since we share the same tmpDir, the DB persists
        return import('../session/sessionStore').then(mod2 => {
            mod2.logToolCall('tool_2', {}, 'second session');
            const secondId = mod2.getCurrentSessionId()!;

            const sessions = mod2.listSessions();
            expect(sessions.length).toBeGreaterThanOrEqual(2);
            // Most recent should be first (ORDER BY start_time DESC)
            expect(sessions[0].id).toBe(secondId);
            mod2.closeDb();
        });
    });

    it('respects limit parameter', () => {
        // Create entries to get a session
        logToolCall('tool', {}, 'out');

        const sessions = listSessions(1);
        expect(sessions).toHaveLength(1);
    });
});

// ── searchSessions (FTS5) ───────────────────────────────────

describe('searchSessions', () => {
    it('returns empty array when no match', () => {
        logToolCall('gmail_check_inbox', { query: 'from:alice' }, 'Found 2 emails from alice');
        const results = searchSessions('nonexistent_query_xyz');
        expect(results).toHaveLength(0);
    });

    it('finds entries by tool name', () => {
        logToolCall('gmail_check_inbox', {}, 'Found 3 emails');
        logToolCall('aws_s3_list_buckets', { region: 'us-east-1' }, '5 buckets');

        const results = searchSessions('gmail');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].tool).toBe('gmail_check_inbox');
    });

    it('finds entries by output content', () => {
        logToolCall('tool_a', {}, 'Deployed to production successfully');
        logToolCall('tool_b', {}, 'Unit tests passed');

        const results = searchSessions('production');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].output).toContain('production');
    });

    it('finds entries by input content', () => {
        logToolCall('gmail_send_email', { to: 'alice@example.com', subject: 'Project update' }, 'Sent');

        const results = searchSessions('alice');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].input).toContain('alice');
    });

    it('respects maxResults limit', () => {
        for (let i = 0; i < 10; i++) {
            logToolCall('repeated_tool', {}, `output batch ${i}`);
        }

        const results = searchSessions('repeated_tool', 3);
        expect(results).toHaveLength(3);
    });

    it('handles multi-word queries', () => {
        logToolCall('aws_s3_list_buckets', { region: 'us-east-1' }, 'Found 5 buckets in region');

        const results = searchSessions('buckets region');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for empty query', () => {
        logToolCall('tool', {}, 'output');
        const results = searchSessions('');
        expect(results).toHaveLength(0);
    });
});

// ── getSession ──────────────────────────────────────────────

describe('getSession', () => {
    it('returns null for nonexistent session', () => {
        expect(getSession('nonexistent')).toBeNull();
    });

    it('returns full session with entries', () => {
        logToolCall('tool_a', { x: 1 }, 'out a');
        logToolCall('tool_b', { y: 2 }, 'out b');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;

        expect(session.id).toBe(id);
        expect(session.entries).toHaveLength(2);
        expect(session.toolCount).toBe(2);
        expect(session.startTime).toBeTruthy();
        expect(session.endTime).toBeTruthy();
    });

    it('sanitizes path traversal in session ID', () => {
        expect(getSession('../../../etc/passwd')).toBeNull();
    });
});

// ── setParentSession (lineage) ──────────────────────────────

describe('setParentSession', () => {
    it('sets parent ID on current session', () => {
        logToolCall('tool', {}, 'out');
        const id = getCurrentSessionId()!;

        setParentSession('2026-01-01_prev');
        const session = getSession(id)!;
        expect(session.parentId).toBe('2026-01-01_prev');
    });

    it('does nothing if no current session', () => {
        // No logToolCall — no session created
        expect(() => setParentSession('some-id')).not.toThrow();
    });
});

// ── closeDb ─────────────────────────────────────────────────

describe('closeDb', () => {
    it('resets state cleanly', () => {
        logToolCall('tool', {}, 'out');
        expect(getCurrentSessionId()).toBeTruthy();

        closeDb();
        expect(getCurrentSessionId()).toBeNull();
    });

    it('allows re-initialization after close', () => {
        logToolCall('tool', {}, 'out');
        closeDb();

        logToolCall('tool_2', {}, 'out again');
        expect(getCurrentSessionId()).toBeTruthy();
        const sessions = listSessions();
        expect(sessions.length).toBeGreaterThanOrEqual(1);
    });
});
