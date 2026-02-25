import type { ExportData, Site, SiteConfig } from "../types";
import {
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  uniqueElements,
  waitFor,
} from "../helpers";

export async function collectPerplexityExportData(
  config: SiteConfig,
  site: Site,
): Promise<ExportData> {
  const queryButtons = getPerplexityQueryCopyButtons(document);
  const assistantButtons = getPerplexityAssistantCopyButtons(document, config);
  const allCopyButtons = uniqueElements([...queryButtons, ...assistantButtons]);
  const captured: string[] = [];
  const copiedQueries = new Map<number, string>();
  const copiedAssistants = new Map<number, string>();
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (const [idx, button] of queryButtons.entries()) {
      const before = captured.length;
      hover(button);
      button.click();
      await waitFor(() => captured.length > before, 900, 60);
      const copied = captured[before] || "";
      if (copied) copiedQueries.set(idx, copied);
    }

    for (const [idx, button] of assistantButtons.entries()) {
      const before = captured.length;
      hover(button);
      button.click();
      await waitFor(() => captured.length > before, 900, 60);
      const copied = captured[before] || "";
      if (copied) copiedAssistants.set(idx, copied);
    }
  } finally {
    stopIntercept();
  }

  let userCopyReplacementsCount = 0;
  const users = queryButtons
    .map((button, idx) => {
      const copied = copiedQueries.get(idx) || "";
      if (copied) return copied;

      const fallback = extractPerplexityUserTextFromCopyButton(button);
      if (fallback) userCopyReplacementsCount += 1;
      return fallback;
    })
    .filter((value) => !!value);

  let usedFallbackCount = 0;
  let fromButtonFallbackCount = 0;
  const assistants = assistantButtons
    .map((button, idx) => {
      const copied = copiedAssistants.get(idx) || "";
      if (copied) return copied;

      const fallback = extractPerplexityAssistantTextFromCopyButton(button, config);
      if (fallback) {
        usedFallbackCount += 1;
        fromButtonFallbackCount += 1;
      }
      return fallback;
    })
    .filter((value) => !!value);

  const title = readPerplexityTitle(config) || `${site} conversation`;
  return {
    title,
    exportedAt: new Date().toISOString(),
    users,
    assistants,
    assistantDebug: {
      copyButtonsTotal: allCopyButtons.length,
      copyButtonsVisible: allCopyButtons.length,
      copyButtonsAfterUserFilter: assistantButtons.length,
      clipboardCaptures: copiedAssistants.size,
      filteredByRoleHintCount: queryButtons.length,
      fallbackCount: assistantButtons.length,
      usedFallbackCount,
      fromButtonFallbackCount,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount,
      emptyCount: Math.max(0, assistantButtons.length - assistants.length),
    },
  };
}

export function readPerplexityTitle(config: SiteConfig): string {
  for (const selector of config.titleSelectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = normalizeText(node?.innerText ?? node?.textContent ?? "");
    if (value) return value;
  }

  const fromDocument = normalizeText(document.title || "")
    .replace(/\s*[|·-]\s*Perplexity$/i, "")
    .trim();
  return fromDocument;
}

function getPerplexityQueryCopyButtons(root: ParentNode): HTMLButtonElement[] {
  return uniqueElements(
    Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label="Copy Query"]')).filter(
      (button) => isVisible(button),
    ),
  );
}

export function getPerplexityAssistantCopyButtons(
  root: ParentNode,
  config: SiteConfig,
): HTMLButtonElement[] {
  const candidates = Array.from(
    root.querySelectorAll<HTMLButtonElement>('button[aria-label="Copy"]'),
  ).filter((button) => isVisible(button));

  return uniqueElements(
    candidates.filter((button) => isLikelyPerplexityAssistantCopyButton(button, config)),
  );
}

export function isLikelyPerplexityAssistantCopyButton(
  button: HTMLButtonElement,
  config: SiteConfig,
): boolean {
  const label = normalizeText(button.getAttribute("aria-label") || "").toLowerCase();
  if (label !== "copy") return false;
  if (button.closest("pre, code")) return false;

  const actionRow = button.closest("div.flex.items-center.justify-between");
  if (!(actionRow instanceof HTMLElement)) return false;

  const hasShare = !!actionRow.querySelector('button[aria-label="Share"]');
  const hasRewrite = !!actionRow.querySelector('button[aria-label="Rewrite"]');
  if (!hasShare || !hasRewrite) return false;

  const assistantRoot = findPerplexityAssistantRoot(button, config);
  if (!assistantRoot) return false;
  return !!assistantRoot.querySelector<HTMLElement>(config.assistantMessageSelector);
}

function findPerplexityAssistantRoot(
  button: HTMLButtonElement,
  config: SiteConfig,
): HTMLElement | null {
  let current: HTMLElement | null = button;
  while (current) {
    if (current.querySelector<HTMLElement>(config.assistantMessageSelector)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function extractPerplexityUserTextFromCopyButton(button: HTMLButtonElement): string {
  let current: HTMLElement | null = button;
  while (current) {
    const userTextNode = current.querySelector<HTMLElement>(
      '[class*="group/query"] span, [class*="group/query"]',
    );
    const value = normalizeText(userTextNode?.innerText || userTextNode?.textContent || "");
    if (value) return value;
    current = current.parentElement;
  }

  return "";
}

function extractPerplexityAssistantTextFromCopyButton(
  button: HTMLButtonElement,
  config: SiteConfig,
): string {
  const root = findPerplexityAssistantRoot(button, config);
  if (!root) return "";

  const content = root.querySelector<HTMLElement>(config.assistantMessageSelector);
  if (!content) return "";

  return normalizeText(content.innerText || content.textContent || "");
}
