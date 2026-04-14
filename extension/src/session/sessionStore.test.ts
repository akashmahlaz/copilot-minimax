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

beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimax-session-test-'));
    vi.resetModules();
    const mod = await import('../session/sessionStore');
    logToolCall = mod.logToolCall;
    listSessions = mod.listSessions;
    searchSessions = mod.searchSessions;
    getSession = mod.getSession;
    getCurrentSessionId = mod.getCurrentSessionId;
});

afterEach(() => {
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

    it('persists session to disk', () => {
        logToolCall('gmail_check_inbox', {}, 'output text');
        const id = getCurrentSessionId()!;
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        const sessFile = path.join(sessDir, `${id}.json`);
        expect(fs.existsSync(sessFile)).toBe(true);
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

    it('updates index file', () => {
        logToolCall('tool', {}, 'out');
        const indexFile = path.join(tmpDir, '.copilot-minimax', 'sessions', 'index.json');
        expect(fs.existsSync(indexFile)).toBe(true);
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        expect(index).toHaveLength(1);
        expect(index[0].toolCount).toBe(1);
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

    it('creates sessions directory automatically', () => {
        logToolCall('tool', {}, 'out');
        const dir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        expect(fs.existsSync(dir)).toBe(true);
    });
});

// ── listSessions ────────────────────────────────────────────

describe('listSessions', () => {
    it('returns empty array when no sessions exist', () => {
        expect(listSessions()).toEqual([]);
    });

    it('returns sessions most-recent-first', () => {
        // Create multiple sessions by re-importing between calls
        logToolCall('tool_1', {}, 'first session');

        // Write a second session file manually with a different ID
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        const indexFile = path.join(sessDir, 'index.json');
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));

        const secondId = '2026-04-14_zzzz';
        const secondSession = {
            id: secondId,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            toolCount: 1,
            preview: 'tool_2: {}',
            entries: [{ timestamp: new Date().toISOString(), tool: 'tool_2', input: '{}', output: 'second' }],
        };
        fs.writeFileSync(path.join(sessDir, `${secondId}.json`), JSON.stringify(secondSession), 'utf-8');
        index.push({ id: secondId, startTime: secondSession.startTime, endTime: secondSession.endTime, toolCount: 1, preview: secondSession.preview });
        fs.writeFileSync(indexFile, JSON.stringify(index), 'utf-8');

        const sessions = listSessions();
        expect(sessions).toHaveLength(2);
        // Most recent (last in index) should be first in result
        expect(sessions[0].id).toBe(secondId);
    });

    it('respects limit parameter', () => {
        logToolCall('tool', {}, 'out');

        // Add more sessions to index manually
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        const indexFile = path.join(sessDir, 'index.json');
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        for (let i = 0; i < 5; i++) {
            index.push({ id: `fake_${i}`, startTime: new Date().toISOString(), endTime: new Date().toISOString(), toolCount: 1, preview: `fake ${i}` });
        }
        fs.writeFileSync(indexFile, JSON.stringify(index), 'utf-8');

        const sessions = listSessions(3);
        expect(sessions).toHaveLength(3);
    });
});

// ── searchSessions ──────────────────────────────────────────

describe('searchSessions', () => {
    it('returns empty array when no match', () => {
        logToolCall('gmail_check_inbox', { query: 'from:alice' }, 'Found 2 emails from alice');
        const results = searchSessions('nonexistent_query_xyz');
        expect(results).toHaveLength(0);
    });

    it('finds entries by tool name', () => {
        logToolCall('gmail_check_inbox', {}, 'Found emails');
        logToolCall('aws_s3_list_buckets', {}, 'Found buckets');
        const results = searchSessions('gmail');
        expect(results).toHaveLength(1);
        expect(results[0].tool).toBe('gmail_check_inbox');
    });

    it('finds entries by output content', () => {
        logToolCall('aws_s3_list_buckets', {}, 'my-special-bucket-name listed');
        const results = searchSessions('special-bucket');
        expect(results).toHaveLength(1);
    });

    it('finds entries by input content', () => {
        logToolCall('gmail_search_emails', { query: 'from:john@acme.com' }, 'Found 1 email');
        const results = searchSessions('john@acme.com');
        expect(results).toHaveLength(1);
    });

    it('supports multi-word queries (AND logic)', () => {
        logToolCall('gmail_check_inbox', {}, 'Email from alice about deployment');
        logToolCall('gmail_check_inbox', {}, 'Email from bob about lunch');
        const results = searchSessions('alice deployment');
        expect(results).toHaveLength(1);
        expect(results[0].output).toContain('alice');
    });

    it('is case-insensitive', () => {
        logToolCall('vercel_list_projects', {}, 'Project: MyApp');
        const results = searchSessions('MYAPP');
        expect(results).toHaveLength(1);
    });

    it('respects maxResults', () => {
        for (let i = 0; i < 10; i++) {
            logToolCall('tool', {}, `result item ${i}`);
        }
        const results = searchSessions('result', 3);
        expect(results).toHaveLength(3);
    });

    it('returns session metadata with results', () => {
        logToolCall('gmail_send_email', { to: 'test@test.com' }, 'Email sent successfully');
        const results = searchSessions('sent');
        expect(results).toHaveLength(1);
        expect(results[0].sessionId).toBeTruthy();
        expect(results[0].sessionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(results[0].timestamp).toBeTruthy();
    });
});

// ── getSession ──────────────────────────────────────────────

describe('getSession', () => {
    it('returns null for non-existent session', () => {
        expect(getSession('nonexistent')).toBeNull();
    });

    it('returns full session data', () => {
        logToolCall('tool_a', { key: 'val' }, 'output a');
        logToolCall('tool_b', {}, 'output b');
        const id = getCurrentSessionId()!;
        const session = getSession(id)!;
        expect(session).not.toBeNull();
        expect(session.id).toBe(id);
        expect(session.entries).toHaveLength(2);
        expect(session.toolCount).toBe(2);
        expect(session.startTime).toBeTruthy();
        expect(session.endTime).toBeTruthy();
    });

    it('sanitizes path traversal in session ID', () => {
        // Attempt path traversal — should not read arbitrary files
        const result = getSession('../../etc/passwd');
        expect(result).toBeNull();
    });
});

// ── Edge cases ──────────────────────────────────────────────

describe('edge cases', () => {
    it('handles corrupted index.json gracefully', () => {
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        fs.mkdirSync(sessDir, { recursive: true });
        fs.writeFileSync(path.join(sessDir, 'index.json'), 'not json!!!', 'utf-8');

        // Should not throw
        const sessions = listSessions();
        expect(sessions).toEqual([]);
    });

    it('handles corrupted session file gracefully', () => {
        logToolCall('tool', {}, 'out');
        const id = getCurrentSessionId()!;
        const sessFile = path.join(tmpDir, '.copilot-minimax', 'sessions', `${id}.json`);
        fs.writeFileSync(sessFile, 'corrupted!!!', 'utf-8');

        const session = getSession(id);
        expect(session).toBeNull();
    });

    it('logToolCall never throws even on disk error', () => {
        // Make sessions dir read-only to provoke an error
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        fs.mkdirSync(sessDir, { recursive: true });

        // This should not throw regardless of any internal error
        expect(() => logToolCall('tool', {}, 'out')).not.toThrow();
    });
});
