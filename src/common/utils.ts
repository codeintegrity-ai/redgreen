import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

export function listFilesTree(dir: string, ext: string, prefix = ''): string {
  let result = '';
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (!file.name.startsWith('.')) {
        result += `${prefix}${file.name}/\n`;
        result += listFilesTree(filePath, ext, prefix + '  ');
      }
    } else if (file.name.endsWith(ext)) {
      result += `${prefix}${file.name}\n`;
    }
  }
  return result;
}

export const supportedLanguages = [
  'python',
  'javascript',
  'typescript',
  'go',
  'java',
];

const extensionToLanguage: Record<string, string> = {
  '.py': 'python',
  '.ts': 'typescript',
  '.js': 'javascript',
  '.java': 'java',
  '.cs': 'csharp',
  '.go': 'go',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.h': 'cpp',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.tsx': 'typescriptreact',
  '.jsx': 'javascriptreact',
  '.sol': 'solidity',
  '.rs': 'rust',
};

export function getLanguageFromExtension(filePath: string): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const lang = extensionToLanguage[ext];
  return supportedLanguages.includes(lang) ? lang : 'plaintext';
}

export interface RunRepomixOptions {
  stdout?: boolean;
  compress?: boolean;
  configPath?: string;
  extraArgs?: string[];
}

export async function runRepomix(
  extensionPath: string,
  projectPath: string,
): Promise<string> {
  const scriptPath = path.join(extensionPath, 'bin/repomix/repomix.cjs');
  const commandParts = [
    '--stdout',
    '--compress',
  ];
  return new Promise((resolve) => {
    execFile(scriptPath, commandParts, { cwd: projectPath }, (error, stdout, stderr) => {
      if (error || stderr) {
        resolve('');
        return;
      }
      resolve(stdout);
    });
  });
}
