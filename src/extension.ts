// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import GenerateTestCodeLensProvider from './features/testGeneration/GenerateTestCodeLensProvider';
import { registerGenerateTestCommand } from './commands/registerGenerateTestCommand';
import { registerSidebarTitleCommands } from './commands/registerSidebarCommand';
import { CodexAgent } from './agent/CodexAgent';
import { OpenAIAgent } from './agent/OpenAIAgent';
import { ExtensionKeyValueStore } from './core/ExtensionKeyValueStore';
import { TestGenerationService } from './features/testGeneration/TestGenerationService';
import { TestGenerationController } from './features/testGeneration/TestGenerationController';
import { TestRunnerService } from './features/testRunner/TestRunnerService';
import { TestRunnerController } from './features/testRunner/TestRunnerController';
import { Sidebar } from './features/sidebar/Sidebar';
import { StateController } from './core/StateController';

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder found');
    }
    // run extension root's bin/codex to see if it works
    
    const store = new ExtensionKeyValueStore(context, workspaceFolder.uri);
    const codexAgent = new CodexAgent(workspaceFolder.uri.fsPath, context);
    const openaiAgent = new OpenAIAgent(context);
    const generateTestCodeLensProvider =
      vscode.languages.registerCodeLensProvider(
        { scheme: 'file' },
        new GenerateTestCodeLensProvider(),
      );
    context.subscriptions.push(generateTestCodeLensProvider);

    const stateController = new StateController({
      /* Initial state can be defined here */
    });
    context.subscriptions.push(stateController);

    const testGenerationService = new TestGenerationService(
      context.extensionPath,
      workspaceFolder.uri.fsPath,
      codexAgent,
      openaiAgent,
    );

    const testGenerationController = new TestGenerationController(
      testGenerationService,
      workspaceFolder.uri.fsPath,
      stateController,
      store,
      context.extensionPath,
    );
    context.subscriptions.push(testGenerationController);

    const testRunnerService = new TestRunnerService(workspaceFolder.uri.fsPath);
    context.subscriptions.push(testRunnerService);
    const testRunnerController = new TestRunnerController(
      store,
      testRunnerService,
      stateController,
    );
    context.subscriptions.push(testRunnerController);

    const sidebarProvider = new Sidebar(
      context,
      stateController,
      testGenerationController,
      testRunnerController,
      store,
      workspaceFolder.uri,
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        Sidebar.viewType,
        sidebarProvider,
      ),
    );
    context.subscriptions.push(sidebarProvider);

    registerSidebarTitleCommands(context, sidebarProvider);
    registerGenerateTestCommand(context, testGenerationController);
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to activate extension: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error('Activation error:', error);
  }
}

// This method is called when your extension is deactivated
export function deactivate(): void {
  // Resources are automatically disposed if they were added to context.subscriptions.
}
