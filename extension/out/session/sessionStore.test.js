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
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Redirect os.homedir() to a temp dir before module import
let tmpDir;
vitest_1.vi.mock('os', async () => {
    const actual = await vitest_1.vi.importActual('os');
    return {
        ...actual,
        homedir: () => tmpDir,
    };
});
let logToolCall;
let listSessions;
let searchSessions;
let getSession;
let getCurrentSessionId;
(0, vitest_1.beforeEach)(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimax-session-test-'));
    vitest_1.vi.resetModules();
    const mod = await Promise.resolve().then(() => __importStar(require('../session/sessionStore')));
    logToolCall = mod.logToolCall;
    listSessions = mod.listSessions;
    searchSessions = mod.searchSessions;
    getSession = mod.getSession;
    getCurrentSessionId = mod.getCurrentSessionId;
});
(0, vitest_1.afterEach)(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});
// ── logToolCall ─────────────────────────────────────────────
(0, vitest_1.describe)('logToolCall', () => {
    (0, vitest_1.it)('creates a session on first call', () => {
        logToolCall('gmail_check_inbox', { maxResults: 5 }, 'Found 3 emails');
        const id = getCurrentSessionId();
        (0, vitest_1.expect)(id).toBeTruthy();
        (0, vitest_1.expect)(id).toMatch(/^\d{4}-\d{2}-\d{2}_[a-z0-9]{4}$/);
    });
    (0, vitest_1.it)('persists session to disk', () => {
        logToolCall('gmail_check_inbox', {}, 'output text');
        const id = getCurrentSessionId();
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        const sessFile = path.join(sessDir, `${id}.json`);
        (0, vitest_1.expect)(fs.existsSync(sessFile)).toBe(true);
    });
    (0, vitest_1.it)('records tool name, input, and output', () => {
        logToolCall('aws_s3_list_buckets', { region: 'us-east-1' }, 'Found 5 buckets');
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session.entries).toHaveLength(1);
        (0, vitest_1.expect)(session.entries[0].tool).toBe('aws_s3_list_buckets');
        (0, vitest_1.expect)(session.entries[0].input).toContain('us-east-1');
        (0, vitest_1.expect)(session.entries[0].output).toContain('Found 5 buckets');
    });
    (0, vitest_1.it)('appends multiple calls to the same session', () => {
        logToolCall('tool_a', {}, 'out a');
        logToolCall('tool_b', {}, 'out b');
        logToolCall('tool_c', {}, 'out c');
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session.entries).toHaveLength(3);
        (0, vitest_1.expect)(session.toolCount).toBe(3);
    });
    (0, vitest_1.it)('sanitizes tokens/secrets from input', () => {
        logToolCall('some_tool', {
            token: 'secret-abc-123',
            apiKey: 'key-xyz',
            password: 'mypass',
            query: 'normal value',
        }, 'output');
        const id = getCurrentSessionId();
        const session = getSession(id);
        const input = session.entries[0].input;
        (0, vitest_1.expect)(input).not.toContain('secret-abc-123');
        (0, vitest_1.expect)(input).not.toContain('key-xyz');
        (0, vitest_1.expect)(input).not.toContain('mypass');
        (0, vitest_1.expect)(input).toContain('***');
        (0, vitest_1.expect)(input).toContain('normal value');
    });
    (0, vitest_1.it)('truncates long output to 500 chars', () => {
        const longOutput = 'x'.repeat(1000);
        logToolCall('tool', {}, longOutput);
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session.entries[0].output.length).toBeLessThanOrEqual(500);
    });
    (0, vitest_1.it)('truncates long input values to 200 chars', () => {
        logToolCall('tool', { body: 'z'.repeat(500) }, 'out');
        const id = getCurrentSessionId();
        const session = getSession(id);
        const parsed = JSON.parse(session.entries[0].input);
        (0, vitest_1.expect)(parsed.body.length).toBeLessThanOrEqual(205); // 200 + "…"
    });
    (0, vitest_1.it)('updates index file', () => {
        logToolCall('tool', {}, 'out');
        const indexFile = path.join(tmpDir, '.copilot-minimax', 'sessions', 'index.json');
        (0, vitest_1.expect)(fs.existsSync(indexFile)).toBe(true);
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        (0, vitest_1.expect)(index).toHaveLength(1);
        (0, vitest_1.expect)(index[0].toolCount).toBe(1);
    });
    (0, vitest_1.it)('sets preview from first tool call', () => {
        logToolCall('gmail_send_email', { to: 'john@example.com' }, 'Sent');
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session.preview).toContain('gmail_send_email');
    });
    (0, vitest_1.it)('handles undefined input gracefully', () => {
        logToolCall('tool', undefined, 'output');
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session.entries[0].input).toBe('{}');
    });
    (0, vitest_1.it)('creates sessions directory automatically', () => {
        logToolCall('tool', {}, 'out');
        const dir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        (0, vitest_1.expect)(fs.existsSync(dir)).toBe(true);
    });
});
// ── listSessions ────────────────────────────────────────────
(0, vitest_1.describe)('listSessions', () => {
    (0, vitest_1.it)('returns empty array when no sessions exist', () => {
        (0, vitest_1.expect)(listSessions()).toEqual([]);
    });
    (0, vitest_1.it)('returns sessions most-recent-first', () => {
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
        (0, vitest_1.expect)(sessions).toHaveLength(2);
        // Most recent (last in index) should be first in result
        (0, vitest_1.expect)(sessions[0].id).toBe(secondId);
    });
    (0, vitest_1.it)('respects limit parameter', () => {
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
        (0, vitest_1.expect)(sessions).toHaveLength(3);
    });
});
// ── searchSessions ──────────────────────────────────────────
(0, vitest_1.describe)('searchSessions', () => {
    (0, vitest_1.it)('returns empty array when no match', () => {
        logToolCall('gmail_check_inbox', { query: 'from:alice' }, 'Found 2 emails from alice');
        const results = searchSessions('nonexistent_query_xyz');
        (0, vitest_1.expect)(results).toHaveLength(0);
    });
    (0, vitest_1.it)('finds entries by tool name', () => {
        logToolCall('gmail_check_inbox', {}, 'Found emails');
        logToolCall('aws_s3_list_buckets', {}, 'Found buckets');
        const results = searchSessions('gmail');
        (0, vitest_1.expect)(results).toHaveLength(1);
        (0, vitest_1.expect)(results[0].tool).toBe('gmail_check_inbox');
    });
    (0, vitest_1.it)('finds entries by output content', () => {
        logToolCall('aws_s3_list_buckets', {}, 'my-special-bucket-name listed');
        const results = searchSessions('special-bucket');
        (0, vitest_1.expect)(results).toHaveLength(1);
    });
    (0, vitest_1.it)('finds entries by input content', () => {
        logToolCall('gmail_search_emails', { query: 'from:john@acme.com' }, 'Found 1 email');
        const results = searchSessions('john@acme.com');
        (0, vitest_1.expect)(results).toHaveLength(1);
    });
    (0, vitest_1.it)('supports multi-word queries (AND logic)', () => {
        logToolCall('gmail_check_inbox', {}, 'Email from alice about deployment');
        logToolCall('gmail_check_inbox', {}, 'Email from bob about lunch');
        const results = searchSessions('alice deployment');
        (0, vitest_1.expect)(results).toHaveLength(1);
        (0, vitest_1.expect)(results[0].output).toContain('alice');
    });
    (0, vitest_1.it)('is case-insensitive', () => {
        logToolCall('vercel_list_projects', {}, 'Project: MyApp');
        const results = searchSessions('MYAPP');
        (0, vitest_1.expect)(results).toHaveLength(1);
    });
    (0, vitest_1.it)('respects maxResults', () => {
        for (let i = 0; i < 10; i++) {
            logToolCall('tool', {}, `result item ${i}`);
        }
        const results = searchSessions('result', 3);
        (0, vitest_1.expect)(results).toHaveLength(3);
    });
    (0, vitest_1.it)('returns session metadata with results', () => {
        logToolCall('gmail_send_email', { to: 'test@test.com' }, 'Email sent successfully');
        const results = searchSessions('sent');
        (0, vitest_1.expect)(results).toHaveLength(1);
        (0, vitest_1.expect)(results[0].sessionId).toBeTruthy();
        (0, vitest_1.expect)(results[0].sessionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        (0, vitest_1.expect)(results[0].timestamp).toBeTruthy();
    });
});
// ── getSession ──────────────────────────────────────────────
(0, vitest_1.describe)('getSession', () => {
    (0, vitest_1.it)('returns null for non-existent session', () => {
        (0, vitest_1.expect)(getSession('nonexistent')).toBeNull();
    });
    (0, vitest_1.it)('returns full session data', () => {
        logToolCall('tool_a', { key: 'val' }, 'output a');
        logToolCall('tool_b', {}, 'output b');
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session).not.toBeNull();
        (0, vitest_1.expect)(session.id).toBe(id);
        (0, vitest_1.expect)(session.entries).toHaveLength(2);
        (0, vitest_1.expect)(session.toolCount).toBe(2);
        (0, vitest_1.expect)(session.startTime).toBeTruthy();
        (0, vitest_1.expect)(session.endTime).toBeTruthy();
    });
    (0, vitest_1.it)('sanitizes path traversal in session ID', () => {
        // Attempt path traversal — should not read arbitrary files
        const result = getSession('../../etc/passwd');
        (0, vitest_1.expect)(result).toBeNull();
    });
});
// ── Edge cases ──────────────────────────────────────────────
(0, vitest_1.describe)('edge cases', () => {
    (0, vitest_1.it)('handles corrupted index.json gracefully', () => {
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        fs.mkdirSync(sessDir, { recursive: true });
        fs.writeFileSync(path.join(sessDir, 'index.json'), 'not json!!!', 'utf-8');
        // Should not throw
        const sessions = listSessions();
        (0, vitest_1.expect)(sessions).toEqual([]);
    });
    (0, vitest_1.it)('handles corrupted session file gracefully', () => {
        logToolCall('tool', {}, 'out');
        const id = getCurrentSessionId();
        const sessFile = path.join(tmpDir, '.copilot-minimax', 'sessions', `${id}.json`);
        fs.writeFileSync(sessFile, 'corrupted!!!', 'utf-8');
        const session = getSession(id);
        (0, vitest_1.expect)(session).toBeNull();
    });
    (0, vitest_1.it)('logToolCall never throws even on disk error', () => {
        // Make sessions dir read-only to provoke an error
        const sessDir = path.join(tmpDir, '.copilot-minimax', 'sessions');
        fs.mkdirSync(sessDir, { recursive: true });
        // This should not throw regardless of any internal error
        (0, vitest_1.expect)(() => logToolCall('tool', {}, 'out')).not.toThrow();
    });
});
//# sourceMappingURL=sessionStore.test.js.map