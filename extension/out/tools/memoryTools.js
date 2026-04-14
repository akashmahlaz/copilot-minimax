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
exports.memorySnapshot = void 0;
exports.registerMemoryTools = registerMemoryTools;
const vscode = __importStar(require("vscode"));
const memoryStore_1 = require("../memory/memoryStore");
Object.defineProperty(exports, "memorySnapshot", { enumerable: true, get: function () { return memoryStore_1.memorySnapshot; } });
const sessionStore_1 = require("../session/sessionStore");
// ── Helpers ─────────────────────────────────────────────────
function textResult(text) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}
function logged(toolName, fn) {
    return async (options, token) => {
        const result = await fn(options, token);
        const text = result.content[0]?.value || '';
        (0, sessionStore_1.logToolCall)(toolName, options.input, text);
        return result;
    };
}
// ── Tool Registration ───────────────────────────────────────
function registerMemoryTools(context) {
    // ── memory_add ──────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('memory_add', {
        invoke: logged('memory_add', async (options, _token) => {
            const target = options.input?.target || 'memory';
            const content = options.input?.content;
            if (!content) {
                return textResult('Please provide content to remember.');
            }
            if (target !== 'memory' && target !== 'user') {
                return textResult('Target must be "memory" (agent notes) or "user" (user profile).');
            }
            const result = (0, memoryStore_1.memoryAdd)(target, content);
            return textResult(result.message);
        })
    }));
    // ── memory_remove ───────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('memory_remove', {
        invoke: logged('memory_remove', async (options, _token) => {
            const target = options.input?.target || 'memory';
            const substring = options.input?.substring;
            if (!substring) {
                return textResult('Please provide a substring to identify the entry to remove.');
            }
            if (target !== 'memory' && target !== 'user') {
                return textResult('Target must be "memory" or "user".');
            }
            const result = (0, memoryStore_1.memoryRemove)(target, substring);
            return textResult(result.message);
        })
    }));
    // ── memory_replace ──────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('memory_replace', {
        invoke: logged('memory_replace', async (options, _token) => {
            const target = options.input?.target || 'memory';
            const oldText = options.input?.old_text;
            const content = options.input?.content;
            if (!oldText || !content) {
                return textResult('Provide both old_text (substring to find) and content (replacement text).');
            }
            if (target !== 'memory' && target !== 'user') {
                return textResult('Target must be "memory" or "user".');
            }
            const result = (0, memoryStore_1.memoryReplace)(target, oldText, content);
            return textResult(result.message);
        })
    }));
    // ── memory_list ─────────────────────────────────────────
    context.subscriptions.push(vscode.lm.registerTool('memory_list', {
        invoke: logged('memory_list', async (options, _token) => {
            const target = options.input?.target;
            if (target && target !== 'memory' && target !== 'user') {
                return textResult('Target must be "memory", "user", or omitted (show both).');
            }
            const listing = (0, memoryStore_1.memoryList)(target || undefined);
            return textResult(listing);
        })
    }));
}
//# sourceMappingURL=memoryTools.js.map