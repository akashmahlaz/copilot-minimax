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
let closeDb;
let setParentSession;
(0, vitest_1.beforeEach)(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimax-session-test-'));
    vitest_1.vi.resetModules();
    const mod = await Promise.resolve().then(() => __importStar(require('../session/sessionStore')));
    logToolCall = mod.logToolCall;
    listSessions = mod.listSessions;
    searchSessions = mod.searchSessions;
    getSession = mod.getSession;
    getCurrentSessionId = mod.getCurrentSessionId;
    closeDb = mod.closeDb;
    setParentSession = mod.setParentSession;
});
(0, vitest_1.afterEach)(() => {
    closeDb(); // Release DB handle before deleting temp dir
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
    (0, vitest_1.it)('persists session to SQLite DB', () => {
        logToolCall('gmail_check_inbox', {}, 'output text');
        const dbFile = path.join(tmpDir, '.copilot-minimax', 'sessions.db');
        (0, vitest_1.expect)(fs.existsSync(dbFile)).toBe(true);
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
    (0, vitest_1.it)('creates database directory automatically', () => {
        logToolCall('tool', {}, 'out');
        const dir = path.join(tmpDir, '.copilot-minimax');
        (0, vitest_1.expect)(fs.existsSync(dir)).toBe(true);
    });
});
// ── listSessions ────────────────────────────────────────────
(0, vitest_1.describe)('listSessions', () => {
    (0, vitest_1.it)('returns empty array when no sessions exist', () => {
        (0, vitest_1.expect)(listSessions()).toEqual([]);
    });
    (0, vitest_1.it)('returns sessions most-recent-first', () => {
        // Log first session
        logToolCall('tool_1', {}, 'first session');
        const firstId = getCurrentSessionId();
        // Insert a second session directly with a later timestamp
        // by closing and re-opening (simulates a new session lifecycle)
        closeDb();
        // Re-import to get fresh module state (new session ID)
        // Since we share the same tmpDir, the DB persists
        return Promise.resolve().then(() => __importStar(require('../session/sessionStore'))).then(mod2 => {
            mod2.logToolCall('tool_2', {}, 'second session');
            const secondId = mod2.getCurrentSessionId();
            const sessions = mod2.listSessions();
            (0, vitest_1.expect)(sessions.length).toBeGreaterThanOrEqual(2);
            // Most recent should be first (ORDER BY start_time DESC)
            (0, vitest_1.expect)(sessions[0].id).toBe(secondId);
            mod2.closeDb();
        });
    });
    (0, vitest_1.it)('respects limit parameter', () => {
        // Create entries to get a session
        logToolCall('tool', {}, 'out');
        const sessions = listSessions(1);
        (0, vitest_1.expect)(sessions).toHaveLength(1);
    });
});
// ── searchSessions (FTS5) ───────────────────────────────────
(0, vitest_1.describe)('searchSessions', () => {
    (0, vitest_1.it)('returns empty array when no match', () => {
        logToolCall('gmail_check_inbox', { query: 'from:alice' }, 'Found 2 emails from alice');
        const results = searchSessions('nonexistent_query_xyz');
        (0, vitest_1.expect)(results).toHaveLength(0);
    });
    (0, vitest_1.it)('finds entries by tool name', () => {
        logToolCall('gmail_check_inbox', {}, 'Found 3 emails');
        logToolCall('aws_s3_list_buckets', { region: 'us-east-1' }, '5 buckets');
        const results = searchSessions('gmail');
        (0, vitest_1.expect)(results.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(results[0].tool).toBe('gmail_check_inbox');
    });
    (0, vitest_1.it)('finds entries by output content', () => {
        logToolCall('tool_a', {}, 'Deployed to production successfully');
        logToolCall('tool_b', {}, 'Unit tests passed');
        const results = searchSessions('production');
        (0, vitest_1.expect)(results.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(results[0].output).toContain('production');
    });
    (0, vitest_1.it)('finds entries by input content', () => {
        logToolCall('gmail_send_email', { to: 'alice@example.com', subject: 'Project update' }, 'Sent');
        const results = searchSessions('alice');
        (0, vitest_1.expect)(results.length).toBeGreaterThanOrEqual(1);
        (0, vitest_1.expect)(results[0].input).toContain('alice');
    });
    (0, vitest_1.it)('respects maxResults limit', () => {
        for (let i = 0; i < 10; i++) {
            logToolCall('repeated_tool', {}, `output batch ${i}`);
        }
        const results = searchSessions('repeated_tool', 3);
        (0, vitest_1.expect)(results).toHaveLength(3);
    });
    (0, vitest_1.it)('handles multi-word queries', () => {
        logToolCall('aws_s3_list_buckets', { region: 'us-east-1' }, 'Found 5 buckets in region');
        const results = searchSessions('buckets region');
        (0, vitest_1.expect)(results.length).toBeGreaterThanOrEqual(1);
    });
    (0, vitest_1.it)('returns empty for empty query', () => {
        logToolCall('tool', {}, 'output');
        const results = searchSessions('');
        (0, vitest_1.expect)(results).toHaveLength(0);
    });
});
// ── getSession ──────────────────────────────────────────────
(0, vitest_1.describe)('getSession', () => {
    (0, vitest_1.it)('returns null for nonexistent session', () => {
        (0, vitest_1.expect)(getSession('nonexistent')).toBeNull();
    });
    (0, vitest_1.it)('returns full session with entries', () => {
        logToolCall('tool_a', { x: 1 }, 'out a');
        logToolCall('tool_b', { y: 2 }, 'out b');
        const id = getCurrentSessionId();
        const session = getSession(id);
        (0, vitest_1.expect)(session.id).toBe(id);
        (0, vitest_1.expect)(session.entries).toHaveLength(2);
        (0, vitest_1.expect)(session.toolCount).toBe(2);
        (0, vitest_1.expect)(session.startTime).toBeTruthy();
        (0, vitest_1.expect)(session.endTime).toBeTruthy();
    });
    (0, vitest_1.it)('sanitizes path traversal in session ID', () => {
        (0, vitest_1.expect)(getSession('../../../etc/passwd')).toBeNull();
    });
});
// ── setParentSession (lineage) ──────────────────────────────
(0, vitest_1.describe)('setParentSession', () => {
    (0, vitest_1.it)('sets parent ID on current session', () => {
        logToolCall('tool', {}, 'out');
        const id = getCurrentSessionId();
        setParentSession('2026-01-01_prev');
        const session = getSession(id);
        (0, vitest_1.expect)(session.parentId).toBe('2026-01-01_prev');
    });
    (0, vitest_1.it)('does nothing if no current session', () => {
        // No logToolCall — no session created
        (0, vitest_1.expect)(() => setParentSession('some-id')).not.toThrow();
    });
});
// ── closeDb ─────────────────────────────────────────────────
(0, vitest_1.describe)('closeDb', () => {
    (0, vitest_1.it)('resets state cleanly', () => {
        logToolCall('tool', {}, 'out');
        (0, vitest_1.expect)(getCurrentSessionId()).toBeTruthy();
        closeDb();
        (0, vitest_1.expect)(getCurrentSessionId()).toBeNull();
    });
    (0, vitest_1.it)('allows re-initialization after close', () => {
        logToolCall('tool', {}, 'out');
        closeDb();
        logToolCall('tool_2', {}, 'out again');
        (0, vitest_1.expect)(getCurrentSessionId()).toBeTruthy();
        const sessions = listSessions();
        (0, vitest_1.expect)(sessions.length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=sessionStore.test.js.map