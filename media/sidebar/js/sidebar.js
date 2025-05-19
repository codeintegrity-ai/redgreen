// Sidebar JS loaded
console.log('Sidebar JS loaded');

// --- VS Code API ---
const vscode = acquireVsCodeApi();

// --- App State ---
// let currentApplicationState = {};

// --- DOM Helpers ---
function $(id) {
  return document.getElementById(id);
}
function setText(el, text) {
  if (el) el.textContent = text || '';
}
function setInput(el, value) {
  if (el) el.value = value || '';
}
function setChecked(el, checked) {
  if (el) el.checked = Boolean(checked);
}
function setClass(el, cls, add) {
  if (el) el.classList[add ? 'add' : 'remove'](cls);
}
function removeClasses(el, ...classes) {
  if (el) classes.forEach((cls) => el.classList.remove(cls));
}
function setDisabled(el, disabled) {
  if (el) el.disabled = Boolean(disabled);
}

// --- Constants for Message Types (mirror from common/types.ts) ---
const WebviewToExtensionMessageType = {
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
};

const ExtensionToWebviewMessageType = {
  STATE_UPDATE: 'STATE_UPDATE',
};

// --- UI Update Functions ---

function updateTestGenerationDisplay(genState) {
  if (!genState) return;
  const sourcePathEl = $('source-file-path');
  const testPathEl = $('test-file-path');
  if (sourcePathEl) {
    sourcePathEl.textContent = window.currentApplicationState.sourceFilePath;
    sourcePathEl.title = window.currentApplicationState.sourceFilePath;
  }
  if (testPathEl) {
    testPathEl.textContent = window.currentApplicationState.testFilePath;
    testPathEl.title = window.currentApplicationState.testFilePath;
  }
  setText($('test-gen-status'), genState.message || genState.status);
  removeClasses(
    $('test-gen-status'),
    'success',
    'error',
    'in_progress',
    'idle',
  );
  if (genState.status) setClass($('test-gen-status'), genState.status, true);
  setClass($('test-generation-status'), 'hidden', false);
}

function updateTestRunnerDisplay(runnerState, autofixState) {
  if (!runnerState) return;
  setInput($('test-command-input'), window.currentApplicationState.testCommand);
  setChecked($('watch-mode-checkbox'), runnerState.isWatchModeEnabled);
  const outputTextEl = $('test-output-text');
  const spinnerEl = $('test-output-loading-spinner');
  if (runnerState.status === 'RUNNING') {
    if (outputTextEl) {
      outputTextEl.style.opacity = '0';
      outputTextEl.style.pointerEvents = 'none';
    }
    if (spinnerEl) {
      spinnerEl.style.display = 'flex';
      spinnerEl.innerHTML = `<span class=\"autofix-spinner\" style=\"margin:auto;\"><svg width=\"48\" height=\"48\" viewBox=\"0 0 50 50\"><circle cx=\"25\" cy=\"25\" r=\"20\" fill=\"none\" stroke=\"#fff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-dasharray=\"31.4 31.4\" transform=\"rotate(-90 25 25)\"><animateTransform attributeName=\"transform\" type=\"rotate\" from=\"0 25 25\" to=\"360 25 25\" dur=\"1s\" repeatCount=\"indefinite\"/></circle></svg></span>`;
    }
  } else {
    if (outputTextEl) {
      outputTextEl.style.opacity = '';
      outputTextEl.style.pointerEvents = '';
      outputTextEl.textContent = runnerState.output || '';
    }
    if (spinnerEl) {
      spinnerEl.style.display = 'none';
      spinnerEl.innerHTML = '';
    }
  }
  const container = $('test-output-terminal');
  if (container && outputTextEl && runnerState.status !== 'RUNNING') {
    container.scrollTop = container.scrollHeight;
  }
  const testStatusBadge = $('test-status-badge');
  const autofixButton = $('autofix-button');
  if (testStatusBadge) {
    removeClasses(testStatusBadge, 'pass', 'fail', 'unknown', 'running');
    setText(testStatusBadge, runnerState.status);
    switch (runnerState.status) {
      case 'SUCCESS':
        setClass(testStatusBadge, 'pass', true);
        break;
      case 'FAIL':
        setClass(testStatusBadge, 'fail', true);
        break;
      case 'RUNNING':
        setClass(testStatusBadge, 'running', true);
        break;
      case 'ERROR':
      case 'NOT_RUN':
      default:
        setClass(testStatusBadge, 'unknown', true);
        break;
    }
  }
  if (autofixButton) {
    const canAutofix =
      runnerState.status === 'FAIL' || runnerState.status === 'ERROR';
    const autofixInProgress = autofixState?.status === 'in_progress';
    setClass(autofixButton, 'visible', canAutofix || autofixInProgress);
    setDisabled(autofixButton, !canAutofix || autofixInProgress);
    setClass(autofixButton, 'loading', autofixInProgress);
    setText(
      autofixButton.querySelector('.autofix-label'),
      autofixInProgress ? 'Fixing...' : 'Autofix',
    );
    // Spinner logic
    let spinner = autofixButton.querySelector('.autofix-spinner');
    if (autofixInProgress) {
      if (!spinner) {
        spinner = document.createElement('span');
        spinner.className = 'autofix-spinner';
        spinner.innerHTML = `<svg width="24" height="24" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.4 31.4" transform="rotate(-90 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></circle></svg>`;
        autofixButton.appendChild(spinner);
      }
    } else {
      if (spinner) spinner.remove();
    }
  }
}

function updateSettingsDisplay(newState) {
  if ($('api-provider') && newState.selectedModelProvider) {
    $('api-provider').value = newState.selectedModelProvider;
  }
  if ($('api-key')) {
    $('api-key').value = newState.isApiKeySet
      ? '******************************************************************'
      : '';
  }
}

