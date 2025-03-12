/**
 * Configuration module that loads and validates environment variables
 */

import * as path from 'path';
import * as fs from 'fs';
import * as electronLog from 'electron-log';

// Define the structure of our configuration
interface Config {
  app: {
    nodeEnv: string;
    startUrl: string | null;
  };
  ollama: {
    apiUrl: string;
    model: string;
    timeoutMs: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
  playwright: {
    browser: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
  };
}

/**
 * Load environment variables from .env file in development mode
 */
function loadEnvFile(): void {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');

        envFile.split('\n').forEach(line => {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            const key = match[1];
            let value = match[2] || '';

            // Remove quotes if present
            value = value.replace(/^["']|["']$/g, '');

            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        });

        electronLog.info('Loaded environment variables from .env file');
      }
    } catch (error) {
      electronLog.error('Error loading .env file:', error);
    }
  }
}

// Load environment variables
loadEnvFile();

// Create and export configuration
const config: Config = {
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    startUrl: process.env.ELECTRON_START_URL || null,
  },
  ollama: {
    apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434/api',
    model: process.env.OLLAMA_MODEL || 'granite3.2-vision',
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10),
    retryAttempts: parseInt(process.env.OLLAMA_RETRY_ATTEMPTS || '3', 10),
    retryDelayMs: parseInt(process.env.OLLAMA_RETRY_DELAY_MS || '1000', 10),
  },
  playwright: {
    browser: (process.env.PLAYWRIGHT_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit',
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
  },
};

export default config;
