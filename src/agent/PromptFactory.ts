import * as nunjucks from 'nunjucks';
import * as path from 'path';

// Strict input types for each template
export interface DiscoverTestFilePathPrompt {
  source_file_path: string;
  root_dir: string;
  language: string;
  directoryTree: string;
}

export interface TestGenUserPrompt {
  context: string;
  directoryTree: string;
  methodName: string;
  sourceFilePath: string;
  sourceFileContent: string;
  testFilePath: string;
  testFileContent: string;
  methodCode: string;
  language: string;
  rootDir: string;
}

export interface CodexAutofixOnFailPrompt {
  context: string;
  language: string;
  directoryTree: string;
  rootDir: string;
  sourceFilePath: string;
  sourceCode: string;
  testFilePath: string;
  testCode: string;
  errorOutput: string;
}

export interface CodexAutofixOnErrorPrompt {
  context: string;
  testCommand: string;
  language: string;
  directoryTree: string;
  rootDir: string;
  sourceFilePath: string;
  sourceCode: string;
  testFilePath: string;
  testCode: string;
  errorOutput: string;
  testStatus: string;
}

export class PromptFactory {
  private static getTemplatesDir(extensionRoot: string): string {
    return path.join(extensionRoot, 'templates');
  }

  private static getEnv(extensionRoot: string): nunjucks.Environment {
    return nunjucks.configure(PromptFactory.getTemplatesDir(extensionRoot), {
      autoescape: false,
    });
  }

  public static renderDiscoverTestFilePathPrompt(
    extensionRoot: string,
    input: DiscoverTestFilePathPrompt,
  ): string {
    return PromptFactory.getEnv(extensionRoot).render(
      'discover_test_file_path.jinja2',
      input,
    );
  }

  public static renderTestGenSystemPrompt(
    extensionRoot: string,
  ): string {
    return PromptFactory.getEnv(extensionRoot).render('testgen_system.jinja2');
  }

  public static async renderTestGenUserPrompt(
    extensionRoot: string,
    input: TestGenUserPrompt,
  ): Promise<string> {
    return PromptFactory.getEnv(extensionRoot).render('testgen_user.jinja2', input);
  }


  public static renderCodexAutofixOnFailPrompt(
    extensionRoot: string,
    input: CodexAutofixOnFailPrompt,
  ): string {
    return PromptFactory.getEnv(extensionRoot).render(
      'codex_autofix_on_fail.jinja2',
      input,
    );
  }

  public static renderCodexAutofixOnErrorPrompt(
    extensionRoot: string,
    input: CodexAutofixOnErrorPrompt,
  ): string {
    return PromptFactory.getEnv(extensionRoot).render(
      'codex_autofix_on_error.jinja2',
      input,
    );
  }
}
