import { exec, spawn } from 'child_process';
import path from 'path';
import * as vscode from 'vscode';

/**
 * Options for Codex command
 */
export interface CodexOptions {
  model?: string;
}

export interface ParsedCodexMessageBase {
  type: string;
}

export interface ParsedCodexMessageMessage extends ParsedCodexMessageBase {
  type: 'message';
  status: string;
  content: string;
  id?: string;
  role?: string;
}

export interface ParsedCodexMessageFunctionCall extends ParsedCodexMessageBase {
  type: 'function_call';
  status: string;
  id?: string;
  call_id?: string;
  arguments?: string;
  name?: string;
}

export interface ParsedCodexMessageFunctionCallOutput
  extends ParsedCodexMessageBase {
  type: 'function_call_output';
  call_id?: string;
  output?: string;
}

export type ParsedCodexMessage =
  | ParsedCodexMessageMessage
  | ParsedCodexMessageFunctionCall
  | ParsedCodexMessageFunctionCallOutput;

export class CodexAgent {
  private readonly cwd: string;
  private readonly defaultModel: string = 'codex-mini-latest';
  private readonly context: vscode.ExtensionContext;

  constructor(cwd: string, context: vscode.ExtensionContext) {
    this.cwd = cwd;
    this.context = context;
  }

  public async run(
    prompt: string,
    options: CodexOptions = {},
  ): Promise<string> {
    const model = options.model || this.defaultModel;
    const apiKey = await this.context.secrets.get('redgreen_apiKey');
    if (!apiKey) {
      throw Error('OpenAPI Key not configured!');
    }
    const env = { ...process.env, OPENAI_API_KEY: apiKey };
    const commandParts = [
      '--model',
      model,
      '--approval-mode',
      'full-auto',
      '--full-auto-error-mode',
      'ignore-and-continue',
      '--notify',
      'false',
      '-q',
      `"${prompt}"`,
    ];
    const codexPath = path.join(this.context.extensionPath, './bin/@openai/codex/bin/codex.js');
    const command = `${codexPath} ${commandParts.join(' ')}`;
    const result = await this.execCommand(command, env);
    return result;
  }

  private static parseCodexLine(line: string): ParsedCodexMessage | undefined {
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new Error('Invalid JSON in Codex output: ' + line);
    }
    if (obj.type === 'message' && obj.status === 'completed') {
      let content: string = '';
      if (
        Array.isArray(obj.content) &&
        obj.content.length > 0 &&
        typeof obj.content[0].text === 'string'
      ) {
        content = obj.content[0].text;
      } else if (typeof obj.content === 'string') {
        content = obj.content;
      } else {
        content = JSON.stringify(obj.content ?? '');
      }
      return {
        type: 'message',
        status: obj.status ?? '',
        content,
        id: obj.id,
        role: obj.role,
      };
    }
    if (obj.type === 'function_call' && obj.status === 'completed') {
      return {
        type: 'function_call',
        status: obj.status ?? '',
        id: obj.id,
        call_id: obj.call_id,
        arguments: obj.arguments,
        name: obj.name,
      };
    }
    if (obj.type === 'function_call_output') {
      return {
        type: 'function_call_output',
        call_id: obj.call_id,
        output: obj.output,
      };
    }
    // Ignore other types or non-completed
    return undefined;
  }

  public async stream(
    prompt: string,
    onMessage: (msg: string) => void,
    options: CodexOptions = {},
  ): Promise<void> {
    const model = options.model || this.defaultModel;
    const env = { ...process.env };
    const apiKey = await this.context.secrets.get('redgreen_apiKey');
    if (!apiKey) {
      throw Error('OpenAPI Key not configured!');
    }
    const codexPath = path.join(this.context.extensionPath, './bin/@openai/codex/bin/codex.js');

    const commandParts = [
      '--model',
      model,
      '--approval-mode',
      'full-auto',
      '--full-auto-error-mode',
      'ignore-and-continue',
      '--notify',
      'false',
      '-q',
      `"${prompt}"`,
    ];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(codexPath, commandParts, {
        cwd: this.cwd,
        env: { ...env, OPENAI_API_KEY: apiKey },
      });
      // let buffer = '';
      child.stdout.on('data', (data) => {
        onMessage(data.toString());
      });
      child.stderr.on('data', (data) => {
        onMessage(data.toString());
      });
      child.on('close', (code) => {
        if (code !== 0) {
          onMessage(`[codex exited with code ${code}]`);
          return reject(new Error(`Codex exited with code ${code}`));
        }
        resolve();
      });
      child.on('error', (error) => {
        onMessage(`[codex error: ${error.message}]`);
        reject(new Error(`Codex error: ${error.message}`));
      });
    });
  }

  private execCommand(
    command: string,
    env: NodeJS.ProcessEnv,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, { cwd: this.cwd, env }, (error, stdout) => {
        if (error)
          return reject(new Error(`Codex exec error: ${error.message}`));
        const responses = stdout.split('\n').filter(Boolean);
        const completed = responses.find((line) => {
          try {
            const obj = JSON.parse(line);
            return obj.type === 'message' && obj.status === 'completed';
          } catch {
            return false;
          }
        });
        if (!completed)
          return reject(new Error('No completed message from Codex'));
        try {
          const parsed = CodexAgent.parseCodexLine(completed);
          if (!parsed || parsed.type !== 'message') throw new Error();
          return resolve(parsed.content);
        } catch {
          return reject(new Error('Failed to parse Codex message content'));
        }
      });
    });
  }
}
