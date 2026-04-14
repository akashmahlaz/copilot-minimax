import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as https from 'https';
import { EventEmitter, Readable } from 'stream';

// Mock vscode
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: () => ({
            get: (key: string) => key === 'token' ? 'ghp_test_token_123' : undefined,
        }),
    },
}));

// We need to mock https.request to avoid real API calls
vi.mock('https', () => {
    return {
        request: vi.fn(),
    };
});

import { ghRequest } from '../github/githubClient';

function mockResponse(statusCode: number, body: any) {
    const mockReq = new EventEmitter() as any;
    mockReq.write = vi.fn();
    mockReq.end = vi.fn();

    (https.request as any).mockImplementation((_opts: any, cb: any) => {
        const res = new Readable({ read() {} }) as any;
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

function mockNetworkError(errorMessage: string) {
    const mockReq = new EventEmitter() as any;
    mockReq.write = vi.fn();
    mockReq.end = vi.fn();

    (https.request as any).mockImplementation(() => {
        setTimeout(() => {
            mockReq.emit('error', new Error(errorMessage));
        }, 0);
        return mockReq;
    });
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── ghRequest ───────────────────────────────────────────────

describe('ghRequest', () => {
    it('makes a GET request to api.github.com', async () => {
        mockResponse(200, [{ id: 1, name: 'test-repo' }]);
        const result = await ghRequest('GET', '/user/repos');
        expect(result).toEqual([{ id: 1, name: 'test-repo' }]);

        const callArgs = (https.request as any).mock.calls[0][0];
        expect(callArgs.hostname).toBe('api.github.com');
        expect(callArgs.path).toBe('/user/repos');
        expect(callArgs.method).toBe('GET');
    });

    it('sends auth header with Bearer token', async () => {
        mockResponse(200, {});
        await ghRequest('GET', '/user');
        const callArgs = (https.request as any).mock.calls[0][0];
        expect(callArgs.headers.Authorization).toBe('Bearer ghp_test_token_123');
    });

    it('sends GitHub API version header', async () => {
        mockResponse(200, {});
        await ghRequest('GET', '/user');
        const callArgs = (https.request as any).mock.calls[0][0];
        expect(callArgs.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('sends User-Agent header', async () => {
        mockResponse(200, {});
        await ghRequest('GET', '/user');
        const callArgs = (https.request as any).mock.calls[0][0];
        expect(callArgs.headers['User-Agent']).toBe('copilot-minimax-extension');
    });

    it('sends POST body as JSON', async () => {
        mockResponse(201, { number: 42 });
        const body = { title: 'New Issue', body: 'Description' };
        await ghRequest('POST', '/repos/owner/repo/issues', body);

        const mockReqInstance = (https.request as any).mock.results[0].value;
        expect(mockReqInstance.write).toHaveBeenCalledWith(JSON.stringify(body));
    });

    it('rejects on 4xx status codes', async () => {
        mockResponse(404, { message: 'Not Found' });
        await expect(ghRequest('GET', '/repos/owner/nonexistent')).rejects.toThrow('404');
    });

    it('rejects on 401 unauthorized', async () => {
        mockResponse(401, { message: 'Bad credentials' });
        await expect(ghRequest('GET', '/user')).rejects.toThrow('401');
    });

    it('rejects on 5xx server errors', async () => {
        mockResponse(500, { message: 'Internal Server Error' });
        await expect(ghRequest('GET', '/user')).rejects.toThrow('500');
    });

    it('rejects on network error', async () => {
        mockNetworkError('ECONNREFUSED');
        await expect(ghRequest('GET', '/user')).rejects.toThrow('ECONNREFUSED');
    });

    it('includes error message from API response', async () => {
        mockResponse(422, { message: 'Validation Failed' });
        await expect(ghRequest('POST', '/repos/o/r/issues', {})).rejects.toThrow('Validation Failed');
    });

    it('handles empty response body', async () => {
        const mockReq = new EventEmitter() as any;
        mockReq.write = vi.fn();
        mockReq.end = vi.fn();
        (https.request as any).mockImplementation((_opts: any, cb: any) => {
            const res = new Readable({ read() {} }) as any;
            res.statusCode = 204;
            res.headers = {};
            setTimeout(() => {
                cb(res);
                res.emit('data', Buffer.from(''));
                res.emit('end');
            }, 0);
            return mockReq;
        });
        const result = await ghRequest('DELETE', '/something');
        // Empty string fails JSON.parse, ghRequest returns the raw empty string
        expect(result).toEqual({});
    });
});

// ── URL encoding safety ─────────────────────────────────────

describe('URL safety', () => {
    it('correctly passes encoded URL paths', async () => {
        mockResponse(200, { name: 'test' });
        await ghRequest('GET', `/repos/${encodeURIComponent('my-org')}/${encodeURIComponent('my-repo')}`);
        const callArgs = (https.request as any).mock.calls[0][0];
        expect(callArgs.path).toBe('/repos/my-org/my-repo');
    });

    it('handles query parameters in path', async () => {
        mockResponse(200, []);
        await ghRequest('GET', '/user/repos?type=owner&sort=updated&per_page=20');
        const callArgs = (https.request as any).mock.calls[0][0];
        expect(callArgs.path).toContain('type=owner');
    });
});
