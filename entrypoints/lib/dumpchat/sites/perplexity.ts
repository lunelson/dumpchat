import {
  filterByConsistentDepth,
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  uniqueElements,
  waitFor,
} from "../helpers";
import type { ExportData, Site, SiteConfig } from "../types";

type PerplexityTurn = {
  role: "user" | "assistant";
  copyButton: HTMLButtonElement;
};

export async function collectPerplexityExportData(
  config: SiteConfig,
  site: Site,
): Promise<ExportData> {
  const turns = getPerplexityTurns(config);

  const captured: string[] = [];
  const copiedByTurn = new Map<number, string>();
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (const [idx, turn] of turns.entries()) {
      const before = captured.length;
      hover(turn.copyButton);
      turn.copyButton.click();
      await waitFor(() => captured.length > before, 900, 60);
      const copied = captured[before] || "";
      if (copied) copiedByTurn.set(idx, copied);
    }
  } finally {
    stopIntercept();
  }

  const users: string[] = [];
  const assistants: string[] = [];
  let usedFallbackCount = 0;

  for (const [idx, turn] of turns.entries()) {
    const copied = copiedByTurn.get(idx) || "";

    if (turn.role === "user") {
      const fallback = extractPerplexityUserText(turn.copyButton, config);
      const value = copied || fallback;
      if (value) users.push(value);
      continue;
    }

    const fallback = extractPerplexityAssistantText(turn.copyButton, config);
    const value = copied || fallback;
    if (!copied && fallback) usedFallbackCount += 1;
    if (value) assistants.push(value);
  }

  const userTurns = turns.filter((t) => t.role === "user");
  const assistantTurns = turns.filter((t) => t.role === "assistant");
  const title = readPerplexityTitle(config) || `${site} conversation`;

  return {
    title,
    exportedAt: new Date().toISOString(),
    users,
    assistants,
    assistantDebug: {
      copyButtonsTotal: turns.length,
      copyButtonsVisible: turns.length,
      copyButtonsAfterUserFilter: assistantTurns.length,
      clipboardCaptures: captured.length,
      filteredByRoleHintCount: userTurns.length,
      fallbackCount: assistantTurns.length,
      usedFallbackCount,
      fromButtonFallbackCount: 0,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount: 0,
      emptyCount: assistantTurns.length - assistants.length,
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

export function getPerplexityAssistantCopyButtons(
  root: ParentNode,
  _config: SiteConfig,
): HTMLButtonElement[] {
  return filterByConsistentDepth(
    uniqueElements(
      Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label="Copy" i]')).filter(
        (button) => isVisible(button),
      ),
    ),
  );
}

export function isLikelyPerplexityAssistantCopyButton(
  button: HTMLButtonElement,
  _config: SiteConfig,
): boolean {
  const label = normalizeText(button.getAttribute("aria-label") || "").toLowerCase();
  return label === "copy";
}

function getPerplexityTurns(config: SiteConfig): PerplexityTurn[] {
  const buttons = filterByConsistentDepth(
    uniqueElements(
      Array.from(document.querySelectorAll<HTMLButtonElement>(config.copyButtonSelector)).filter(
        (button) => isVisible(button),
      ),
    ),
  );

  return buttons.map((copyButton, index) => {
    const role = detectPerplexityTurnRole(copyButton, index);
    return { role, copyButton };
  });
}

function detectPerplexityTurnRole(button: HTMLButtonElement, index: number): "user" | "assistant" {
  const label = normalizeText(button.getAttribute("aria-label") || "").toLowerCase();
  if (label.includes("query")) return "user";
  if (label === "copy") return "assistant";
  return index % 2 === 0 ? "user" : "assistant";
}

function extractPerplexityUserText(button: HTMLButtonElement, config: SiteConfig): string {
  let current: HTMLElement | null = button;
  while (current) {
    const node = current.querySelector<HTMLElement>(config.userMessageSelector);
    if (node) return normalizeText(node.innerText || node.textContent || "");
    current = current.parentElement;
  }
  return "";
}

function extractPerplexityAssistantText(button: HTMLButtonElement, config: SiteConfig): string {
  let current: HTMLElement | null = button;
  while (current) {
    const node = current.querySelector<HTMLElement>(config.assistantMessageSelector);
    if (node) return normalizeText(node.innerText || node.textContent || "");
    current = current.parentElement;
  }
  return "";
}
