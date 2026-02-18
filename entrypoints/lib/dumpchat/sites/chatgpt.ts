import type { ExportData, Site, SiteConfig } from '../types';
import {
  cleanActionLabels,
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  toElements,
  uniqueElements,
  waitFor
} from '../helpers';

export async function collectChatGptExportData(
  config: SiteConfig,
  site: Site
): Promise<ExportData> {
  const turnContainers = getVisibleTurnContainers(config);
  const userTurns = turnContainers.filter((turn) => turn.dataset.turn === 'user');
  const assistantTurns = turnContainers.filter(
    (turn) => turn.dataset.turn === 'assistant'
  );

  const users = userTurns
    .map((turn) => extractUserTextFromTurn(turn, config))
    .filter((value) => !!value);

  const allCopyButtons = getChatGptTurnCopyButtons(document, config);
  const assistantButtonsByTurn = assistantTurns.map((turn) =>
    getChatGptAssistantCopyButton(turn, config)
  );
  const assistantButtonCount = assistantButtonsByTurn.filter((button) => !!button).length;

  const captured: string[] = [];
  const copiedByTurn = new Map<number, string>();
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (let idx = 0; idx < assistantTurns.length; idx += 1) {
      const button = assistantButtonsByTurn[idx];
      if (!button) continue;

      const before = captured.length;
      hover(button);
      button.click();
      await waitFor(() => captured.length > before, 900, 60);
      const copied = captured[before] || '';
      if (copied) copiedByTurn.set(idx, copied);
    }
  } finally {
    stopIntercept();
  }

  let usedFallbackCount = 0;
  let fromButtonFallbackCount = 0;
  const assistants = assistantTurns.map((turn, idx) => {
    const copied = copiedByTurn.get(idx) || '';
    if (copied) return copied;

    const domFallback = extractAssistantTextFromTurn(turn, config);
    if (domFallback) {
      usedFallbackCount += 1;
      return domFallback;
    }

    const button = assistantButtonsByTurn[idx];
    const buttonFallback = button ? extractAssistantTextFromCopyButton(button) : '';
    if (buttonFallback) {
      usedFallbackCount += 1;
      fromButtonFallbackCount += 1;
    }
    return buttonFallback;
  });

  const title = readTitle(config, site) || `${site} conversation`;
  return {
    title,
    exportedAt: new Date().toISOString(),
    users,
    assistants: assistants.filter((value) => !!value),
    assistantDebug: {
      copyButtonsTotal: allCopyButtons.length,
      copyButtonsVisible: allCopyButtons.length,
      copyButtonsAfterUserFilter: assistantButtonCount,
      clipboardCaptures: captured.length,
      filteredByRoleHintCount: Math.max(0, allCopyButtons.length - assistantButtonCount),
      fallbackCount: assistantTurns.length,
      usedFallbackCount,
      fromButtonFallbackCount,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount: 0,
      emptyCount: assistants.filter((value) => !value).length
    }
  };
}

export function readTitle(config: SiteConfig, site: Site): string {
  for (const selector of config.titleSelectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = normalizeText(node?.innerText ?? node?.textContent ?? '');
    if (!value) continue;
    if (site === 'chatgpt' && !isLikelyChatGptTitle(value)) continue;
    return value;
  }
  if (site === 'chatgpt') {
    const fromSidebar = readChatGptSidebarTitle();
    if (fromSidebar) return fromSidebar;
    const fromDocument = readChatGptDocumentTitle();
    if (fromDocument) return fromDocument;
  }
  return '';
}

function readChatGptSidebarTitle(): string {
  const pathSelector = `a[href="${escapeAttributeValue(location.pathname)}"]`;
  const active =
    document.querySelector<HTMLElement>('#history a[data-active]') ||
    document.querySelector<HTMLElement>('a[data-active]') ||
    document.querySelector<HTMLElement>(pathSelector) ||
    document.querySelector<HTMLElement>('nav a[aria-current="page"]') ||
    document.querySelector<HTMLElement>('aside a[aria-current="page"]');

  const roots: HTMLElement[] = active ? [active] : [];
  if (location.pathname.startsWith('/c/')) {
    const byPath = document.querySelector<HTMLElement>(pathSelector);
    if (byPath && !roots.includes(byPath)) roots.push(byPath);
  }

  for (const root of roots) {
    const titleAttribute = normalizeText(root.getAttribute('title') || '');
    if (isLikelyChatGptTitle(titleAttribute)) return titleAttribute;

    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>('[dir="auto"], .truncate[title], .truncate, [title], span, div')
    );

    for (const node of candidates) {
      const fromTitle = normalizeText(node.getAttribute('title') || '');
      if (isLikelyChatGptTitle(fromTitle)) return fromTitle;

      const value = normalizeText(node.innerText || node.textContent || '');
      if (isLikelyChatGptTitle(value)) return value;
    }
  }
  return '';
}

