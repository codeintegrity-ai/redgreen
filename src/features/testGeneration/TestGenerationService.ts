import { CodexAgent } from '../../agent/CodexAgent'; // Updated path
import { PromptFactory } from '../../agent/PromptFactory'; // Updated path
import { OpenAIAgent } from '../../agent/OpenAIAgent'; // Updated path
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {  getLanguageFromExtension } from '../../common/utils'; // Updated path
import { existsSync } from 'fs';
import { TestRunStatus } from '../../common/types';
import * as fs from 'fs';

export interface TestFilePathOption {
  type: 'extend' | 'new';
  description: string;
  filePath?: string;
}

export interface AutofixTestsParams {
  context: string;
  sourceFilePath: string;
  testFilePath: string;
  testOutput: string;
  testCommand: string;
  directoryTree: string;
  testStatus: TestRunStatus;
  onCodexMessage: (msg: string) => void;
}

export class TestGenerationService {
  private readonly codexAgent: CodexAgent;
  private readonly openaiAgent: OpenAIAgent;
  private readonly extensionRoot: string;
  private readonly workspaceRoot: string;

  constructor(
    extensionRoot: string,
    workspaceRoot: string,
    codexAgent: CodexAgent,
    openaiAgent: OpenAIAgent,
  ) {
    this.extensionRoot = extensionRoot;
    this.workspaceRoot = workspaceRoot;
    this.codexAgent = codexAgent;
    this.openaiAgent = openaiAgent;
  }

  private isValidTestFilePath(
    codexOutput: string,
    workspaceRoot: string,
    sourceFilePath: string,
  ): boolean {
    const normalizedRoot = workspaceRoot.endsWith('/')
      ? workspaceRoot
      : workspaceRoot + '/';
    const outputPath = codexOutput.trim().split(/\r?\n/)[0];
    if (!outputPath.startsWith(normalizedRoot)) {
      return false;
    }
    const sourceExt = sourceFilePath.split('.').pop();
    const outputExt = outputPath.split('.').pop();
    if (!sourceExt || !outputExt || sourceExt !== outputExt) {
      return false;
    }
    return true;
  }

  public async generateAITestCode({
    context,
    sourceFilePath,
    testFilePath,
    methodName,
    methodCode,
    directoryTree,
  }:{
    context: string,
    sourceFilePath: string,
    testFilePath: string,
    methodName: string,
    methodCode: string,
    directoryTree: string,
  }): Promise<string> {
    const language = getLanguageFromExtension(sourceFilePath);
    const absSourceFilePath = path.join(this.workspaceRoot, sourceFilePath);
    const absTestFilePath = path.join(this.workspaceRoot, testFilePath);
    if (!existsSync(absSourceFilePath)) {
      throw new Error('Source file does not exist: ' + sourceFilePath);
    }
    const fullFileContent = await fsPromises.readFile(
      absSourceFilePath,
      'utf-8',
    );
    const testFileContent = await fsPromises.readFile(absTestFilePath, 'utf-8');

    const systemPrompt = PromptFactory.renderTestGenSystemPrompt(this.extensionRoot);
    const userPrompt = await PromptFactory.renderTestGenUserPrompt(this.extensionRoot, {
      context: context,
      directoryTree: directoryTree,
      methodName: methodName, 
      sourceFilePath: sourceFilePath,
      sourceFileContent: fullFileContent,
      language: language,
      rootDir: this.workspaceRoot,
      testFilePath: testFilePath,
      testFileContent: testFileContent,
      methodCode: methodCode,
    });

    const response = await this.openaiAgent.complete(systemPrompt, userPrompt);
    if (response.status !== 'completed') {
      throw new Error('OpenAI failed: ' + response.content);
    }
    const testCode = this.extractLargestCodeBlock(response.content);
    if (testCode.length === 0) {
      throw new Error('No test code found in response');
    }
    return testCode;
  }

  public async autofixTests(params: AutofixTestsParams): Promise<void> {
    const {
      context,
      sourceFilePath,
      testFilePath,
      testOutput,
      testCommand,
      directoryTree,
      testStatus,
      onCodexMessage,
    } = params;
    const absSourceFilePath = path.join(this.workspaceRoot, sourceFilePath);
    const absTestFilePath = path.join(this.workspaceRoot, testFilePath);
    if (!existsSync(absSourceFilePath)) {
      throw new Error('Source file does not exist: ' + sourceFilePath);
    }
    if (!existsSync(absTestFilePath)) {
      throw new Error('Test file does not exist: ' + testFilePath);
    }
    const fullFileContent = await fsPromises.readFile(
      absSourceFilePath,
      'utf-8',
    );
    const testFileContent = await fsPromises.readFile(absTestFilePath, 'utf-8');
    let prompt = '';
    const language = getLanguageFromExtension(sourceFilePath);
    if (testStatus === TestRunStatus.FAIL) {
      prompt = PromptFactory.renderCodexAutofixOnFailPrompt(
        this.extensionRoot,
        {
          context: context,
          directoryTree: directoryTree,
          language: language,
          rootDir: this.workspaceRoot,
          sourceFilePath: sourceFilePath,
          sourceCode: fullFileContent,
          testFilePath: testFilePath,
          testCode: testFileContent,
          errorOutput: testOutput,
        },
      );
    } else if (testStatus === TestRunStatus.ERROR) {
      prompt = PromptFactory.renderCodexAutofixOnErrorPrompt(
        this.extensionRoot,
        {
          context: context,
          testCommand: testCommand,
          language: language,
          directoryTree: directoryTree,
          rootDir: this.workspaceRoot,
          sourceFilePath: sourceFilePath,
          sourceCode: fullFileContent,
          testFilePath: testFilePath,
          testCode: testFileContent,
          errorOutput: testOutput,
          testStatus: testStatus,
        },
      );
    } else {
      throw new Error('Test status is not FAIL or ERROR');
    }
    // call codex agent
    await this.codexAgent.stream(
      prompt,
      (msg) => {
        onCodexMessage(msg);
      },
      {
        model: 'gpt-4.1-2025-04-14',
      },
    );
  }

