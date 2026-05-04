import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BACKUP_SUFFIX } from './constants.js';

function exists(directoryPath) {
  return Boolean(directoryPath) && fs.existsSync(directoryPath);
}

function children(directoryPath) {
  if (!exists(directoryPath)) {
    return [];
  }
  return fs.readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(directoryPath, entry.name));
}

export function userExtensionsDir() {
  return path.join(os.homedir(), '.vscode', 'extensions');
}

function bundledCopilotDirs() {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const roots = [
      path.join(localAppData, 'Programs', 'Microsoft VS Code'),
      path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders'),
    ];

    return roots.flatMap((root) =>
      [
        path.join(root, 'resources', 'app', 'extensions', 'copilot'),
        ...children(root).map((versionDir) => path.join(versionDir, 'resources', 'app', 'extensions', 'copilot')),
      ],
    );
  }

  if (process.platform === 'darwin') {
    return [
      '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/copilot',
      '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions/copilot',
    ];
  }

  return [
    '/usr/share/code/resources/app/extensions/copilot',
    '/usr/share/code-insiders/resources/app/extensions/copilot',
    path.join(os.homedir(), '.vscode-server', 'extensions', 'copilot'),
  ];
}

export function candidateCopilotChatDirs() {
  const legacyDirs = children(userExtensionsDir())
    .filter((candidateDir) => path.basename(candidateDir).startsWith('github.copilot-chat-'));

  return [...legacyDirs, ...bundledCopilotDirs()]
    .filter((candidateDir) => exists(candidateDir))
    .filter((candidateDir, index, allDirs) => allDirs.indexOf(candidateDir) === index);
}

export function findCopilotChatDir() {
  const candidates = candidateCopilotChatDirs()
    .filter((candidateDir) => exists(extensionJsPath(candidateDir)))
    .sort((leftDir, rightDir) => {
      const leftStat = fs.statSync(extensionJsPath(leftDir));
      const rightStat = fs.statSync(extensionJsPath(rightDir));
      if (rightStat.mtimeMs !== leftStat.mtimeMs) {
        return rightStat.mtimeMs - leftStat.mtimeMs;
      }
      return path.basename(rightDir).localeCompare(path.basename(leftDir));
    });

  return candidates[0] || null;
}

export function extensionJsPath(copilotDir) {
  return path.join(copilotDir, 'dist', 'extension.js');
}

export function backupPath(extensionJs) {
  return `${extensionJs}${BACKUP_SUFFIX}`;
}

export function vscodeSettingsPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Code', 'User', 'settings.json');
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json');
  }

  return path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');
}
