/**
 * Tests for the AIService
 */
import { AIService } from '../../src/api/aiService';
import { OllamaClient, OllamaAPIError } from '../../src/api/ollamaClient';

// Mock the OllamaClient
jest.mock('../../src/api/ollamaClient');
const MockedOllamaClient = OllamaClient as jest.MockedClass<typeof OllamaClient>;

describe('AIService', () => {
  let service: AIService;
  let mockOllamaClient: jest.Mocked<OllamaClient>;

  beforeEach(() => {
    mockOllamaClient = {
      chat: jest.fn(),
      chatStream: jest.fn(),
      defaultModel: 'granite3.2-vision',
    } as unknown as jest.Mocked<OllamaClient>;

    MockedOllamaClient.mockImplementation(() => mockOllamaClient);
    service = new AIService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('query', () => {
    it('should process a standard text query', async () => {
      // Mock a standard text response
      mockOllamaClient.chat.mockResolvedValue({
        model: 'granite3.2-vision',
        created_at: '2023-01-01T00:00:00Z',
        done: true,
        message: {
          role: 'assistant',
          content: 'This is a standard text response.',
        },
      });

      const result = await service.query('Tell me about the weather');

      expect(mockOllamaClient.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'granite3.2-vision',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: 'Tell me about the weather',
            }),
          ]),
        })
      );

      expect(result).toEqual({
        text: 'This is a standard text response.',
        structuredOutput: undefined,
        toolCalls: undefined,
      });
    });

    it('should process a browser automation query and extract structured output', async () => {
      // Mock a response with structured JSON data
      mockOllamaClient.chat.mockResolvedValue({
        model: 'granite3.2-vision',
        created_at: '2023-01-01T00:00:00Z',
        done: true,
        message: {
          role: 'assistant',
          content: `I'll help you navigate to Google.

\`\`\`json
{
  "browser_actions": [
    {
      "action": "navigate",
      "parameters": {
        "url": "https://www.google.com"
      }
    }
  ],
  "explanation": "Navigating to Google's homepage"
}
\`\`\``,
        },
      });

      const result = await service.query('Go to google.com');

      expect(result).toEqual({
        text: expect.stringContaining("I'll help you navigate to Google"),
        structuredOutput: {
          browser_actions: [
            {
              action: 'navigate',
              parameters: {
                url: 'https://www.google.com',
              },
            },
          ],
          explanation: "Navigating to Google's homepage",
        },
        toolCalls: [
          {
            name: 'navigate',
            parameters: {
              url: 'https://www.google.com',
            },
          },
        ],
      });
    });

    it('should handle API errors gracefully', async () => {
      mockOllamaClient.chat.mockRejectedValue(
        new OllamaAPIError('Failed to connect to ollama API')
      );

      const result = await service.query('Tell me about the weather');

      expect(result.error).toBeDefined();
      expect(result.text).toContain('encountered an error');
    });
  });

  describe('queryStream', () => {
    it('should stream responses and update callbacks', async () => {
      // Setup mock for streaming
      const cancelStreamMock = jest.fn();
      mockOllamaClient.chatStream.mockImplementation((_params, onChunk, onDone) => {
        // Simulate chunks of streaming data
        setTimeout(() => {
          onChunk({
            model: 'granite3.2-vision',
            created_at: '2023-01-01T00:00:00Z',
            done: false,
            message: {
              role: 'assistant',
              content: 'First ',
            },
          });
        }, 10);

        setTimeout(() => {
          onChunk({
            model: 'granite3.2-vision',
            created_at: '2023-01-01T00:00:00Z',
            done: false,
            message: {
              role: 'assistant',
              content: 'part of ',
            },
          });
        }, 20);

        setTimeout(() => {
          onChunk({
            model: 'granite3.2-vision',
            created_at: '2023-01-01T00:00:00Z',
            done: true,
            message: {
              role: 'assistant',
              content: 'the response.',
            },
          });
          if (onDone) onDone();
        }, 30);

        return Promise.resolve(cancelStreamMock);
      });

      const onTextUpdate = jest.fn();
      const onComplete = jest.fn();

      const cancelStream = await service.queryStream('Stream test', {
        onTextUpdate,
        onComplete,
      });

      // Wait for all the timeouts to complete
      await new Promise(resolve => setTimeout(resolve, 40));

      expect(cancelStream).toBe(cancelStreamMock);
      expect(onTextUpdate).toHaveBeenCalledTimes(3);
      expect(onTextUpdate).toHaveBeenLastCalledWith('First part of the response.');
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith({
        text: 'First part of the response.',
        structuredOutput: undefined,
        toolCalls: undefined,
      });
    });

    it('should handle errors in streaming', async () => {
      mockOllamaClient.chatStream.mockRejectedValue(new Error('Stream error'));

      const onError = jest.fn();
      const onComplete = jest.fn();

      await service.queryStream('Stream test', {
        onError,
        onComplete,
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledWith({
        text: 'I encountered an error communicating with my AI backend.',
        error: 'Stream error',
      });
    });
  });

  describe('preprocessQuery', () => {
    it('should convert a domain to a full URL', async () => {
      // Create a spy on the preprocessQuery method to verify it's called correctly
      // Use a two-step cast to avoid TypeScript errors with private methods
      const preprocessSpy = jest.spyOn(
        (service as unknown) as { preprocessQuery: (query: string) => string },
        'preprocessQuery'
      );

      mockOllamaClient.chat.mockResolvedValue({
        model: 'granite3.2-vision',
        created_at: '2023-01-01T00:00:00Z',
        done: true,
        message: {
          role: 'assistant',
          content: 'Response',
        },
      });

      await service.query('example.com');

      // Verify the preprocessQuery method was called with the right input
      expect(preprocessSpy).toHaveBeenCalledWith('example.com');
      // Verify it returned the expected output - including navigation context
      expect(preprocessSpy).toHaveReturnedWith('Navigate to https://example.com');
    });

    it('should add navigation context to URLs', async () => {
      // Create a spy on the preprocessQuery method to verify it's called correctly
      // Use a two-step cast to avoid TypeScript errors with private methods
      const preprocessSpy = jest.spyOn(
        (service as unknown) as { preprocessQuery: (query: string) => string },
        'preprocessQuery'
      );

      mockOllamaClient.chat.mockResolvedValue({
        model: 'granite3.2-vision',
        created_at: '2023-01-01T00:00:00Z',
        done: true,
        message: {
          role: 'assistant',
          content: 'Response',
        },
      });

      await service.query('https://example.com');

      // Verify the preprocessQuery method was called with the right input
      expect(preprocessSpy).toHaveBeenCalledWith('https://example.com');
      // Verify it returned the expected output
      expect(preprocessSpy).toHaveReturnedWith('Navigate to https://example.com');
    });
  });
});
