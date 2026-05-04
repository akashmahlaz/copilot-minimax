import fs from 'node:fs';
import { MINIMAX_URL } from './constants.js';
import { vscodeSettingsPath } from './paths.js';

export function configureSettings(apiKey) {
  const settingsPath = vscodeSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    return `Warning: VS Code settings.json not found at ${settingsPath}`;
  }

  const rawSettings = fs.readFileSync(settingsPath, 'utf8');
  const settings = rawSettings.trim() ? JSON.parse(rawSettings) : {};

  settings['claudeCode.environmentVariables'] = [
    { name: 'ANTHROPIC_BASE_URL', value: MINIMAX_URL },
    { name: 'ANTHROPIC_AUTH_TOKEN', value: apiKey },
    { name: 'API_TIMEOUT_MS', value: '3000000' },
    { name: 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', value: '1' },
    { name: 'ANTHROPIC_MODEL', value: 'MiniMax-M2.7' },
    { name: 'ANTHROPIC_SMALL_FAST_MODEL', value: 'MiniMax-M2.7' },
    { name: 'ANTHROPIC_DEFAULT_SONNET_MODEL', value: 'MiniMax-M2.7' },
    { name: 'ANTHROPIC_DEFAULT_OPUS_MODEL', value: 'MiniMax-M2.7' },
    { name: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', value: 'MiniMax-M2.7' },
  ];

  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 4)}\n`, 'utf8');
  return 'Updated VS Code settings with MiniMax env vars.';
}
