import OpenAI from 'openai';
import * as vscode from 'vscode';

export interface OpenAIOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface OpenAIResponse {
  type: 'message';
  status: 'completed' | 'error';
  content: string;
}

export class OpenAIAgent {
  private readonly defaultModel: string = 'gpt-4.1-2025-04-14';
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  public async complete(
    systemPrompt: string,
    userPrompt: string,
    options: OpenAIOptions = {},
  ): Promise<OpenAIResponse> {
    // get openai from secrets
    const apiKey = await this.context.secrets.get('redgreen_apiKey');
    if (!apiKey) {
      throw Error('OpenAPI Key not configured!');
    }
    try {
      const client = new OpenAI({
        apiKey: apiKey,
      });
      const response = await client.chat.completions.create({
        model: options.model || this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      });
      const content = response.choices[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('No content returned from OpenAI');
      }
      return {
        type: 'message',
        status: 'completed',
        content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        type: 'message',
        status: 'error',
        content: message,
      };
    }
  }
}
