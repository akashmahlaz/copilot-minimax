import fs from 'node:fs';
import path from 'node:path';
import { ANTHROPIC_URL } from './constants.js';
import { isPatched, patchContent } from './patching.js';
import { backupPath, extensionJsPath, findCopilotChatDir, userExtensionsDir } from './paths.js';
import { configureSettings } from './settings.js';

function requireCopilotDir() {
  const copilotDir = findCopilotChatDir();
  if (!copilotDir) {
    throw new Error(`Copilot Chat extension not found. Checked ${userExtensionsDir()} and bundled VS Code locations.`);
  }
  return copilotDir;
}

export function statusCommand() {
  const copilotDir = requireCopilotDir();
  const extensionJs = extensionJsPath(copilotDir);
  const backupFile = backupPath(extensionJs);
  const content = fs.readFileSync(extensionJs, 'utf8');
  const lines = [
    `Extension : ${path.basename(copilotDir)}`,
    `File      : ${extensionJs}`,
    `Size      : ${fs.statSync(extensionJs).size.toLocaleString()} bytes`,
    `Backup    : ${fs.existsSync(backupFile) ? 'yes' : 'no'}`,
  ];

  if (isPatched(content)) {
    const minimaxRefs = content.split('api.minimax.io/anthropic').length - 1;
    const modelRefs = content.split('MiniMax-M2.7').length - 1;
    const modelText = modelRefs ? `model refs: ${modelRefs}` : 'model patch not applicable in this build';
    lines.push(`Status    : PATCHED (minimax refs: ${minimaxRefs}, ${modelText})`);
  } else if (content.includes(ANTHROPIC_URL)) {
    lines.push('Status    : UNPATCHED (original Anthropic URLs)');
  } else {
    lines.push('Status    : UNKNOWN (neither Anthropic nor MiniMax URLs found)');
  }

  return lines.join('\n');
}

export function patchCommand({ apiKey } = {}) {
  const copilotDir = requireCopilotDir();
  const extensionJs = extensionJsPath(copilotDir);
  const backupFile = backupPath(extensionJs);
  const content = fs.readFileSync(extensionJs, 'utf8');

  if (isPatched(content)) {
    return `Extension: ${path.basename(copilotDir)}\nAlready patched. Run restore first if you want to re-patch.`;
  }

  if (!fs.existsSync(backupFile)) {
    fs.copyFileSync(extensionJs, backupFile);
  }

  const { content: patched, changes } = patchContent(content);
  if (changes.length === 0) {
    throw new Error('No patchable patterns found. Extension version may have changed.');
  }

  fs.writeFileSync(extensionJs, patched, 'utf8');

  const lines = [
    `Extension: ${path.basename(copilotDir)}`,
    fs.existsSync(backupFile) ? `Backup: ${path.basename(backupFile)}` : 'Backup: not created',
    `Patched successfully (${changes.length} changes):`,
    ...changes.map((change) => ` - ${change}`),
  ];

  if (apiKey) {
    lines.push(configureSettings(apiKey));
  }

  lines.push('Restart VS Code to apply changes.');
  return lines.join('\n');
}

export function restoreCommand() {
  const copilotDir = requireCopilotDir();
  const extensionJs = extensionJsPath(copilotDir);
  const backupFile = backupPath(extensionJs);

  if (!fs.existsSync(backupFile)) {
    throw new Error('No backup found. Nothing to restore.');
  }

  fs.copyFileSync(backupFile, extensionJs);
  return `Restored from backup: ${path.basename(backupFile)}\nRestart VS Code to apply.`;
}
