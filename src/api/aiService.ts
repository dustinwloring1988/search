/**
 * AI Service for natural language processing and ollama API integration
 */

import * as electronLog from 'electron-log';
import { OllamaClient, OllamaAPIError, OllamaNetworkError } from './ollamaClient';
import { OllamaChatMessage, OllamaChatResponse } from '../types/ollama';

// Logger for AI service
const logger = electronLog.create({ logId: 'aiService' });

/**
 * Response type for AI queries including structured data
 */
export interface AIQueryResponse {
  text: string;
  structuredOutput?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  error?: string;
}

/**
 * Tool call representation from AI response
 */
export interface ToolCall {
  name: string;
  parameters: Record<string, unknown>;
}

/**
 * Streaming response callback types
 */
export type OnTextUpdate = (text: string) => void;
export type OnStructuredOutputUpdate = (structuredOutput: Record<string, unknown>) => void;
export type OnToolCallsUpdate = (toolCalls: ToolCall[]) => void;
export type OnComplete = (response: AIQueryResponse) => void;
export type OnError = (error: Error) => void;

/**
 * Service class for handling AI interactions
 */
export class AIService {
  private client: OllamaClient;
  private systemPrompt: string;

  /**
   * Creates a new AI service
   */
  constructor() {
    this.client = new OllamaClient();
    this.systemPrompt = `You are an AI assistant that can help users automate browser tasks. 
You can analyze natural language requests and convert them into structured commands.
When you identify an action that should be performed in a browser, respond with JSON 
formatted output that specifies the browser actions to take.

For browser automation commands, your response should be valid JSON with this structure:
{
  "browser_actions": [
    {
      "action": "navigate" | "click" | "type" | "select" | "screenshot" | "wait" | "extract",
      "parameters": {
        // Parameters specific to the action type
      }
    }
  ],
  "explanation": "Human-readable explanation of what these actions will accomplish"
}

Example actions:
1. Navigate: { "action": "navigate", "parameters": { "url": "https://example.com" } }
2. Click: { "action": "click", "parameters": { "selector": ".button-class" } }
3. Type: { "action": "type", "parameters": { "selector": "#input-id", "text": "Hello world" } }
4. Select: { "action": "select", "parameters": { "selector": "#dropdown", "value": "option1" } }
5. Screenshot: { "action": "screenshot", "parameters": { "filename": "screenshot.png" } }
6. Wait: { "action": "wait", "parameters": { "milliseconds": 1000 } }
7. Extract: { "action": "extract", "parameters": { "selector": ".results", "attribute": "textContent" } }

For non-automation requests, respond conversationally without the JSON structure.`;

    logger.info('AI Service initialized');
  }