  private extractLargestCodeBlock(text: string): string {
    const codeBlockRegex = /```[\s\S]*?\n([\s\S]*?)\n```/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      matches.push(match[1]);
    }
    if (matches.length === 0) {
      return '';
    }
    return matches.reduce((a, b) => (a.length >= b.length ? a : b));
  }

  async getTestFilePathOptions(
    sourceFilePath: string,
    existingTestFilePath: string | undefined,
  ): Promise<TestFilePathOption[]> {
    const options: TestFilePathOption[] = [];
    if (existingTestFilePath) {
      options.push({
        type: 'extend',
        description: 'Extend Existing Test File',
        filePath: existingTestFilePath,
      });
    }
    options.push({
      type: 'new',
      description: 'Create New Test File',
    });
    return options;
  }

  /**
   * Heuristic-based test file path generator. Always returns the most likely absolute test file path for the language.
   * Only returns undefined for unsupported languages.
   */
  public getHeuristicTestFilePath(sourceFilePath: string): string {
    const ext = path.extname(sourceFilePath);
    const language = getLanguageFromExtension(sourceFilePath);
    const basename = path.basename(sourceFilePath, ext);

    // Common test directories to check (in order of preference)
    const testDirs = [
      'test',
      'tests',
      path.join('src', 'test'),
      path.join('src', 'tests'),
    ];
    let chosenTestDir = testDirs.find(dir => fs.existsSync(path.join(this.workspaceRoot, dir)));
    if (!chosenTestDir) {
      chosenTestDir = testDirs[0];
    }

    switch (language) {
      case 'python': {
        // Mirror the structure under the test dir, strip leading 'src/' if present
        let srcRelativeDir = path.dirname(sourceFilePath);
        if (srcRelativeDir.startsWith('src/')) {
          srcRelativeDir = srcRelativeDir.substring(4);
        } else if (srcRelativeDir.startsWith('src\\')) { // Windows
          srcRelativeDir = srcRelativeDir.substring(4);
        }
        const testFileName = `test_${basename}${ext}`;
        if (srcRelativeDir && srcRelativeDir !== '.') {
          return path.join(this.workspaceRoot, chosenTestDir, srcRelativeDir, testFileName);
        }
        return path.join(this.workspaceRoot, chosenTestDir, testFileName);
      }
      case 'javascript':
      case 'typescript': {
        // Mirror the structure under the test dir
        const srcRelativeDir = path.dirname(sourceFilePath);
        const testFileName = `${basename}.test${ext}`;
        if (srcRelativeDir && srcRelativeDir !== '.') {
          return path.join(this.workspaceRoot, chosenTestDir, srcRelativeDir, testFileName);
        }
        return path.join(this.workspaceRoot, chosenTestDir, testFileName);
      }
      case 'go': {
        // Place next to the source file
        const srcDir = path.dirname(sourceFilePath);
        const testFileName = `${basename}_test${ext}`;
        return path.join(this.workspaceRoot, srcDir, testFileName);
      }
      case 'java': {
        // Mirror the structure from src/main/java to src/test/java, or from src/ to src/test/java
        let srcRelativePath = sourceFilePath;
        if (srcRelativePath.startsWith('src/main/java/')) {
          srcRelativePath = srcRelativePath.substring('src/main/java/'.length);
        } else if (srcRelativePath.startsWith('src/')) {
          srcRelativePath = srcRelativePath.substring('src/'.length);
        }
        const srcRelativeDir = path.dirname(srcRelativePath);
        const testFileName = `${basename}Test${ext}`;
        return path.join(this.workspaceRoot, 'src', 'test', 'java', srcRelativeDir, testFileName);
      }
      default:
        // Default: create tests/test_<basename><ext> in the workspace root
        const testFileName = `test_${basename}${ext}`;
        return path.join(this.workspaceRoot, 'tests', testFileName);
    }
  }

  async createNewTestFilePath(sourceFilePath: string): Promise<string> {
    // Try heuristic first
    console.log('sourceFilePath', sourceFilePath);
    console.log('workspaceRoot', this.workspaceRoot);
    const heuristicPath = this.getHeuristicTestFilePath(sourceFilePath);
    console.log('heuristicPath', heuristicPath);
    return heuristicPath;

    // NOTE: Externally-used fallback to AI
    // const ext = path.extname(sourceFilePath);
    // const directoryTree = listFilesTree(this.workspaceRoot, ext);
    // const language = getLanguageFromExtension(sourceFilePath);
    // const prompt = PromptFactory.renderDiscoverTestFilePathPrompt(
    //   this.extensionRoot,
    //   {
    //     source_file_path: sourceFilePath,
    //     root_dir: this.workspaceRoot,
    //     language,
    //     directoryTree,
    //   },
    // );
    // const codexOutput = await this.codexAgent.run(prompt);
    // const prefix = 'TEST_FILE_PATH: ';
    // if (!codexOutput.startsWith(prefix)) {
    //   throw new Error('Codex did not return a valid test file path');
    // }
    // const testFilePath = codexOutput.split(prefix)[1].trim();
    // if (
    //   !this.isValidTestFilePath(
    //     testFilePath,
    //     this.workspaceRoot,
    //     sourceFilePath,
    //   )
    // ) {
    //   throw new Error('Is not a valid test file path');
    // }
    // return testFilePath;
  }
}
