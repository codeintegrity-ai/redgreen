// Types from StateController.ts
export interface TestMapping {
  [sourceFilePath: string]: string;
}

export type OperationStatus = 'idle' | 'in_progress' | 'success' | 'error';

export const initialTestGenerationState: TestGenerationState = {
  status: 'idle',
  message: '',
};

export interface TestGenerationState {
  status: OperationStatus;
  message?: string; // For progress messages or error details
}

export const initialAutofixState: AutofixState = {
  status: 'idle',
  message: '',
};

export interface AutofixState {
  status: OperationStatus;
  message?: string; // For progress messages or error details
}

export enum TestRunStatus {
  NOT_RUN = 'NOT_RUN',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAIL = 'FAIL',
  ERROR = 'ERROR',
}

export interface TestRunnerState {
  status: TestRunStatus;
  isWatchModeEnabled: boolean;
  output: string;
}

export const initialTestRunnerState: TestRunnerState = {
  status: TestRunStatus.NOT_RUN,
  isWatchModeEnabled: false,
  output: '',
};

export const initialApplicationState: ApplicationState = {
  sourceFilePath: '',
  testFilePath: '',
  testCommand: '',
  testMappings: {},
  currentTestGeneration: { ...initialTestGenerationState },
  currentAutofix: { ...initialAutofixState },
  testRunner: { ...initialTestRunnerState },
  selectedModelProvider: 'openai',
  isApiKeySet: false,
  currentPage: 'home',
};

export interface ApplicationState {
  sourceFilePath: string;
  testFilePath: string;
  testCommand: string;
  testMappings: TestMapping;
  currentTestGeneration: TestGenerationState;
  currentAutofix: AutofixState;
  testRunner: TestRunnerState;
  selectedModelProvider: string;
  isApiKeySet: boolean;
  currentPage: SidebarPage;
}

// Types from Sidebar.ts
export type SidebarPage = 'home' | 'settings';

// --- Webview Message Payloads & Types ---

// Payloads for messages from Webview to Extension
export interface GetInitialStatePayload {}
export interface NavigatePagePayload {
  page: SidebarPage;
}
export interface RunTestGenerationPayload {
  sourceFilePath: string;
  methodName: string;
  methodCode: string;
}
export interface RunAutofixPayload {
  sourcePath: string;
  testPath: string;
  testOutput: string;
  testCommand: string;
}
export interface SetTestCommandPayload {
  command: string;
}
export interface ToggleWatchModePayload {
  enabled: boolean;
}
export interface RunTestPayload {}
export interface StopTestPayload {}

// Discriminated Union for messages from Webview to Extension
export type WebviewToExtensionMessage =
  | {
      type: typeof WebviewToExtensionMessageType.GET_INITIAL_STATE;
      payload: GetInitialStatePayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.NAVIGATE_PAGE;
      payload: NavigatePagePayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.RUN_TEST_GENERATION;
      payload: RunTestGenerationPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.RUN_AUTOFIX;
      payload: RunAutofixPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.SET_TEST_COMMAND;
      payload: SetTestCommandPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.TOGGLE_WATCH_MODE;
      payload: ToggleWatchModePayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.RUN_TEST;
      payload: RunTestPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.STOP_TEST;
      payload: StopTestPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.SAVE_SETTINGS;
      payload: SaveSettingsPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.REMOVE_MAPPING;
      payload: RemoveMappingPayload;
    }
  | {
      type: typeof WebviewToExtensionMessageType.UPDATE_MAPPING;
      payload: UpdateMappingPayload;
    };

// Payloads for messages from Extension to Webview
export interface StateUpdateMessagePayload extends ApplicationState {}

// Discriminated Union for messages from Extension to Webview
export type ExtensionToWebviewMessage = {
  type: typeof ExtensionToWebviewMessageType.STATE_UPDATE;
  payload: StateUpdateMessagePayload;
};

export const WebviewToExtensionMessageType = {
  GET_INITIAL_STATE: 'GET_INITIAL_STATE',
  NAVIGATE_PAGE: 'NAVIGATE_PAGE',
  RUN_TEST_GENERATION: 'RUN_TEST_GENERATION',
  RUN_AUTOFIX: 'RUN_AUTOFIX',
  SET_TEST_COMMAND: 'SET_TEST_COMMAND',
  TOGGLE_WATCH_MODE: 'TOGGLE_WATCH_MODE',
  RUN_TEST: 'RUN_TEST',
  STOP_TEST: 'STOP_TEST',
  SAVE_SETTINGS: 'SAVE_SETTINGS',
  REMOVE_MAPPING: 'REMOVE_MAPPING',
  UPDATE_MAPPING: 'UPDATE_MAPPING',
} as const;
export type WebviewToExtensionMessageType =
  (typeof WebviewToExtensionMessageType)[keyof typeof WebviewToExtensionMessageType];

// Define payload for SAVE_SETTINGS
export interface SaveSettingsPayload {
  selectedModelProvider?: string;
  apiKey?: string; // apiKey is sent, extension decides to store it
}

// Define payload for REMOVE_MAPPING
export interface RemoveMappingPayload {
  sourcePath: string;
}

// Define payload for UPDATE_MAPPING
export interface UpdateMappingPayload {
  sourcePath: string;
  testPath: string;
}

export const ExtensionToWebviewMessageType = {
  STATE_UPDATE: 'STATE_UPDATE',
} as const;
export type ExtensionToWebviewMessageType =
  (typeof ExtensionToWebviewMessageType)[keyof typeof ExtensionToWebviewMessageType];
