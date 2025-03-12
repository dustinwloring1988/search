import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  appInfo: async (): Promise<{
    appName: string;
    appVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: string;
  }> => {
    return await ipcRenderer.invoke('app-info');
  },

  // Add other API functions here as we develop them
  // For example, interactions with the ollama API or Playwright
  executeAiQuery: async (query: string): Promise<string> => {
    return await ipcRenderer.invoke('execute-ai-query', query);
  },

  executeTool: async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
    return await ipcRenderer.invoke('execute-tool', toolName, params);
  },
});
