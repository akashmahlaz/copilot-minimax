/**
 * SessionStart hook — injects memory snapshot + environment info as additional context.
 * Runs at the beginning of every new agent session.
 * 
 * Reads: ~/.copilot-minimax/memory.json
 * Outputs: additionalContext with memory summary + environment detection
 */
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data ? JSON.parse(data) : {}); });
    // If no stdin after 2s, proceed with empty
    setTimeout(() => { if (!data) resolve({}); }, 2000);
  });
}

function loadMemory() {
  const memPath = join(homedir(), '.copilot-minimax', 'memory.json');
  if (!existsSync(memPath)) return null;
  try {
    return JSON.parse(readFileSync(memPath, 'utf8'));
  } catch { return null; }
}

function detectEnvironment() {
  const info = [];
  info.push(`OS: ${process.platform} (${process.arch})`);
  info.push(`Node: ${process.version}`);
  info.push(`Shell: ${process.env.SHELL || process.env.COMSPEC || 'unknown'}`);
  info.push(`CWD: ${process.cwd()}`);
  if (process.env.WSL_DISTRO_NAME) info.push(`WSL: ${process.env.WSL_DISTRO_NAME}`);
  if (process.env.CONTAINER) info.push('Running in container');
  return info.join('\n');
}

function formatMemorySnapshot(memory) {
  if (!memory) return 'No memories saved yet. Start saving facts about the user and project!';
  
  const entries = [];
  if (memory.MEMORY && memory.MEMORY.length > 0) {
    entries.push('## Agent Memory');
    memory.MEMORY.forEach((e, i) => entries.push(`${i + 1}. ${e}`));
  }
  if (memory.USER && memory.USER.length > 0) {
    entries.push('## User Profile');
    memory.USER.forEach((e, i) => entries.push(`${i + 1}. ${e}`));
  }
  if (entries.length === 0) return 'Memory is empty. Save important facts as you learn them!';
  return entries.join('\n');
}

async function main() {
  await readStdin();
  
  const memory = loadMemory();
  const env = detectEnvironment();
  const snapshot = formatMemorySnapshot(memory);
  
  const context = [
    '# Minimax Session Context',
    '',
    '## Environment',
    env,
    '',
    snapshot,
    '',
    '---',
    'Remember: Save new facts with memory_add. Update stale facts with memory_replace.'
  ].join('\n');

  const output = {
    additionalContext: context
  };
  
  process.stdout.write(JSON.stringify(output));
}

main().catch(() => process.exit(0));
