import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'DumpChat',
    description: 'Export ChatGPT and Claude chat threads to Markdown',
    permissions: ['clipboardWrite']
  }
});
