import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "DumpChat",
    description: "Export ChatGPT, Claude, and Perplexity chat threads to Markdown",
    permissions: ["clipboardWrite"],
  },
});
