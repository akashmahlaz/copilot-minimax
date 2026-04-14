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
const https = __importStar(require("https"));
const stream_1 = require("stream");
// Mock vscode
vitest_1.vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (key) => key === 'token' ? 'ghp_test_token_123' : undefined,
        }),
    },
}));
// We need to mock https.request to avoid real API calls
vitest_1.vi.mock('https', () => {
    return {
        request: vitest_1.vi.fn(),
    };
});
const githubClient_1 = require("../github/githubClient");
function mockResponse(statusCode, body) {
    const mockReq = new stream_1.EventEmitter();
    mockReq.write = vitest_1.vi.fn();
    mockReq.end = vitest_1.vi.fn();
    https.request.mockImplementation((_opts, cb) => {
        const res = new stream_1.Readable({ read() { } });
        res.statusCode = statusCode;
        res.headers = {};
        // Schedule callback
        setTimeout(() => {
            cb(res);
            res.emit('data', Buffer.from(JSON.stringify(body)));
            res.emit('end');
        }, 0);
        return mockReq;
    });
}
function mockNetworkError(errorMessage) {
    const mockReq = new stream_1.EventEmitter();
    mockReq.write = vitest_1.vi.fn();
    mockReq.end = vitest_1.vi.fn();
    https.request.mockImplementation(() => {
        setTimeout(() => {
            mockReq.emit('error', new Error(errorMessage));
        }, 0);
        return mockReq;
    });
}
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
});
// ── ghRequest ───────────────────────────────────────────────
(0, vitest_1.describe)('ghRequest', () => {
    (0, vitest_1.it)('makes a GET request to api.github.com', async () => {
        mockResponse(200, [{ id: 1, name: 'test-repo' }]);
        const result = await (0, githubClient_1.ghRequest)('GET', '/user/repos');
        (0, vitest_1.expect)(result).toEqual([{ id: 1, name: 'test-repo' }]);
        const callArgs = https.request.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.hostname).toBe('api.github.com');
        (0, vitest_1.expect)(callArgs.path).toBe('/user/repos');
        (0, vitest_1.expect)(callArgs.method).toBe('GET');
    });
    (0, vitest_1.it)('sends auth header with Bearer token', async () => {
        mockResponse(200, {});
        await (0, githubClient_1.ghRequest)('GET', '/user');
        const callArgs = https.request.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.headers.Authorization).toBe('Bearer ghp_test_token_123');
    });
    (0, vitest_1.it)('sends GitHub API version header', async () => {
        mockResponse(200, {});
        await (0, githubClient_1.ghRequest)('GET', '/user');
        const callArgs = https.request.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });
    (0, vitest_1.it)('sends User-Agent header', async () => {
        mockResponse(200, {});
        await (0, githubClient_1.ghRequest)('GET', '/user');
        const callArgs = https.request.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.headers['User-Agent']).toBe('copilot-minimax-extension');
    });
    (0, vitest_1.it)('sends POST body as JSON', async () => {
        mockResponse(201, { number: 42 });
        const body = { title: 'New Issue', body: 'Description' };
        await (0, githubClient_1.ghRequest)('POST', '/repos/owner/repo/issues', body);
        const mockReqInstance = https.request.mock.results[0].value;
        (0, vitest_1.expect)(mockReqInstance.write).toHaveBeenCalledWith(JSON.stringify(body));
    });
    (0, vitest_1.it)('rejects on 4xx status codes', async () => {
        mockResponse(404, { message: 'Not Found' });
        await (0, vitest_1.expect)((0, githubClient_1.ghRequest)('GET', '/repos/owner/nonexistent')).rejects.toThrow('404');
    });
    (0, vitest_1.it)('rejects on 401 unauthorized', async () => {
        mockResponse(401, { message: 'Bad credentials' });
        await (0, vitest_1.expect)((0, githubClient_1.ghRequest)('GET', '/user')).rejects.toThrow('401');
    });
    (0, vitest_1.it)('rejects on 5xx server errors', async () => {
        mockResponse(500, { message: 'Internal Server Error' });
        await (0, vitest_1.expect)((0, githubClient_1.ghRequest)('GET', '/user')).rejects.toThrow('500');
    });
    (0, vitest_1.it)('rejects on network error', async () => {
        mockNetworkError('ECONNREFUSED');
        await (0, vitest_1.expect)((0, githubClient_1.ghRequest)('GET', '/user')).rejects.toThrow('ECONNREFUSED');
    });
    (0, vitest_1.it)('includes error message from API response', async () => {
        mockResponse(422, { message: 'Validation Failed' });
        await (0, vitest_1.expect)((0, githubClient_1.ghRequest)('POST', '/repos/o/r/issues', {})).rejects.toThrow('Validation Failed');
    });
    (0, vitest_1.it)('handles empty response body', async () => {
        const mockReq = new stream_1.EventEmitter();
        mockReq.write = vitest_1.vi.fn();
        mockReq.end = vitest_1.vi.fn();
        https.request.mockImplementation((_opts, cb) => {
            const res = new stream_1.Readable({ read() { } });
            res.statusCode = 204;
            res.headers = {};
            setTimeout(() => {
                cb(res);
                res.emit('data', Buffer.from(''));
                res.emit('end');
            }, 0);
            return mockReq;
        });
        const result = await (0, githubClient_1.ghRequest)('DELETE', '/something');
        // Empty string fails JSON.parse, ghRequest returns the raw empty string
        (0, vitest_1.expect)(result).toEqual({});
    });
});
// ── URL encoding safety ─────────────────────────────────────
(0, vitest_1.describe)('URL safety', () => {
    (0, vitest_1.it)('correctly passes encoded URL paths', async () => {
        mockResponse(200, { name: 'test' });
        await (0, githubClient_1.ghRequest)('GET', `/repos/${encodeURIComponent('my-org')}/${encodeURIComponent('my-repo')}`);
        const callArgs = https.request.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.path).toBe('/repos/my-org/my-repo');
    });
    (0, vitest_1.it)('handles query parameters in path', async () => {
        mockResponse(200, []);
        await (0, githubClient_1.ghRequest)('GET', '/user/repos?type=owner&sort=updated&per_page=20');
        const callArgs = https.request.mock.calls[0][0];
        (0, vitest_1.expect)(callArgs.path).toContain('type=owner');
    });
});
//# sourceMappingURL=githubClient.test.js.map