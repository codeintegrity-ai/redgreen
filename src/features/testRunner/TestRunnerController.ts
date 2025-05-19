import * as vscode from 'vscode';
import { TestRunnerServiceI, TestRunResult } from './TestRunnerService'; // Updated path
import { KeyValueStoreI } from '../../core/ExtensionKeyValueStore'; // Updated path
import { StateController } from '../../core/StateController'; // Updated path
import { TestRunStatus, TestRunnerState } from '../../common/types'; // Import specific types

/**
 * Controller that handles test runner interactions
 */
export class TestRunnerController implements vscode.Disposable {
  private readonly store: KeyValueStoreI;
  private readonly testRunnerService: TestRunnerServiceI;
  private readonly stateController: StateController;

  private watchInterval: NodeJS.Timeout | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    store: KeyValueStoreI,
    testRunnerService: TestRunnerServiceI,
    stateController: StateController,
  ) {
    this.store = store;
    this.testRunnerService = testRunnerService;
    this.stateController = stateController;
  }

  public dispose(): void {
    this.clearWatchInterval();
    if (this.testRunnerService.isRunning()) {
      const stopServiceResult = this.testRunnerService.stopTest();
      this.updateRunnerStateFromResult({
        status: TestRunStatus.NOT_RUN,
        output: stopServiceResult.output,
        error: '',
      });
    }
    this.disposables.forEach((d) => d.dispose());
  }

  private updateRunnerState(newState: Partial<TestRunnerState>): void {
    const currentRunnerState = this.stateController.state.testRunner;
    this.stateController.updateState({
      testRunner: { ...currentRunnerState, ...newState },
    });
  }

  private updateRunnerStateFromResult(result: TestRunResult): void {
    this.updateRunnerState({
      status: result.status,
      output: result.output,
    });
  }

  public async setTestCommand(command: string): Promise<void> {
    this.stateController.updateState({
      testCommand: command,
    });
    this.updateRunnerState({
      status: TestRunStatus.NOT_RUN,
      output: '',
    });
    await this.store.setCurrentTestCommand(command);
    if (this.stateController.state.testRunner.isWatchModeEnabled) {
      await this.runTest();
    }
  }

  public async toggleTestWatchMode(enabled: boolean): Promise<void> {
    this.updateRunnerState({ isWatchModeEnabled: enabled });

    if (enabled) {
      this.setupWatchInterval();
      if (this.stateController.state.testCommand) {
        await this.runTest();
      }
    } else {
      this.clearWatchInterval();
      if (this.testRunnerService.isRunning()) {
        const stopServiceResult = this.testRunnerService.stopTest();
        this.updateRunnerStateFromResult({
          status: TestRunStatus.NOT_RUN,
          output: stopServiceResult.output,
          error: '',
        });
      }
    }
  }

  private setupWatchInterval(): void {
    this.clearWatchInterval();
    this.scheduleNextTestRun();
  }

  private scheduleNextTestRun(): void {
    this.clearWatchInterval();
    const runnerState = this.stateController.state.testRunner;
    const testCommand = this.stateController.state.testCommand;

    if (runnerState.isWatchModeEnabled && testCommand) {
      this.watchInterval = setTimeout(async () => {
        const currentRunnerState = this.stateController.state.testRunner;
        const currentTestCommand = this.stateController.state.testCommand;
        if (
          currentRunnerState.isWatchModeEnabled &&
          currentTestCommand &&
          !this.testRunnerService.isRunning()
        ) {
          await this.runTest();
        }
        if (this.stateController.state.testRunner.isWatchModeEnabled) {
          this.scheduleNextTestRun();
        }
      }, 2000);
    }
  }

  public async runTest(): Promise<TestRunResult | undefined> {
    const commandToRun = this.stateController.state.testCommand;
    if (!commandToRun) {
      const errorMsg =
        'No test command defined. Please set a test command first.';
      this.updateRunnerState({
        status: TestRunStatus.ERROR,
        output: 'Error: ' + errorMsg,
      });
      return {
        status: TestRunStatus.ERROR,
        output: 'Error: ' + errorMsg,
        error: errorMsg,
      };
    }

    this.updateRunnerState({
      status: TestRunStatus.RUNNING,
      output: 'Running tests...',
    });

    let result: TestRunResult;
    try {
      result = await this.testRunnerService.runTest(commandToRun);
      this.updateRunnerStateFromResult(result);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result = {
        status: TestRunStatus.ERROR,
        output: `Controller error before running test: ${errorMessage}`,
        error: `Controller error before running test: ${errorMessage}`,
      };
      this.updateRunnerStateFromResult(result);
    } finally {
      if (this.stateController.state.testRunner.isWatchModeEnabled) {
        this.scheduleNextTestRun();
      }
    }
    return result;
  }

  public async stopTest(): Promise<void> {
    if (this.testRunnerService.isRunning()) {
      const stopServiceResult = this.testRunnerService.stopTest();
      this.updateRunnerStateFromResult({
        status: TestRunStatus.NOT_RUN,
        output: stopServiceResult.output,
        error: '',
      });
    } else {
      this.updateRunnerState({
        output: 'No test was running to stop.',
        status: TestRunStatus.NOT_RUN,
      });
    }

    if (this.stateController.state.testRunner.isWatchModeEnabled) {
      this.clearWatchInterval();
    }
  }

  private clearWatchInterval(): void {
    if (this.watchInterval) {
      clearTimeout(this.watchInterval);
      this.watchInterval = undefined;
    }
  }
}
