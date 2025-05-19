import * as cp from 'child_process';
import * as vscode from 'vscode';
import { TestRunStatus } from '../../common/types'; // Updated path

export interface TestRunResult {
  status: TestRunStatus;
  output: string;
  error?: string;
}

export interface TestRunnerServiceI extends vscode.Disposable {
  runTest(command: string): Promise<TestRunResult>;
  stopTest(): { output: string };
  isRunning(): boolean;
}

export class TestRunnerService implements TestRunnerServiceI {
  private process: cp.ChildProcess | null = null;
  private readonly workspaceFolder: string;
  private currentOutputLog: string[] = [];

  constructor(workspaceFolder: string) {
    this.workspaceFolder = workspaceFolder;
  }

  private logOutput(line: string): void {
    const cleanLine = String(line).replace(/(\r\n|\n|\r)$/, '');
    if (
      cleanLine.length === 0 &&
      this.currentOutputLog.length > 0 &&
      this.currentOutputLog[this.currentOutputLog.length - 1].length === 0
    ) {
      return;
    }
    this.currentOutputLog.push(cleanLine);
  }

  public async runTest(command: string): Promise<TestRunResult> {
    if (this.process) {
      this.stopTest();
    }
    this.currentOutputLog = [];

    return new Promise((resolve) => {
      try {
        let cmdToRun: string;
        let args: string[];

        if (process.platform === 'win32') {
          cmdToRun = 'cmd.exe';
          args = ['/c', command];
        } else {
          cmdToRun = '/bin/sh';
          args = ['-c', command];
        }

        const env = { ...process.env };
        this.process = cp.spawn(cmdToRun, args, {
          cwd: this.workspaceFolder,
          shell: false,
          env,
        });
        this.logOutput(`Starting test command: ${command}`);

        this.process.stdout?.on('data', (data: Buffer) => {
          data
            .toString()
            .split('\n')
            .forEach((line) => this.logOutput(line));
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          data
            .toString()
            .split('\n')
            .forEach((line) => this.logOutput(line));
        });

        this.process.on('exit', (code: number | null) => {
          let status = TestRunStatus.ERROR;
          if (code === 0) {
            status = TestRunStatus.SUCCESS;
          } else if (code === 1) {
            status = TestRunStatus.FAIL;
          }
          this.process = null;
          resolve({ status, output: this.currentOutputLog.join('\n') });
        });

        this.process.on('error', (err: Error) => {
          this.logOutput(`Test execution process error: ${err.message}`);
          this.process = null;
          resolve({
            status: TestRunStatus.ERROR,
            output: this.currentOutputLog.join('\n'),
            error: err.message,
          });
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logOutput(`Failed to start test process: ${errorMessage}`);
        resolve({
          status: TestRunStatus.ERROR,
          output: this.currentOutputLog.join('\n'),
          error: errorMessage,
        });
      }
    });
  }

  public stopTest(): { output: string } {
    const stopMessage = '\nTest execution stopped by user.';
    if (this.process) {
      if (process.platform === 'win32') {
        cp.exec(`taskkill /pid ${this.process.pid} /T /F`);
      } else {
        this.process.kill('SIGTERM');
      }
      this.process = null;
      this.logOutput(stopMessage);
      return { output: this.currentOutputLog.join('\n') };
    }
    return { output: stopMessage };
  }

  public isRunning(): boolean {
    return this.process !== null;
  }

  public dispose(): void {
    if (this.isRunning()) {
      this.stopTest();
    }
  }
}
