/**
 * PreToolUse hook — gates destructive operations with a confirmation signal.
 * 
 * Destructive tools (send email, delete, push, create PR) require user confirmation.
 * All other tools are auto-allowed.
 */
import { readFileSync } from 'fs';

const DESTRUCTIVE_TOOLS = new Set([
  'gmail_send_email',
  'gmail_reply_to_email',
  'gmail_remove_account',
  'aws_ec2_manage_instance',
  'aws_lambda_invoke',
  'github_create_issue',
  'github_create_pr',
  'vercel_list_env_vars',  // env vars can contain secrets
  'whatsapp_send_message',
  'slack_send_message',
  'cron_create',
  'cron_delete',
  'memory_remove',  // prevent accidental memory wipes
]);

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
  const input = await readStdin();
  const toolName = input?.hookSpecificInput?.toolName || '';
  
  if (DESTRUCTIVE_TOOLS.has(toolName)) {
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `${toolName} is a destructive operation — confirm before proceeding.`
      }
    };
    process.stdout.write(JSON.stringify(output));
  } else {
    // Auto-allow non-destructive tools
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow'
      }
    };
    process.stdout.write(JSON.stringify(output));
  }
}

main().catch(() => process.exit(0));
