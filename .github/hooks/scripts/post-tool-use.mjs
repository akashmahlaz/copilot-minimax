/**
 * PostToolUse hook — tracks tool usage, nudges memory, and detects skill-worthy patterns.
 * 
 * After every tool call:
 * - Increments a session counter
 * - Every 10 calls: nudges memory saving
 * - Every 5+ unique tools: suggests capturing the workflow as a SKILL.md
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data ? JSON.parse(data) : {}); });
    setTimeout(() => { if (!data) resolve({}); }, 2000);
  });
}

const STATE_DIR = join(homedir(), '.copilot-minimax');

function getCounterPath() {
  return join(STATE_DIR, '.tool-counter');
}

function getToolChainPath() {
  return join(STATE_DIR, '.tool-chain');
}

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function incrementCounter() {
  ensureDir();
  const counterPath = getCounterPath();
  let count = 0;
  if (existsSync(counterPath)) {
    try { count = parseInt(readFileSync(counterPath, 'utf8'), 10) || 0; } catch {}
  }
  count++;
  writeFileSync(counterPath, String(count));
  return count;
}

function trackToolChain(toolName) {
  ensureDir();
  const chainPath = getToolChainPath();
  let chain = [];
  if (existsSync(chainPath)) {
    try { chain = JSON.parse(readFileSync(chainPath, 'utf8')); } catch { chain = []; }
  }
  chain.push({ tool: toolName, ts: Date.now() });
  // Keep last 30 entries only
  if (chain.length > 30) chain = chain.slice(-30);
  writeFileSync(chainPath, JSON.stringify(chain));
  return chain;
}

function detectSkillPattern(chain) {
  // Look at the last 10 entries — if 5+ unique tools in a row, suggest skill creation
  const recent = chain.slice(-10);
  const uniqueTools = new Set(recent.map(e => e.tool));
  // Also check that these aren't just memory/session tools (those are meta-tools)
  const metaTools = new Set(['memory_add', 'memory_remove', 'memory_replace', 'memory_list',
    'session_search', 'session_list', 'session_resume']);
  const nonMetaUnique = [...uniqueTools].filter(t => !metaTools.has(t));
  return nonMetaUnique.length >= 5;
}

async function main() {
  const input = await readStdin();
  const count = incrementCounter();
  const toolName = input?.hookSpecificInput?.toolName || 'unknown';
  const chain = trackToolChain(toolName);
  
  const hints = [];

  // Every 10 tool calls, nudge memory saving
  if (count % 10 === 0) {
    hints.push(`[Minimax] ${count} tool calls this session. Have you saved any useful facts to memory? Consider using memory_add for: user preferences discovered, project conventions learned, solutions to problems encountered, or decisions made.`);
  }

  // Detect skill-worthy patterns (5+ diverse tools in recent chain)
  if (chain.length >= 5 && detectSkillPattern(chain)) {
    const recentTools = [...new Set(chain.slice(-10).map(e => e.tool))].join(', ');
    hints.push(`[Minimax] Skill pattern detected: you've used ${recentTools} in sequence. This workflow might be worth saving as a SKILL.md so it can be reused. Say "save this as a skill" to capture it, or just keep going.`);
  }

  if (hints.length > 0) {
    process.stdout.write(JSON.stringify({ additionalContext: hints.join('\n\n') }));
  } else {
    process.stdout.write(JSON.stringify({}));
  }
}

main().catch(() => process.exit(0));