function renderTestMappings(testMappings) {
  const mappingsTree = document.querySelector('.test-mappings-tree');
  if (!mappingsTree) return;
  mappingsTree.innerHTML = '';
  const mappings = testMappings || {};
  const mappingKeys = Object.keys(mappings);
  if (mappingKeys.length > 0) {
    let html = '';
    for (const [sourcePath, testPath] of Object.entries(mappings)) {
      html += `
                <div class="mapping-item" data-source-path="${sourcePath}" data-test-path="${testPath}">
                    <div class="source-file-row">
                        <span class="file-icon">📄</span>
                        <span class="file-name" title="${sourcePath}">${sourcePath}</span>
                        <span class="spacer"></span>
                        <button class="remove-mapping vscode-button" title="Remove mapping">✕</button>
                    </div>
                    <div class="test-file-row indented">
                        <span class="test-file-icon">🧪</span>
                        <span class="test-file" title="${testPath}" data-toggle="tooltip" data-tooltip="Click to edit test file path">${testPath}</span>
                    </div>
                </div>
            `;
    }
    mappingsTree.innerHTML = html;
  } else {
    mappingsTree.innerHTML = '<p>No test mappings configured yet.</p>';
  }
}

function updateUIFromApplicationState(newState) {
  if (!newState) return;
  window.currentApplicationState = newState;
  updateTestGenerationDisplay(newState.currentTestGeneration);
  updateTestRunnerDisplay(newState.testRunner, newState.currentAutofix);
  updateSettingsDisplay(newState);
  const mappings = newState.testMappings || {};
  renderTestMappings(mappings);
}

function initEventListeners() {
  // Settings
  const saveSettingsBtn = document.querySelector('.settings-save-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: WebviewToExtensionMessageType.SAVE_SETTINGS,
        payload: {
          selectedModelProvider: $('api-provider')?.value,
          apiKey: $('api-key')?.value,
        },
      });
    });
  }
  // Test Mappings
  document
    .querySelector('.test-mappings-tree')
    ?.addEventListener('click', (event) => {
      const target = event.target;
      if (target.classList.contains('remove-mapping')) {
        const mappingItem = target.closest('.mapping-item');
        const sourcePath = mappingItem?.getAttribute('data-source-path');
        if (sourcePath) {
          mappingItem.style.opacity = '0.5';
          mappingItem.style.pointerEvents = 'none';
          vscode.postMessage({
            type: WebviewToExtensionMessageType.REMOVE_MAPPING,
            payload: { sourcePath },
          });
        }
      }
    });
  // Test Runner
  const testCommandInput = $('test-command-input');
  if (testCommandInput) {
    testCommandInput.addEventListener('change', () => {
      vscode.postMessage({
        type: WebviewToExtensionMessageType.SET_TEST_COMMAND,
        payload: { command: testCommandInput.value.trim() },
      });
    });
  }
  const watchModeCheckbox = $('watch-mode-checkbox');
  if (watchModeCheckbox) {
    watchModeCheckbox.addEventListener('change', function () {
      vscode.postMessage({
        type: WebviewToExtensionMessageType.TOGGLE_WATCH_MODE,
        payload: { enabled: this.checked },
      });
    });
  }
  // Autofix button
  const autofixButton = $('autofix-button');
  if (autofixButton) {
    autofixButton.addEventListener('click', () => {
      if (autofixButton.disabled || autofixButton.classList.contains('loading'))
        return;
      const testCommand = window.currentApplicationState.testCommand || '';
      const sourcePath = window.currentApplicationState.sourceFilePath || '';
      const testPath = window.currentApplicationState.testFilePath || '';
      vscode.postMessage({
        type: WebviewToExtensionMessageType.RUN_AUTOFIX,
        payload: {
          sourcePath,
          testPath,
          testCommand,
        },
      });
    });
  }
}

function handleExtensionMessage(message) {
  const { type, payload } = message;
  switch (type) {
    case ExtensionToWebviewMessageType.STATE_UPDATE:
      updateUIFromApplicationState(payload);
      if (payload && payload.currentPage) {
        showPage(payload.currentPage);
      }
      break;
    default:
      console.warn('Received unknown message type from extension:', type);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initEventListeners();
  vscode.postMessage({ type: WebviewToExtensionMessageType.GET_INITIAL_STATE });

  // Copy Error button logic
  const copyErrorBtn = document.getElementById('copy-error-button');
  if (copyErrorBtn) {
    copyErrorBtn.addEventListener('click', function () {
      const state = window.currentApplicationState || {};
      console.log('STATE: ', state);
      const sourceFile = state.sourceFilePath || '';
      const testFile = state.testFilePath || '';
      const error =
        state.testRunner &&
        (state.testRunner.status === 'FAIL' ||
          state.testRunner.status === 'ERROR')
          ? state.testRunner.output || ''
          : '';
      const md = `source file: ${sourceFile}\ntest file: ${testFile}\n\nError:\n\n\
${error}`;
      navigator.clipboard.writeText(md).then(() => {
        copyErrorBtn.textContent = 'Copied!';
        setTimeout(() => (copyErrorBtn.textContent = 'Copy'), 1200);
      });
    });
  }
});

window.addEventListener('message', (e) => handleExtensionMessage(e.data));

function showPage(pageId) {
  const pages = document.querySelectorAll('.page');
  pages.forEach((pageElement) => {
    pageElement.classList.remove('active');
  });
  const activePageElementId = pageId + '-page';
  const activePage = document.getElementById(activePageElementId);
  if (activePage) {
    activePage.classList.add('active');
  }
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach((link) => {
    link.classList.remove('active');
    if (link.getAttribute('data-page') === pageId) {
      link.classList.add('active');
    }
  });
}
