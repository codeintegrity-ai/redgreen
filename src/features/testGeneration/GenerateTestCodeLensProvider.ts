import * as vscode from 'vscode';

const GENERATE_TEST_COMMAND = 'redgreen.generateTest';

// Common test file patterns (add more as needed)
const TEST_FILE_PATTERNS = [
  /(^|\/)test_.*\.(js|ts|py|java|go)$/i,
  /(^|\/).*_test\.(js|ts|py|java|go)$/i,
  /(^|\/).*\.spec\.(js|ts|py|java|go)$/i,
  /(^|\/).*\.test\.(js|ts|py|java|go)$/i,
  /(^|\/).*\.tests\.(js|ts|py|java|go)$/i,
  /(^|\/).*\.test\.ts$/i,
];

// Common test method patterns
const TEST_METHOD_PATTERNS = [/^test_/i, /_test$/i, /^should/i, /TestCase$/i];

// Additional patterns for methods that should not be tested
const NON_TESTABLE_METHOD_PATTERNS = [
  /^(get|set)[A-Z_]/, // getter/setter by naming convention (e.g., getName, set_value)
  /^_+/, // private/protected by underscore prefix (e.g., _private, __dunder__)
  /^#/, // private in JS/TS (e.g., #privateMethod)
  /^__.*__$/, // dunder methods (e.g., __init__, __str__)
];

function isTestFile(fileName: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function isTestMethod(methodName: string): boolean {
  return TEST_METHOD_PATTERNS.some((pattern) => pattern.test(methodName));
}

function isNonTestableMethod(methodName: string): boolean {
  return NON_TESTABLE_METHOD_PATTERNS.some((pattern) =>
    pattern.test(methodName),
  );
}

export default class GenerateTestCodeLensProvider
  implements vscode.CodeLensProvider
{
  public async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    if (isTestFile(document.fileName)) {
      return [];
    }
    const symbols = await vscode.commands.executeCommand<
      vscode.DocumentSymbol[]
    >('vscode.executeDocumentSymbolProvider', document.uri);
    if (!symbols) {
      return [];
    }
    return this.collectMethodSymbols(symbols, document);
  }

  private collectMethodSymbols(
    symbols: vscode.DocumentSymbol[],
    document: vscode.TextDocument,
  ): vscode.CodeLens[] {
    return symbols.flatMap((symbol) => {
      const codeLenses: vscode.CodeLens[] = [];
      if (symbol.kind === vscode.SymbolKind.Function) {
        const methodName = symbol.name;
        if (isTestMethod(methodName) || isNonTestableMethod(methodName)) {
          return [];
        }
        const methodCode = document.getText(symbol.range);
        codeLenses.push(
          new vscode.CodeLens(symbol.range, {
            title: '🛡️ Generate Test',
            command: GENERATE_TEST_COMMAND,
            arguments: [document.uri, methodName, methodCode],
          }),
        );
      } else if (symbol.kind === vscode.SymbolKind.Class && symbol.children) {
        // Only process direct children (methods) of the class
        symbol.children.forEach((child) => {
          if (child.kind === vscode.SymbolKind.Method) {
            const methodName = child.name;
            if (isTestMethod(methodName) || isNonTestableMethod(methodName)) {
              return;
            }
            const methodCode = document.getText(child.range);
            codeLenses.push(
              new vscode.CodeLens(child.range, {
                title: '🛡️ Generate Test',
                command: GENERATE_TEST_COMMAND,
                arguments: [document.uri, methodName, methodCode],
              }),
            );
          }
        });
      }
      // Do NOT recurse further
      return codeLenses;
    });
  }
}
