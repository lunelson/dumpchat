import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Chat Thread Exporter',
    description: 'Export ChatGPT and Claude conversations to Markdown',
    permissions: ['clipboardWrite']
  }
});
