import * as vscode from 'vscode';
import { Sidebar } from '../features/sidebar/Sidebar';

export function registerSidebarTitleCommands(
  context: vscode.ExtensionContext,
  sidebarProvider: Sidebar,
): void {
  // Register Home and Settings commands for the sidebar title bar
  context.subscriptions.push(
    vscode.commands.registerCommand('redgreen.home', () => {
      if (sidebarProvider) {
        sidebarProvider.navigateToPage('home');
      }
    }),
    vscode.commands.registerCommand('redgreen.settings', () => {
      if (sidebarProvider) {
        sidebarProvider.navigateToPage('settings');
      }
    }),
  );
}
