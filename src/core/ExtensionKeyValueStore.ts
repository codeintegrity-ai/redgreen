import * as vscode from 'vscode';

export interface KeyValueStoreI {
  getTestFileMap(): Promise<{ [key: string]: string }>;
  updateTestFileMap(sourceFile: string, testFile: string): Promise<void>;
  removeTestFileMap(sourceFile: string): Promise<void>;
  getUserPreference(key: string): Promise<any | undefined>;
  setUserPreference(key: string, value: any): Promise<void>;
  getValue<T>(key: string): Promise<T | undefined>;
  setValue<T>(key: string, value: T): Promise<void>;
  setCurrentTestCommand(command: string): Promise<void>;
  getCurrentTestCommand(): Promise<string | undefined>;
  removeCurrentTestCommand(): Promise<void>;
  setCurrentSourceFile(sourceFile: string): Promise<void>;
  getCurrentSourceFile(): Promise<string | undefined>;
  removeCurrentSourceFile(): Promise<void>;
  setCurrentTestFile(testFile: string): Promise<void>;
  getCurrentTestFile(): Promise<string | undefined>;
  removeCurrentTestFile(): Promise<void>;
  setCurrentContext(context: string): Promise<void>;
  getCurrentContext(): Promise<string | undefined>;
}

const TEST_FILE_MAP_KEY = 'testFileMap';
const USER_PREFERENCES_KEY_PREFIX = 'userPreference_';

// --- New keys for current session state ---
const CURRENT_TEST_COMMAND_KEY = 'currentTestCommand';
const CURRENT_SOURCE_FILE_KEY = 'currentSourceFile';
const CURRENT_TEST_FILE_KEY = 'currentTestFile';
const CURRENT_CONTEXT_KEY = 'currentContext';

export class ExtensionKeyValueStore implements KeyValueStoreI {
  private context: vscode.ExtensionContext;
  private scopePrefix: string;
  private workspaceRootPath: string;

  constructor(
    context: vscode.ExtensionContext,
    workspaceFolderUri: vscode.Uri,
  ) {
    this.context = context;
    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(workspaceFolderUri);
    if (
      !workspaceFolder ||
      workspaceFolder.uri.toString() !== workspaceFolderUri.toString()
    ) {
      throw new Error(
        `Invalid workspaceFolderUri provided: ${workspaceFolderUri.toString()}. It must be a URI of a root folder in the current workspace.`,
      );
    }
    this.scopePrefix = workspaceFolder.uri.toString() + ':';
    this.workspaceRootPath = workspaceFolder.uri.fsPath;
  }

  private getScopedKey(baseKey: string): string {
    return this.scopePrefix + baseKey;
  }

  async getTestFileMap(): Promise<{ [key: string]: string }> {
    const key = this.getScopedKey(TEST_FILE_MAP_KEY);
    const testMappings =
      this.context.workspaceState.get<{ [key: string]: string }>(key) || {};
    return testMappings;
  }

  async updateTestFileMap(sourceFile: string, testFile: string): Promise<void> {
    const map = await this.getTestFileMap();
    map[sourceFile] = testFile;
    const key = this.getScopedKey(TEST_FILE_MAP_KEY);
    await this.context.workspaceState.update(key, map);
  }

  async removeTestFileMap(sourceFile: string): Promise<void> {
    const map = await this.getTestFileMap();
    delete map[sourceFile];
    const key = this.getScopedKey(TEST_FILE_MAP_KEY);
    await this.context.workspaceState.update(key, map);
  }

  async getUserPreference(prefKey: string): Promise<any | undefined> {
    const scopedUserPrefKey = this.getScopedKey(
      USER_PREFERENCES_KEY_PREFIX + prefKey,
    );
    return this.context.workspaceState.get<any>(scopedUserPrefKey);
  }

  async setUserPreference(prefKey: string, value: any): Promise<void> {
    const scopedUserPrefKey = this.getScopedKey(
      USER_PREFERENCES_KEY_PREFIX + prefKey,
    );
    await this.context.workspaceState.update(scopedUserPrefKey, value);
  }

  async getValue<T>(valueKey: string): Promise<T | undefined> {
    const scopedValueKey = this.getScopedKey(valueKey);
    return this.context.workspaceState.get<T>(scopedValueKey);
  }

  async setValue<T>(valueKey: string, value: T): Promise<void> {
    const scopedValueKey = this.getScopedKey(valueKey);
    await this.context.workspaceState.update(scopedValueKey, value);
  }

  // --- Current Test Command ---
  async setCurrentTestCommand(command: string): Promise<void> {
    const key = this.getScopedKey(CURRENT_TEST_COMMAND_KEY);
    await this.context.workspaceState.update(key, command);
  }
  async getCurrentTestCommand(): Promise<string | undefined> {
    const key = this.getScopedKey(CURRENT_TEST_COMMAND_KEY);
    return this.context.workspaceState.get<string>(key);
  }
  async removeCurrentTestCommand(): Promise<void> {
    const key = this.getScopedKey(CURRENT_TEST_COMMAND_KEY);
    await this.context.workspaceState.update(key, undefined);
  }

  // --- Current Source File ---
  async setCurrentSourceFile(sourceFile: string): Promise<void> {
    const key = this.getScopedKey(CURRENT_SOURCE_FILE_KEY);
    await this.context.workspaceState.update(key, sourceFile);
  }
  async getCurrentSourceFile(): Promise<string | undefined> {
    const key = this.getScopedKey(CURRENT_SOURCE_FILE_KEY);
    return this.context.workspaceState.get<string>(key);
  }
  async removeCurrentSourceFile(): Promise<void> {
    const key = this.getScopedKey(CURRENT_SOURCE_FILE_KEY);
    await this.context.workspaceState.update(key, undefined);
  }

  // --- Current Test File ---
  async setCurrentTestFile(testFile: string): Promise<void> {
    const key = this.getScopedKey(CURRENT_TEST_FILE_KEY);
    await this.context.workspaceState.update(key, testFile);
  }
  async getCurrentTestFile(): Promise<string | undefined> {
    const key = this.getScopedKey(CURRENT_TEST_FILE_KEY);
    return this.context.workspaceState.get<string>(key);
  }
  async removeCurrentTestFile(): Promise<void> {
    const key = this.getScopedKey(CURRENT_TEST_FILE_KEY);
    await this.context.workspaceState.update(key, undefined);
  }

  // --- Current Context ---
  async setCurrentContext(context: string): Promise<void> {
    const key = this.getScopedKey(CURRENT_CONTEXT_KEY);
    await this.context.workspaceState.update(key, context);
  }
  async getCurrentContext(): Promise<string | undefined> {
    const key = this.getScopedKey(CURRENT_CONTEXT_KEY);
    return this.context.workspaceState.get<string>(key);
  }
}
