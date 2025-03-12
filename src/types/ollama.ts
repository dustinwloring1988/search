/**
 * Type definitions for ollama API
 * Based on https://github.com/ollama/ollama/blob/main/docs/api.md
 */

// General response type that includes a done flag for streaming responses
export interface OllamaResponseBase {
  done: boolean;
  model: string;
  created_at: string;
}

// Request parameters for generating responses
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: Array<number>;
  stream?: boolean;
  options?: {
    num_predict?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop?: Array<string>;
    seed?: number;
  };
  format?: 'json';
}

// Response for generation requests
export interface OllamaGenerateResponse extends OllamaResponseBase {
  response: string;
  context?: Array<number>;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// Request parameters for chat-based interactions
export interface OllamaChatRequest {
  model: string;
  messages: Array<OllamaChatMessage>;
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop?: Array<string>;
    seed?: number;
  };
}

// Message object for chat requests
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: Array<string>; // Base64-encoded images
}

// Response for chat requests
export interface OllamaChatResponse extends OllamaResponseBase {
  message: OllamaChatMessage;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

// Model information
export interface OllamaModelInfo {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families?: Array<string>;
    parameter_size: string;
    quantization_level?: string;
  };
}

// List models response
export interface OllamaListModelsResponse {
  models: Array<OllamaModelInfo>;
}

// Error response
export interface OllamaErrorResponse {
  error: string;
}