export function readChatGptDocumentTitle(): string {
  const raw = normalizeText(document.title || '');
  if (!raw) return '';

  const stripped = raw
    .replace(/\s*[-|]\s*ChatGPT$/i, '')
    .replace(/^ChatGPT\s*[-|]\s*/i, '')
    .trim();

  if (!stripped) return '';
  if (stripped.toLowerCase() === 'chatgpt') return '';
  return stripped;
}

export function isLikelyChatGptTitle(value: string): boolean {
  if (!value) return false;

  const normalized = value.toLowerCase();
  if (normalized.length < 3) return false;

  const blocked = new Set([
    'chatgpt',
    'new chat',
    'search chats',
    'library',
    'apps',
    'deep research',
    'gpts',
    'projects',
    'codex'
  ]);

  return !blocked.has(normalized);
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractUserTextFromTurn(turn: HTMLElement, config: SiteConfig): string {
  const textarea = turn.querySelector<HTMLTextAreaElement>('textarea');
  if (textarea) {
    const value = normalizeText(textarea.value);
    if (value) return value;
  }

  const richText = turn.querySelector<HTMLElement>(
    '[data-message-author-role="user"] .whitespace-pre-wrap'
  );
  if (richText) {
    const value = normalizeText(richText.innerText || richText.textContent || '');
    if (value) return value;
  }

  const userNode = turn.querySelector<HTMLElement>(config.userMessageSelector);
  return normalizeText(userNode?.innerText || userNode?.textContent || '');
}

function extractAssistantTextFromTurn(turn: HTMLElement, config: SiteConfig): string {
  const assistantNode = turn.querySelector<HTMLElement>(config.assistantMessageSelector);
  if (!assistantNode) return '';

  const content = assistantNode.querySelector<HTMLElement>(
    '.markdown, .prose, [class*="markdown"], [class*="prose"]'
  );
  return normalizeText(
    content?.innerText || content?.textContent || assistantNode.innerText || assistantNode.textContent || ''
  );
}

function extractAssistantTextFromCopyButton(button: HTMLButtonElement): string {
  const roots: HTMLElement[] = [];
  const directRoots = [
    button.closest('[data-testid="assistant-message"]'),
    button.closest('[data-testid="message-assistant"]'),
    button.closest('[data-testid="chat-message"]'),
    button.closest('.group'),
    button.closest('article')
  ];

  for (const node of directRoots) {
    if (node instanceof HTMLElement && !roots.includes(node)) roots.push(node);
  }

  for (const root of roots) {
    const content = root.querySelector<HTMLElement>(
      '[data-testid="message-content"], .prose, [class*="prose"]'
    );
    const raw = normalizeText(
      (content?.innerText || content?.textContent || root.innerText || root.textContent || '').trim()
    );
    const cleaned = cleanActionLabels(raw);
    if (cleaned) return cleaned;
  }

  return '';
}

export function getChatGptTurnCopyButtons(
  root: ParentNode,
  config: SiteConfig
): HTMLButtonElement[] {
  const candidates = Array.from(
    root.querySelectorAll<HTMLButtonElement>(config.copyButtonSelector)
  ).filter((button) => isVisible(button));

  return uniqueElements(candidates.filter((button) => isLikelyChatGptTurnCopyButton(button)));
}

function getChatGptAssistantCopyButton(
  turn: HTMLElement,
  config: SiteConfig
): HTMLButtonElement | null {
  const buttons = getChatGptTurnCopyButtons(turn, config);
  const preferred = buttons.find(
    (button) =>
      normalizeText(button.getAttribute('data-testid') || '') ===
      'copy-turn-action-button'
  );
  return preferred || buttons[0] || null;
}

export function isLikelyChatGptTurnCopyButton(button: HTMLButtonElement): boolean {
  if (button.closest('[data-message-author-role="assistant"]')) return false;
  if (button.closest('pre, code')) return false;

  const dataTestId = normalizeText(button.getAttribute('data-testid') || '').toLowerCase();
  if (dataTestId === 'copy-turn-action-button') return true;
  if (dataTestId.includes('copy-code')) return false;

  const label = normalizeText(button.getAttribute('aria-label') || '').toLowerCase();
  if (!label) return false;
  if (label.includes('copy code')) return false;

  return label.startsWith('copy');
}

function getVisibleTurnContainers(config: SiteConfig): HTMLElement[] {
  return uniqueElements(
    toElements<HTMLElement>(config.messageGroupSelector).filter(
      (node) => isVisible(node) && !!node.dataset.turn
    )
  );
}