  /**
   * Extracts structured data from the AI response if present
   * @param response The AI response text
   * @returns Structured data if found, otherwise undefined
   */
  private extractStructuredData(response: string): Record<string, unknown> | undefined {
    try {
      // Look for JSON in the response
      const jsonMatch = response.match(/```json([\s\S]*?)```|{[\s\S]*}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] ? jsonMatch[1].trim() : jsonMatch[0].trim();
        return JSON.parse(jsonStr);
      }
    } catch (error) {
      logger.warn('Failed to extract structured data from response:', error);
    }
    return undefined;
  }

  /**
   * Extracts tool calls from structured data
   * @param structuredData The structured data from the AI response
   * @returns Array of tool calls if found, otherwise undefined
   */
  private extractToolCalls(structuredData: Record<string, unknown>): ToolCall[] | undefined {
    if (
      structuredData &&
      'browser_actions' in structuredData &&
      Array.isArray(structuredData.browser_actions)
    ) {
      return structuredData.browser_actions.map(action => ({
        name: action.action as string,
        parameters: action.parameters as Record<string, unknown>,
      }));
    }
    return undefined;
  }

  /**
   * Preprocesses the user query for better AI understanding
   * @param query The user's natural language query
   * @returns Preprocessed query
   */
  private preprocessQuery(query: string): string {
    // Remove leading/trailing whitespace
    let processedQuery = query.trim();

    // Convert common URL shorthand to full URLs if not already formatted
    if (/^[\w-]+(\.[\w-]+)+$/.test(processedQuery)) {
      processedQuery = `https://${processedQuery}`;
    }

    // Add context if it seems like a browser instruction without explicit action
    if (
      processedQuery.startsWith('http') &&
      !processedQuery.toLowerCase().includes('go to') &&
      !processedQuery.toLowerCase().includes('navigate')
    ) {
      processedQuery = `Navigate to ${processedQuery}`;
    }

    logger.debug('Preprocessed query:', processedQuery);
    return processedQuery;
  }

  /**
   * Queries the AI with a natural language question (non-streaming)
   * @param query The user's natural language query
   * @returns AI response with text and optional structured data
   */
  public async query(query: string): Promise<AIQueryResponse> {
    try {
      const processedQuery = this.preprocessQuery(query);

      const messages: OllamaChatMessage[] = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: processedQuery },
      ];

      logger.info('Sending AI query:', processedQuery);
      const response = await this.client.chat({
        model: this.client.defaultModel,
        messages,
        format: 'json',
      });

      const responseText = response.message.content;
      const structuredOutput = this.extractStructuredData(responseText);
      const toolCalls = structuredOutput ? this.extractToolCalls(structuredOutput) : undefined;

      logger.info('AI query completed', {
        hasStructuredData: !!structuredOutput,
        hasToolCalls: !!toolCalls,
      });

      return {
        text: responseText,
        structuredOutput,
        toolCalls,
      };
    } catch (error) {
      logger.error('AI query failed:', error);

      if (error instanceof OllamaAPIError || error instanceof OllamaNetworkError) {
        return {
          text: 'I encountered an error communicating with my AI backend.',
          error: error.message,
        };
      }

      return {
        text: 'I encountered an unexpected error.',
        error: (error as Error).message,
      };
    }
  }

  /**
   * Queries the AI with a natural language question (streaming)
   * @param query The user's natural language query
   * @param callbacks Callbacks for streaming updates
   * @returns Cleanup function to cancel the stream
   */
  public async queryStream(
    query: string,
    callbacks: {
      onTextUpdate?: OnTextUpdate;
      onStructuredOutputUpdate?: OnStructuredOutputUpdate;
      onToolCallsUpdate?: OnToolCallsUpdate;
      onComplete?: OnComplete;
      onError?: OnError;
    }
  ): Promise<() => void> {
    try {
      const processedQuery = this.preprocessQuery(query);

      const messages: OllamaChatMessage[] = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: processedQuery },
      ];

      logger.info('Sending streaming AI query:', processedQuery);

      let fullResponse = '';

      const cancelStream = await this.client.chatStream(
        {
          model: this.client.defaultModel,
          messages,
          format: 'json',
        },
        (chunk: OllamaChatResponse) => {
          if (chunk.message && chunk.message.content) {
            const newText = chunk.message.content;
            fullResponse += newText;

            if (callbacks.onTextUpdate) {
              callbacks.onTextUpdate(fullResponse);
            }

            // Try to extract structured data as it comes in
            const structuredOutput = this.extractStructuredData(fullResponse);
            if (structuredOutput && callbacks.onStructuredOutputUpdate) {
              callbacks.onStructuredOutputUpdate(structuredOutput);

              // If we have tool calls, update those too
              const toolCalls = this.extractToolCalls(structuredOutput);
              if (toolCalls && callbacks.onToolCallsUpdate) {
                callbacks.onToolCallsUpdate(toolCalls);
              }
            }
          }
        },
        () => {
          // Stream completed
          const structuredOutput = this.extractStructuredData(fullResponse);
          const toolCalls = structuredOutput ? this.extractToolCalls(structuredOutput) : undefined;

          logger.info('AI streaming query completed', {
            hasStructuredData: !!structuredOutput,
            hasToolCalls: !!toolCalls,
          });

          if (callbacks.onComplete) {
            callbacks.onComplete({
              text: fullResponse,
              structuredOutput,
              toolCalls,
            });
          }
        }
      );

      return cancelStream;
    } catch (error) {
      logger.error('AI streaming query failed:', error);

      if (callbacks.onError) {
        callbacks.onError(error as Error);
      }

      if (callbacks.onComplete) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        callbacks.onComplete({
          text: 'I encountered an error communicating with my AI backend.',
          error: errorMessage,
        });
      }

      // Return a no-op cleanup function
      return () => {
        // Nothing to clean up
      };
    }
  }
}
