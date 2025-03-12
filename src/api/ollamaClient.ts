/**
 * Client module for interacting with the ollama API
 * Implements both streaming and non-streaming endpoints
 */

import * as electronLog from 'electron-log';
import config from '../config';
import {
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaListModelsResponse,
  OllamaErrorResponse,
} from '../types/ollama';

// Logger for API calls
const logger = electronLog.create({ logId: 'ollamaClient' });

/**
 * Type guard to check if a response is an error
 */
function isErrorResponse(response: unknown): response is OllamaErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as OllamaErrorResponse).error === 'string'
  );
}

/**
 * Base error class for ollama API errors
 */
export class OllamaAPIError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'OllamaAPIError';
  }
}

/**
 * Error class for network or timeout errors
 */
export class OllamaNetworkError extends OllamaAPIError {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'OllamaNetworkError';
  }
}

/**
 * Client class for interacting with the ollama API
 */
export class OllamaClient {
  private readonly baseUrl: string;
  public readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  /**
   * Creates a new ollama API client
   */
  constructor() {
    this.baseUrl = config.ollama.apiUrl;
    this.defaultModel = config.ollama.model;
    this.timeoutMs = config.ollama.timeoutMs;
    this.retryAttempts = config.ollama.retryAttempts;
    this.retryDelayMs = config.ollama.retryDelayMs;

    logger.info(`Initialized ollama client with base URL: ${this.baseUrl}`);
  }

  /**
   * Makes a POST request to the specified endpoint
   * @param endpoint The API endpoint to call
   * @param data Request payload
   * @returns API response
   */
  private async post<TRequest, TResponse>(endpoint: string, data: TRequest): Promise<TResponse> {
    const url = `${this.baseUrl}/${endpoint}`;
    let attempt = 0;

    while (attempt < this.retryAttempts) {
      attempt++;
      try {
        logger.debug(`POST ${url} (attempt ${attempt}/${this.retryAttempts})`, data);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text();
          logger.error(`API error [${response.status}]: ${text}`);
          throw new OllamaAPIError(`API error: ${text}`, response.status);
        }

        const result = await response.json();

        if (isErrorResponse(result)) {
          logger.error(`API returned error: ${result.error}`);
          throw new OllamaAPIError(`API returned error: ${result.error}`);
        }

        return result as TResponse;
      } catch (error) {
        // If this is the last attempt, rethrow the error
        if (attempt >= this.retryAttempts) {
          if (error instanceof OllamaAPIError) {
            throw error;
          } else {
            logger.error('Network error:', error);
            throw new OllamaNetworkError(
              `Network error: ${(error as Error).message}`,
              error as Error
            );
          }
        }

        // Otherwise, wait and retry
        logger.warn(`Request failed, retrying in ${this.retryDelayMs}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, this.retryDelayMs));
      }
    }

    // This should never happen due to the rethrowing above
    throw new OllamaAPIError('Maximum retry attempts reached');
  }

  /**
   * Streams a POST request to the specified endpoint
   * @param endpoint The API endpoint to call
   * @param data Request payload
   * @param onChunk Callback for each chunk of the response
   * @param onDone Callback when streaming is complete
   * @returns Cleanup function to cancel the request
   */
  private async stream<TRequest, TResponse extends { done: boolean }>(
    endpoint: string,
    data: TRequest,
    onChunk: (chunk: TResponse) => void,
    onDone?: () => void
  ): Promise<() => void> {
    const url = `${this.baseUrl}/${endpoint}`;
    const controller = new AbortController();

    logger.debug(`Streaming POST ${url}`, data);

    (async (): Promise<void> => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          logger.error(`API error [${response.status}]: ${text}`);
          throw new OllamaAPIError(`API error: ${text}`, response.status);
        }

        if (!response.body) {
          throw new OllamaAPIError('Response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!reader.closed) {
          const { done, value } = await reader.read();

          if (done) {
            // Process any remaining data in the buffer
            if (buffer.trim()) {
              try {
                const chunk = JSON.parse(buffer) as TResponse;
                onChunk(chunk);
              } catch (e) {
                logger.error('Error parsing JSON from buffer:', buffer, e);
              }
            }

            if (onDone) {
              onDone();
            }

            break;
          }

          // Add new data to the buffer
          buffer += decoder.decode(value, { stream: true });

          // Process complete JSON objects from the buffer
          let newlineIndex;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (line) {
              try {
                const chunk = JSON.parse(line) as TResponse;
                onChunk(chunk);
              } catch (e) {
                logger.error('Error parsing JSON:', line, e);
              }
            }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error instanceof OllamaAPIError) {
            logger.error('Stream error:', error.message);
          } else {
            logger.error('Network error in stream:', error);
          }
        }

        if (onDone) {
          onDone();
        }
      }
    })();

    // Return a function to cancel the streaming
    return () => {
      logger.debug('Cancelling stream request');
      controller.abort();
    };
  }

  /**
   * Lists available models
   * @returns Array of model information
   */
  public async listModels(): Promise<OllamaListModelsResponse> {
    return this.post<Record<string, never>, OllamaListModelsResponse>('tags', {});
  }

  /**
   * Generates a completion for the given prompt
   * @param params Generation parameters
   * @returns Generated response
   */
  public async generate(
    params: Omit<OllamaGenerateRequest, 'stream'>
  ): Promise<OllamaGenerateResponse> {
    const request: OllamaGenerateRequest = {
      ...params,
      model: params.model || this.defaultModel,
      stream: false,
    };

    return this.post<OllamaGenerateRequest, OllamaGenerateResponse>('generate', request);
  }

  /**
   * Streams a completion for the given prompt
   * @param params Generation parameters
   * @param onChunk Callback for each chunk of the response
   * @param onDone Callback when streaming is complete
   * @returns Cleanup function to cancel the stream
   */
  public async generateStream(
    params: Omit<OllamaGenerateRequest, 'stream'>,
    onChunk: (chunk: OllamaGenerateResponse) => void,
    onDone?: () => void
  ): Promise<() => void> {
    const request: OllamaGenerateRequest = {
      ...params,
      model: params.model || this.defaultModel,
      stream: true,
    };

    return this.stream<OllamaGenerateRequest, OllamaGenerateResponse>(
      'generate',
      request,
      onChunk,
      onDone
    );
  }

  /**
   * Sends a chat request to the model
   * @param params Chat parameters
   * @returns Chat response
   */
  public async chat(params: Omit<OllamaChatRequest, 'stream'>): Promise<OllamaChatResponse> {
    const request: OllamaChatRequest = {
      ...params,
      model: params.model || this.defaultModel,
      stream: false,
    };

    return this.post<OllamaChatRequest, OllamaChatResponse>('chat', request);
  }

  /**
   * Streams a chat request to the model
   * @param params Chat parameters
   * @param onChunk Callback for each chunk of the response
   * @param onDone Callback when streaming is complete
   * @returns Cleanup function to cancel the stream
   */
  public async chatStream(
    params: Omit<OllamaChatRequest, 'stream'>,
    onChunk: (chunk: OllamaChatResponse) => void,
    onDone?: () => void
  ): Promise<() => void> {
    const request: OllamaChatRequest = {
      ...params,
      model: params.model || this.defaultModel,
      stream: true,
    };

    return this.stream<OllamaChatRequest, OllamaChatResponse>('chat', request, onChunk, onDone);
  }
}
