import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  ApplicationState,
  SidebarPage,
  WebviewToExtensionMessageType,
  ExtensionToWebviewMessageType,
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from '../../common/types';
import { StateController } from '../../core/StateController';
import { TestGenerationController } from '../testGeneration/TestGenerationController';
import { TestRunnerController } from '../testRunner/TestRunnerController';
import { KeyValueStoreI } from '../../core/ExtensionKeyValueStore';

const API_KEY_SECRET_KEY = 'redgreen_apiKey';

/**
 * Sidebar class responsible for managing the sidebar webview
 */
export class Sidebar implements vscode.WebviewViewProvider {
  public static readonly viewType = 'redgreen.sidebarView';

  private static readonly SIDEBAR_SUBDIR = 'media/sidebar';
  private static readonly HTML_SUBDIR = 'html';
  private static readonly CSS_SUBDIR = 'css';
  private static readonly JS_SUBDIR = 'js';
  private static readonly SIDEBAR_HTML_FILE = 'sidebar.html';
  private static readonly SIDEBAR_CSS_FILE = 'sidebar.css';
  private static readonly SIDEBAR_JS_FILE = 'sidebar.js';

  private _webviewView: vscode.WebviewView | undefined;
  private _currentPage: SidebarPage = 'home';
  private readonly disposables: vscode.Disposable[] = [];
  private readonly workspaceRootPath: string;

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly stateController: StateController,
    private readonly testGenerationController: TestGenerationController,
    private readonly testRunnerController: TestRunnerController,
    private readonly store: KeyValueStoreI,
    workspaceFolderUri: vscode.Uri,
  ) {
    this.workspaceRootPath = workspaceFolderUri.fsPath;
    this.stateController.onDidChangeState(
      this.handleStateChange.bind(this),
      this,
      this.disposables,
    );
    this.loadInitialState();
  }

  private async loadInitialState(): Promise<void> {
    const apiKey = await this.extensionContext.secrets.get(API_KEY_SECRET_KEY);
    const testMappings = await this.store.getTestFileMap();
    const [currentTestCommand, currentSourceFile, currentTestFile] =
      await Promise.all([
        this.store.getCurrentTestCommand(),
        this.store.getCurrentSourceFile(),
        this.store.getCurrentTestFile(),
      ]);
    this.stateController.updateState({
      isApiKeySet: !!apiKey,
      testMappings: { ...testMappings },
      testCommand: currentTestCommand,
      sourceFilePath: currentSourceFile,
      testFilePath: currentTestFile,
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._webviewView = webviewView;
    const extensionUri = this.extensionContext.extensionUri;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(extensionUri, Sidebar.SIDEBAR_SUBDIR),
      ],
    };

    try {
      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      webviewView.webview.onDidReceiveMessage(
        async (message: WebviewToExtensionMessage) => {
          try {
            await this.handleWebviewMessage(message);
          } catch (error: unknown) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
              `Error handling webview message: ${errorMsg}`,
            );
          }
        },
        undefined,
        this.disposables,
      );

      this.postMessageToWebview({
        type: ExtensionToWebviewMessageType.STATE_UPDATE,
        payload: this.stateController.state,
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to initialize sidebar: ${errorMsg}`,
      );
    }
  }

  private async handleWebviewMessage(
    message: WebviewToExtensionMessage,
  ): Promise<void> {
    switch (message.type) {
      case WebviewToExtensionMessageType.GET_INITIAL_STATE:
        this.postMessageToWebview({
          type: ExtensionToWebviewMessageType.STATE_UPDATE,
          payload: this.stateController.state,
        });
        break;
      case WebviewToExtensionMessageType.NAVIGATE_PAGE:
        if (this.isValidSidebarPage(message.payload.page)) {
          this.navigateToPage(message.payload.page);
        }
        break;
      case WebviewToExtensionMessageType.RUN_TEST_GENERATION:
        const { sourceFilePath, methodName, methodCode } = message.payload;
        // Convert relative path to absolute if needed
        const absSourceFilePath = this.ensureAbsolutePath(sourceFilePath);

        if (absSourceFilePath && methodName && methodCode) {
          this.testGenerationController
            .runGenerateTestFlow(absSourceFilePath, methodName, methodCode)
            .catch((err: Error) => {
              console.error('Error in RUN_TEST_GENERATION flow:', err);
              vscode.window.showErrorMessage(
                `Test Generation Failed: ${err.message}`,
              );
            });
        } else {
          throw new Error('Invalid payload for RUN_TEST_GENERATION');
        }
        break;
      case WebviewToExtensionMessageType.RUN_AUTOFIX:
        // Ignore sourcePath and testPath from payload, use top-level state
        const testOutput = this.stateController.state.testRunner?.output || '';
        const sourcePath = this.stateController.state.sourceFilePath;
        const testPath = this.stateController.state.testFilePath;
        const testCommand = this.stateController.state.testCommand;
        this.testGenerationController
          .runAutofixFlow(sourcePath, testPath, testOutput, testCommand)
          .catch((err: Error) => {
            console.error('Error in RUN_AUTOFIX flow:', err);
            vscode.window.showErrorMessage(`Autofix Failed: ${err.message}`);
          });
        break;
      case WebviewToExtensionMessageType.SET_TEST_COMMAND:
        await this.testRunnerController.setTestCommand(message.payload.command);
        break;
      case WebviewToExtensionMessageType.TOGGLE_WATCH_MODE:
        await this.testRunnerController.toggleTestWatchMode(
          message.payload.enabled,
        );
        break;
      case WebviewToExtensionMessageType.RUN_TEST:
        await this.testRunnerController.runTest();
        break;
      case WebviewToExtensionMessageType.STOP_TEST:
        await this.testRunnerController.stopTest();
        break;

      case WebviewToExtensionMessageType.SAVE_SETTINGS:
        const settings = message.payload;
        const updates: Partial<ApplicationState> = {};
        const promises: Promise<void>[] = [];

        if (typeof settings.selectedModelProvider === 'string') {
          updates.selectedModelProvider = settings.selectedModelProvider;
          promises.push(
            this.store.setUserPreference(
              'selectedModelProvider',
              settings.selectedModelProvider,
            ),
          );
        }
        if (typeof settings.apiKey === 'string') {
          if (settings.apiKey) {
            promises.push(
              Promise.resolve(
                this.extensionContext.secrets.store(
                  API_KEY_SECRET_KEY,
                  settings.apiKey,
                ),
              ).then(() => {
                updates.isApiKeySet = true;
              }),
            );
          } else {
            promises.push(
              Promise.resolve(
                this.extensionContext.secrets.delete(API_KEY_SECRET_KEY),
              ).then(() => {
                updates.isApiKeySet = false;
                vscode.window.showInformationMessage('API Key cleared.');
              }),
            );
          }
        }

        // check if api key is set
        const isApiKeySet =
          await this.extensionContext.secrets.get(API_KEY_SECRET_KEY);
        if (isApiKeySet) {
          updates.isApiKeySet = true;
        } else {
          updates.isApiKeySet = false;
        }

        await Promise.all(promises);
        this.stateController.updateState(updates);
        vscode.window.showInformationMessage('Settings saved.');
        break;

      case WebviewToExtensionMessageType.REMOVE_MAPPING:
        await this.store.removeTestFileMap(message.payload.sourcePath);
        const updatedMappingsRemove = await this.store.getTestFileMap();
        this.stateController.updateState({
          ...this.stateController.state,
          testMappings: updatedMappingsRemove,
        });
        this.postMessageToWebview({
          type: ExtensionToWebviewMessageType.STATE_UPDATE,
          payload: this.stateController.state,
        });
        break;

      case WebviewToExtensionMessageType.UPDATE_MAPPING:
        await this.store.updateTestFileMap(
          message.payload.sourcePath,
          message.payload.testPath,
        );
        const updatedMappingsUpdate = await this.store.getTestFileMap();
        this.stateController.updateState({
          testMappings: updatedMappingsUpdate,
        });
        vscode.window.showInformationMessage(
          `Mapping for ${path.basename(message.payload.sourcePath)} updated.`,
        );
        break;

      default:
        const _exhaustiveCheck: never = message;
        console.warn(
          'Received unhandled message type from webview:',
          _exhaustiveCheck,
        );
    }
  }

  /**
   * Ensures a path is absolute by converting it if it's relative
   */
  private ensureAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspaceRootPath, filePath);
  }

  /**
   * Converts an absolute path to relative path from workspace root
   */
  private toRelativePath(absPath: string): string {
    if (!path.isAbsolute(absPath)) {
      return absPath; // Already relative
    }
    return path.relative(this.workspaceRootPath, absPath);
  }

  private isValidSidebarPage(page: any): page is SidebarPage {
    return page === 'home' || page === 'settings';
  }

  private handleStateChange(newState: ApplicationState): void {
    if (this._webviewView) {
      this.postMessageToWebview({
        type: ExtensionToWebviewMessageType.STATE_UPDATE,
        payload: newState,
      });
    }
  }

  public postMessageToWebview(message: ExtensionToWebviewMessage): void {
    if (this._webviewView) {
      this._webviewView.webview
        .postMessage(message)
        .then(null, (err: Error) => {
          console.error('Failed to post message to webview:', err, message);
        });
    }
  }

  public navigateToPage(page: SidebarPage): void {
    this._currentPage = page; // Keep local track for UI consistency e.g. initial HTML render
    this._webviewView?.show?.(true); // Ensure the webview panel is visible

    // Always just update the currentPage.
    // The handleStateChange method will then send the full state (including the updated currentPage)
    // to the webview.
    this.stateController.updateState({ currentPage: page });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const extensionUri = this.extensionContext.extensionUri;
    const htmlDiskPath = vscode.Uri.joinPath(
      extensionUri,
      Sidebar.SIDEBAR_SUBDIR,
      Sidebar.HTML_SUBDIR,
      Sidebar.SIDEBAR_HTML_FILE,
    ).fsPath;

    if (!fs.existsSync(htmlDiskPath)) {
      throw new Error(
        `HTML file not found: ${htmlDiskPath}. Check localResourceRoots and asset paths.`,
      );
    }

    let html = fs.readFileSync(htmlDiskPath, 'utf8');

    const cssWebviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        Sidebar.SIDEBAR_SUBDIR,
        Sidebar.CSS_SUBDIR,
        Sidebar.SIDEBAR_CSS_FILE,
      ),
    );
    const jsWebviewUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        extensionUri,
        Sidebar.SIDEBAR_SUBDIR,
        Sidebar.JS_SUBDIR,
        Sidebar.SIDEBAR_JS_FILE,
      ),
    );

    html = html.replace('{{cssUri}}', cssWebviewUri.toString());
    html = html.replace('{{jsUri}}', jsWebviewUri.toString());

    html = html.replace('{{currentPage}}', this._currentPage);

    return html;
  }

  public dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this._webviewView = undefined;
  }
}
