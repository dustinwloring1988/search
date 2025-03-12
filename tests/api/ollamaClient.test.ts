/**
 * Tests for the OllamaClient
 */

import { OllamaClient, OllamaAPIError } from '../../src/api/ollamaClient';

// Mock fetch for testing
global.fetch = jest.fn();

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('OllamaClient', () => {
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient();
    mockFetch.mockClear();
  });

  describe('listModels', () => {
    it('should successfully list models', async () => {
      const mockModels = {
        models: [
          {
            name: 'llama2:latest',
            model: 'llama2',
            modified_at: '2023-01-01T00:00:00Z',
            size: 3791730742,
            digest: 'sha256:1234567890',
            details: {
              format: 'gguf',
              family: 'llama',
              parameter_size: '7B',
              quantization_level: 'Q4_0',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockModels),
      } as unknown as Response);

      const result = await client.listModels();
      expect(result).toEqual(mockModels);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/tags'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle API errors', async () => {
      // Mock all retry attempts to fail with the same error
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue('Internal server error'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue('Internal server error'),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue('Internal server error'),
        } as unknown as Response);

      await expect(client.listModels()).rejects.toThrow(OllamaAPIError);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 3 retry attempts
    });

    it('should handle error responses from the API', async () => {
      // Mock all retry attempts to return the same error response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ error: 'Something went wrong' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ error: 'Something went wrong' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ error: 'Something went wrong' }),
        } as unknown as Response);

      await expect(client.listModels()).rejects.toThrow('API returned error: Something went wrong');
      expect(mockFetch).toHaveBeenCalledTimes(3); // 3 retry attempts
    });
  });

  describe('generate', () => {
    it('should successfully generate text', async () => {
      const mockResponse = {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: 'Hello, world!',
        done: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse),
      } as unknown as Response);

      const result = await client.generate({
        prompt: 'Say hello',
        model: 'llama2',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/generate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );

      const requestBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
      expect(requestBody).toEqual({
        prompt: 'Say hello',
        model: 'llama2',
        stream: false,
      });
    });
  });

  describe('generateStream', () => {
    it('should stream generated text', async () => {
      // Mock a readable stream for fetch
      const mockReader = {
        read: jest.fn(),
        closed: false,
      };

      // Mock two chunks of data and then done
      mockReader.read
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(
            JSON.stringify({
              model: 'llama2',
              created_at: '2023-01-01T00:00:00Z',
              response: 'Hello',
              done: false,
            }) + '\n'
          ),
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(
            JSON.stringify({
              model: 'llama2',
              created_at: '2023-01-01T00:00:00Z',
              response: ', world!',
              done: true,
            }) + '\n'
          ),
        })
        .mockResolvedValueOnce({
          done: true,
        });

      const mockBody = {
        getReader: (): { read: () => Promise<{ done: boolean; value?: Uint8Array }> } => mockReader,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockBody,
      } as unknown as Response);

      const onChunk = jest.fn();
      const onDone = jest.fn();

      // Call the function under test
      const cancelStream = await client.generateStream(
        {
          prompt: 'Say hello',
          model: 'llama2',
        },
        onChunk,
        onDone
      );

      // Wait for all promises to resolve
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(onChunk).toHaveBeenCalledTimes(2);
      expect(onChunk).toHaveBeenNthCalledWith(1, {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: 'Hello',
        done: false,
      });
      expect(onChunk).toHaveBeenNthCalledWith(2, {
        model: 'llama2',
        created_at: '2023-01-01T00:00:00Z',
        response: ', world!',
        done: true,
      });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(typeof cancelStream).toBe('function');
    });
  });
});
