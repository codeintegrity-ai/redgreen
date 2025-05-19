import * as vscode from 'vscode';
import {
  ApplicationState,
  initialApplicationState, // Import the initial state
} from '../common/types'; // Path relative to src/core/

export class StateController {
  private _state: ApplicationState;
  private readonly _onDidChangeState =
    new vscode.EventEmitter<ApplicationState>();

  public readonly onDidChangeState: vscode.Event<ApplicationState> =
    this._onDidChangeState.event;

  constructor(initialOverrides: Partial<ApplicationState> = {}) {
    // Start with the defined initial state and shallow merge any overrides
    this._state = { ...initialApplicationState, ...initialOverrides };
  }

  public get state(): ApplicationState {
    // Return a deep copy to prevent external modification
    return JSON.parse(JSON.stringify(this._state));
  }

  public updateState(newStatePartial: Partial<ApplicationState>): void {
    const oldStateJson = JSON.stringify(this._state);
    // Shallow merge the new partial state into the current state
    this._state = { ...this._state, ...newStatePartial };

    if (oldStateJson !== JSON.stringify(this._state)) {
      // Fire with a deep copy of the new state
      this._onDidChangeState.fire(JSON.parse(JSON.stringify(this._state)));
    }
  }

  public dispose(): void {
    this._onDidChangeState.dispose();
  }
}
