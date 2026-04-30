/**
 * Stop hook — session summary and counter reset.
 * 
 * When the agent session ends, resets the tool counter
 * and logs a brief session summary for debugging.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
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

async function main() {
  await readStdin();
  
  const dir = join(homedir(), '.copilot-minimax');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  
  // Read final tool count
  const counterPath = join(dir, '.tool-counter');
  let toolCount = 0;
  if (existsSync(counterPath)) {
    try { toolCount = parseInt(readFileSync(counterPath, 'utf8'), 10) || 0; } catch {}
  }
  
  // Log session summary
  const logPath = join(dir, 'session-log.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    toolCalls: toolCount,
    event: 'session_end'
  };
  
  try {
    const line = JSON.stringify(entry) + '\n';
    const { appendFileSync } = await import('fs');
    appendFileSync(logPath, line);
  } catch {}
  
  // Reset counter for next session
  writeFileSync(counterPath, '0');
  
  process.stdout.write(JSON.stringify({}));
}

main().catch(() => process.exit(0));
