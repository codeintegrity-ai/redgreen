import * as vscode from 'vscode';
import * as path from 'path';
import {
  TestGenerationService,
  TestFilePathOption,
} from './TestGenerationService'; // Updated path
import { listFilesTree, runRepomix } from '../../common/utils'; // Updated path
import { StateController } from '../../core/StateController'; // Updated path
import { KeyValueStoreI } from '../../core/ExtensionKeyValueStore'; // Updated path
import { TestGenerationState, AutofixState } from '../../common/types';
import * as fsPromises from 'fs/promises';

/**
 * Controller that handles test generation
 */
export class TestGenerationController implements vscode.Disposable {
  private readonly service: TestGenerationService;
  private readonly workspaceRoot: string;
  private readonly stateController: StateController;
  private readonly store: KeyValueStoreI;
  private readonly extensionRoot: string;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    service: TestGenerationService,
    workspaceRoot: string,
    stateController: StateController,
    store: KeyValueStoreI,
    extensionRoot: string,
  ) {
    this.service = service;
    this.workspaceRoot = workspaceRoot;
    this.stateController = stateController;
    this.store = store;
    this.extensionRoot = extensionRoot;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }

  private async updateTestGenerationStatus(
    sourceFilePath: string,
    testFilePath: string,
    status: TestGenerationState['status'],
    message?: string,
  ): Promise<void> {
    // Update top-level state for file paths
    this.stateController.updateState({
      sourceFilePath,
      testFilePath,
      currentTestGeneration: {
        status,
        message,
      },
    });
    await this.store.setCurrentSourceFile(sourceFilePath);
    await this.store.setCurrentTestFile(testFilePath);
  }

  private async updateAutofixStatus(
    status: AutofixState['status'],
    message?: string,
  ): Promise<void> {
    this.stateController.updateState({
      currentAutofix: {
        status,
        message,
      },
    });
  }

  /**
   * Prompts the user to select a test file path
   */
  async selectTestFilePath(sourceFilePath: string): Promise<string> {
    if (!sourceFilePath) {
      throw new Error('Source file path is required');
    }
    // Always treat the input as a relative path for mapping
    const testFileMap = await this.store.getTestFileMap();
    const existingTestFilePath = testFileMap[sourceFilePath];
    const options: TestFilePathOption[] =
      await this.service.getTestFilePathOptions(
        sourceFilePath,
        existingTestFilePath,
      );
    const quickPickItems = options.map((opt) => {
      return {
        label:
          opt.type === 'extend'
            ? '$(check) Extend Existing Test File'
            : '$(new-file) Create New Test File',
        description: opt.filePath,
        path: opt.filePath,
        option: opt,
      };
    });
    const selection = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: 'Choose where to generate the test',
      canPickMany: false,
      ignoreFocusOut: true,
    });
    if (!selection) {
      throw new Error('Test file selection was cancelled by the user.');
    }
    if (selection.option.type === 'extend' && selection.path) {
      // construct abs path based on workspace root
      // const absPath = path.join(this.workspaceRoot, selection.path);
      // const doc = await vscode.workspace.openTextDocument(absPath);
      // await vscode.window.showTextDocument(doc, {
      //   preview: false,
      // });
      return selection.path;
    }
    try {
      // NOTE: this is an absolute path
      const newAbsTestFilePath =
        await this.service.createNewTestFilePath(sourceFilePath); // absolute path
      const relNewTestFilePath = path.relative(
        this.workspaceRoot,
        newAbsTestFilePath,
      );
      // write file
      // create empty dirs
      await fsPromises.mkdir(path.dirname(newAbsTestFilePath), {
        recursive: true,
      });
      await fsPromises.writeFile(newAbsTestFilePath, '');
      const doc = await vscode.workspace.openTextDocument(newAbsTestFilePath);

      await this.store.updateTestFileMap(sourceFilePath, relNewTestFilePath);
      await vscode.window.showTextDocument(doc, {
        preview: false,
      });
      const updatedTestFileMap = await this.store.getTestFileMap();

      this.stateController.updateState({
        testMappings: updatedTestFileMap,
      });

      return relNewTestFilePath;
    } catch (error) {
      throw new Error(
        `Failed to create new test file path: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Main flow for generating a test
   */
  async runGenerateTestFlow(
    sourceFilePath: string,
    methodName: string,
    methodCode: string,
  ): Promise<void> {
    if (!sourceFilePath || !methodName || !methodCode) {
      vscode.window.showErrorMessage(
        'Source file path, method name, and method code are required for test generation.',
      );
      return; // Ensure it returns after showing the error
    }

    let testFilePath = '';

    // Immediately update status to in_progress before any async operation like selectTestFilePath
    await this.updateTestGenerationStatus(
      sourceFilePath,
      '',
      'in_progress',
      'Initializing test generation...',
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Generating test for ${path.basename(sourceFilePath)}`,
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({
            message: 'Selecting test file location...',
            increment: 10,
          });
          testFilePath = await this.selectTestFilePath(sourceFilePath);

          progress.report({
            message: 'Analyzing project structure...',
            increment: 20,
          });
          const directoryTree = listFilesTree(
            this.workspaceRoot,
            path.extname(sourceFilePath),
          );

          progress.report({
            message: 'Generating test code with AI...',
            increment: 30,
          });
          const context = await runRepomix(this.extensionRoot, this.workspaceRoot);
          const testCode = await this.service.generateAITestCode({
            context: context,
            sourceFilePath: sourceFilePath,
            testFilePath: testFilePath,
            methodName: methodName,
            methodCode: methodCode,
            directoryTree: directoryTree,
          });

          progress.report({ message: 'Writing test file...', increment: 20 });
          const absTestFilePath = path.join(this.workspaceRoot, testFilePath);
          await fsPromises.writeFile(absTestFilePath, testCode);

          progress.report({ message: 'Opening test file...', increment: 20 });
          await this.updateTestGenerationStatus(
            sourceFilePath,
            testFilePath,
            'success',
            'Test generated successfully!',
          );
        } catch (err: unknown) {
          let errorMessage =
            'An unknown error occurred during test generation.';
          if (err instanceof Error) {
            errorMessage = err.message;
          }
          if (
            this.stateController.state.currentTestGeneration.status ===
            'in_progress'
          ) {
            await this.updateTestGenerationStatus(
              sourceFilePath,
              testFilePath,
              'error',
              errorMessage,
            );
          }
          vscode.window.showErrorMessage(
            `Test generation failed: ${errorMessage}`,
          );
          throw err;
        }
      },
    );
  }

  /**
   * Main flow for autofixing a test
   */
  public async runAutofixFlow(
    sourcePath: string,
    testPath: string,
    testOutput: string,
    testCommand: string,
  ): Promise<void> {
    if (!sourcePath || !testPath) {
      throw new Error(
        'Source file path and test file path are required for autofix',
      );
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Autofixing test file...',
        cancellable: false,
      },
      async (progress) => {
        await this.updateAutofixStatus('in_progress', 'Starting autofix...');
        let errorMessage: string | undefined;
        const terminal = vscode.window.createTerminal({
          name: 'Autofix Results',
        });
        terminal.show();
        try {
          progress.report({ message: 'Analyzing project structure...' });
          const ext = path.extname(sourcePath);
          const directoryTree = listFilesTree(this.workspaceRoot, ext);
          progress.report({ message: 'Running autofix with AI...' });
          const testStatus = this.stateController.state.testRunner.status;
          const context = await runRepomix(this.extensionRoot, this.workspaceRoot);
          let buffer = '';
          await this.service.autofixTests({
            context: context,
            sourceFilePath: sourcePath,
            testFilePath: testPath,
            testOutput: testOutput,
            testCommand: testCommand,
            directoryTree: directoryTree,
            testStatus: testStatus,
            onCodexMessage: (msg: string) => {
              buffer += msg;
              let lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) {
                if (line.trim()) {
                  terminal.sendText(line, false);
                }
              }
            },
          });
          // Flush any remaining buffer
          if (buffer.trim()) {
            terminal.sendText(buffer, false);
          }
          await this.updateAutofixStatus('success', 'Autofix completed successfully!');
        } catch (error: unknown) {
          errorMessage = error instanceof Error ? error.message : String(error);
          await this.updateAutofixStatus('error', `Autofix failed: ${errorMessage}`);
          vscode.window.showErrorMessage(`Autofix failed: ${errorMessage}`);
          throw error;
        }
      },
    );
  }

}
