import {
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  uniqueElements,
  waitFor,
} from "../helpers";
import type { ExportData, Site, SiteConfig } from "../types";

export async function collectPerplexityExportData(
  config: SiteConfig,
  site: Site,
): Promise<ExportData> {
  const queryButtons = getPerplexityQueryCopyButtons(document);
  const assistantNodes = getPerplexityAssistantNodes(document, config);
  const assistantEntries = assistantNodes.map((node) => ({
    node,
    button: findPerplexityAssistantCopyButton(node, config),
  }));
  const assistantButtons = assistantEntries
    .map((entry) => entry.button)
    .filter((button): button is HTMLButtonElement => !!button);
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

    for (const [idx, entry] of assistantEntries.entries()) {
      const button = entry.button;
      if (!button) continue;
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
  const assistants = assistantEntries
    .map(({ button, node }, idx) => {
      const copied = copiedAssistants.get(idx) || "";
      if (copied) return copied;

      const fallback = extractPerplexityAssistantText(node);
      if (fallback) {
        usedFallbackCount += 1;
        if (button) fromButtonFallbackCount += 1;
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
      fallbackCount: assistantEntries.length,
      usedFallbackCount,
      fromButtonFallbackCount,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount,
      emptyCount: Math.max(0, assistantEntries.length - assistants.length),
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
  return uniqueElements(
    getPerplexityAssistantNodes(root, config)
      .map((node) => findPerplexityAssistantCopyButton(node, config))
      .filter((button): button is HTMLButtonElement => !!button),
  );
}

export function isLikelyPerplexityAssistantCopyButton(
  button: HTMLButtonElement,
  config: SiteConfig,
): boolean {
  const label = readPerplexityButtonLabel(button);
  if (!label.includes("copy") || label.includes("query")) return false;
  if (button.closest("pre, code")) return false;

  const assistantRoot = findPerplexityAssistantRoot(button, config);
  return !!assistantRoot;
}

function readPerplexityButtonLabel(button: HTMLButtonElement): string {
  return normalizeText(
    button.getAttribute("aria-label") || button.getAttribute("title") || button.textContent || "",
  ).toLowerCase();
}

function findPerplexityAssistantRoot(
  button: HTMLButtonElement,
  config: SiteConfig,
): HTMLElement | null {
  return (
    getPerplexityAssistantNodes(button.ownerDocument, config).find(
      (assistantNode) => findPerplexityAssistantCopyButton(assistantNode, config) === button,
    ) || null
  );
}

function extractPerplexityUserTextFromCopyButton(button: HTMLButtonElement): string {
  let current: HTMLElement | null = button;
  while (current) {
    const userTextNode = current.querySelector<HTMLElement>('[class~="group/query"] > div > span');
    const value = normalizeText(userTextNode?.innerText || userTextNode?.textContent || "");
    if (value) return value;
    current = current.parentElement;
  }

  return "";
}

function extractPerplexityAssistantText(node: HTMLElement): string {
  return normalizeText(node.innerText || node.textContent || "");
}

function getPerplexityAssistantNodes(root: ParentNode, config: SiteConfig): HTMLElement[] {
  return uniqueElements(
    Array.from(root.querySelectorAll<HTMLElement>(config.assistantMessageSelector)).filter((node) =>
      isVisible(node),
    ),
  );
}

function findPerplexityAssistantCopyButton(
  node: HTMLElement,
  config: SiteConfig,
): HTMLButtonElement | null {
  const actionRow = findPerplexityAssistantActionRow(node, config);
  if (!actionRow) return null;

  return (
    Array.from(actionRow.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => isVisible(button))
      .find((button) => {
        const label = readPerplexityButtonLabel(button);
        return label.includes("copy") && !label.includes("query");
      }) || null
  );
}

function findPerplexityAssistantActionRow(
  node: HTMLElement,
  config: SiteConfig,
): HTMLElement | null {
  let current: HTMLElement | null = node;
  while (current) {
    let sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling instanceof HTMLElement && isPerplexityAssistantActionRow(sibling, config)) {
        return sibling;
      }
      sibling = sibling.nextElementSibling;
    }
    current = current.parentElement;
  }

  return null;
}

function isPerplexityAssistantActionRow(node: HTMLElement, config: SiteConfig): boolean {
  if (node.querySelector(config.assistantMessageSelector)) return false;

  const buttons = Array.from(node.querySelectorAll<HTMLButtonElement>("button")).filter((button) =>
    isVisible(button),
  );
  if (buttons.length === 0) return false;

  return (
    hasPerplexityActionButton(buttons, "share") &&
    hasPerplexityActionButton(buttons, "copy") &&
    hasPerplexityActionButton(buttons, "rewrite")
  );
}

function hasPerplexityActionButton(buttons: HTMLButtonElement[], labelFragment: string): boolean {
  return buttons.some((button) => {
    const label = readPerplexityButtonLabel(button);
    if (!label.includes(labelFragment)) return false;
    if (labelFragment === "copy" && label.includes("query")) return false;
    return true;
  });
}
