import { patchCommand, restoreCommand, statusCommand } from './commands.js';

const HELP = `copilot-minimax

Usage:
  copilot-minimax status
  copilot-minimax patch [--key API_KEY]
  copilot-minimax restore

Examples:
  npx copilot-minimax status
  npx copilot-minimax patch --key sk-cp-...
`;

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--key') {
      const apiKey = args[index + 1];
      if (!apiKey) {
        throw new Error('Missing value for --key');
      }
      options.apiKey = apiKey;
      index += 1;
    } else if (arg.startsWith('--key=')) {
      const apiKey = arg.slice('--key='.length);
      if (!apiKey) {
        throw new Error('Missing value for --key');
      }
      options.apiKey = apiKey;
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${HELP}`);
    }
  }
  return options;
}

export async function main(args) {
  const [command, ...restArgs] = args;

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  if (command === 'status') {
    console.log(statusCommand());
    return;
  }

  if (command === 'patch') {
    console.log(patchCommand(parseOptions(restArgs)));
    return;
  }

  if (command === 'restore') {
    console.log(restoreCommand());
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}
