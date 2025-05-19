import * as vscode from 'vscode';
import { TestGenerationController } from '../features/testGeneration/TestGenerationController';

const GENERATE_TEST_COMMAND = 'redgreen.generateTest';

export function registerGenerateTestCommand(
  context: vscode.ExtensionContext,
  testGenerationController: TestGenerationController,
): void {
  const disposable = vscode.commands.registerCommand(
    GENERATE_TEST_COMMAND,
    async (
      uri: vscode.Uri,
      methodName: string,
      methodCode: string,
    ): Promise<void> => {
      if (!uri || !uri.fsPath) {
        vscode.window.showErrorMessage(
          'No file URI provided for test generation.',
        );
        return;
      }
      if (!methodName || !methodCode) {
        vscode.window.showErrorMessage(
          'Method name and method code are required for test generation.',
        );
        return;
      }

      // Focus the sidebar view
      await vscode.commands.executeCommand('redgreen.sidebarView.focus');

      // Always pass the relative path to the controller
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
      }
      const relPath = uri.fsPath.startsWith(workspaceRoot)
        ? uri.fsPath.slice(
            workspaceRoot.length +
              (workspaceRoot.endsWith(require('path').sep) ? 0 : 1),
          )
        : uri.fsPath;
      await testGenerationController.runGenerateTestFlow(
        relPath,
        methodName,
        methodCode,
      );
    },
  );
  context.subscriptions.push(disposable);
}
