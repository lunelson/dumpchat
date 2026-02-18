import {
  DIAGNOSTICS_SCHEMA_NAME,
  DIAGNOSTICS_SCHEMA_VERSION,
  SITE_CONFIG
} from './config';
import type {
  CopyButtonRoleHint,
  DiagnosticReport,
  ExportData,
  Site,
  SiteConfig
} from './types';

export async function collectExportData(site: Site): Promise<ExportData> {
  const config = SITE_CONFIG[site];

  if (site === 'chatgpt') {
    return await collectChatGptExportData(config, site);
  }
  return await collectClaudeExportData(config, site);
}

async function collectChatGptExportData(
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

type ClaudeTurn = {
  root: HTMLElement;
  role: 'user' | 'assistant';
  copyButton: HTMLButtonElement | null;
};

async function collectClaudeExportData(
  config: SiteConfig,
  site: Site
): Promise<ExportData> {
  const turns = getClaudeTurns(config);
  const allCopyButtons = uniqueElements(
    toElements<HTMLButtonElement>(config.copyButtonSelector).filter((button) =>
      isVisible(button)
    )
  );

  const captured: string[] = [];
  const copiedByTurn = new Map<number, string>();
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (let idx = 0; idx < turns.length; idx += 1) {
      const button = turns[idx].copyButton;
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

  const users: string[] = [];
  const assistants: string[] = [];
  let usedFallbackCount = 0;

  for (let idx = 0; idx < turns.length; idx += 1) {
    const turn = turns[idx];
    const copied = copiedByTurn.get(idx) || '';

    if (turn.role === 'user') {
      const fallback = extractClaudeUserText(turn.root);
      const value = copied || fallback;
      if (value) users.push(value);
      continue;
    }

    const fallback = extractClaudeAssistantText(turn.root);
    const value = copied || fallback;
    if (!copied && fallback) usedFallbackCount += 1;
    if (value) assistants.push(value);
  }

  const assistantTurns = turns.filter((turn) => turn.role === 'assistant');
  const userTurns = turns.filter((turn) => turn.role === 'user');
  const title = readTitle(config, site) || `${site} conversation`;

  return {
    title,
    exportedAt: new Date().toISOString(),
    users,
    assistants,
    assistantDebug: {
      copyButtonsTotal: allCopyButtons.length,
      copyButtonsVisible: allCopyButtons.length,
      copyButtonsAfterUserFilter: assistantTurns.filter((turn) => !!turn.copyButton).length,
      clipboardCaptures: captured.length,
      filteredByRoleHintCount: userTurns.filter((turn) => !!turn.copyButton).length,
      fallbackCount: assistantTurns.length,
      usedFallbackCount,
      fromButtonFallbackCount: 0,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount: 0,
      emptyCount: assistantTurns.length - assistants.length
    }
  };
}

export async function buildDiagnosticReport(site: Site): Promise<DiagnosticReport> {
  const config = SITE_CONFIG[site];
  const data = await collectExportData(site);
  const userNodes = getVisibleUserNodes(config);
  const assistantNodes = toElements<HTMLElement>(config.assistantMessageSelector);
  const allCopyButtons =
    site === 'chatgpt'
      ? getChatGptTurnCopyButtons(document, config)
      : uniqueElements(toElements<HTMLButtonElement>(config.copyButtonSelector));
  const visibleCopyButtons = allCopyButtons.filter((node) => isVisible(node));
  const extractedAssistants = data.assistants.filter((text) => !!normalizeText(text));
  const issues: string[] = [];

  if (assistantNodes.length > 0 && extractedAssistants.length === 0) {
    issues.push('Assistant nodes exist, but extracted assistant messages were empty.');
  }

  if (assistantNodes.length > 0 && visibleCopyButtons.length === 0) {
    issues.push('Assistant nodes exist, but no visible copy buttons matched current selector.');
  }

  if (
    visibleCopyButtons.length > 0 &&
    data.assistantDebug.clipboardCaptures === 0 &&
    data.assistantDebug.fallbackCount === 0
  ) {
    issues.push('Copy buttons were found, but clipboard interception and fallback extraction both returned no content.');
  }

  const health = deriveHealthStatus({
    issues,
    assistantNodes: assistantNodes.length,
    usersExtracted: data.users.length,
    assistantsExtracted: data.assistants.length,
    assistantDebug: data.assistantDebug
  });

  return {
    schema: {
      name: DIAGNOSTICS_SCHEMA_NAME,
      version: DIAGNOSTICS_SCHEMA_VERSION
    },
    generatedAt: new Date().toISOString(),
    site,
    url: location.href,
    path: location.pathname,
    selectors: {
      userMessageSelector: config.userMessageSelector,
      assistantMessageSelector: config.assistantMessageSelector,
      copyButtonSelector: config.copyButtonSelector,
      editButtonSelector: config.editButtonSelector,
      messageGroupSelector: config.messageGroupSelector
    },
    counts: {
      userNodes: userNodes.length,
      assistantNodes: assistantNodes.length,
      copyButtonsTotal: allCopyButtons.length,
      copyButtonsVisible: visibleCopyButtons.length
    },
    extraction: {
      title: data.title,
      usersExtracted: data.users.length,
      assistantsExtracted: data.assistants.length,
      assistantsNonEmpty: extractedAssistants.length,
      assistantDebug: data.assistantDebug
    },
    health,
    samples: {
      users: data.users.slice(0, 4).map((value, index) => ({
        index,
        length: value.length,
        preview: value.slice(0, 240)
      })),
      assistants: data.assistants.slice(0, 4).map((value, index) => ({
        index,
        length: value.length,
        preview: value.slice(0, 240)
      }))
    },
    issues
  };
}

export function deriveHealthStatus(input: {
  issues: string[];
  assistantNodes: number;
  usersExtracted: number;
  assistantsExtracted: number;
  assistantDebug: ExportData['assistantDebug'];
}): DiagnosticReport['health'] {
  if (
    input.issues.length > 0 ||
    input.usersExtracted === 0 ||
    input.assistantsExtracted === 0
  ) {
    return { level: 'red', summary: 'missing required content' };
  }

  const hasFallbackUse =
    input.assistantDebug.fromButtonFallbackCount > 0 ||
    input.assistantDebug.usedFallbackCount > 0;

  if (hasFallbackUse) {
    return { level: 'yellow', summary: 'working with fallback paths' };
  }

  if (input.assistantNodes === 0) {
    if (input.assistantDebug.clipboardCaptures >= input.assistantsExtracted) {
      return { level: 'green', summary: 'copy-path checks passed' };
    }
    return { level: 'yellow', summary: 'assistant selectors unavailable' };
  }

  return { level: 'green', summary: 'all primary checks passed' };
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

function getClaudeTurns(config: SiteConfig): ClaudeTurn[] {
  const roots = uniqueElements(
    toElements<HTMLElement>('div[data-test-render-count]').filter((root) =>
      isVisible(root)
    )
  );

  const turns = roots
    .map((root) => {
      const role = detectClaudeTurnRole(root);
      if (role === 'unknown') return null;
      const copyButton =
        root.querySelector<HTMLButtonElement>(config.copyButtonSelector);
      return { root, role, copyButton };
    })
    .filter((turn): turn is ClaudeTurn => !!turn);

  return turns;
}

function detectClaudeTurnRole(root: HTMLElement): CopyButtonRoleHint {
  const hasUser = !!root.querySelector('[data-testid="user-message"], [data-testid="message-user"]');
  const hasAssistant = !!root.querySelector(
    '.font-claude-response, [data-testid="assistant-message"], [data-testid="message-assistant"]'
  );

  if (hasUser && !hasAssistant) return 'user';
  if (hasAssistant && !hasUser) return 'assistant';
  return 'unknown';
}

function extractClaudeUserText(root: HTMLElement): string {
  const node = root.querySelector<HTMLElement>(
    '[data-testid="user-message"], [data-testid="message-user"]'
  );
  return normalizeText(node?.innerText || node?.textContent || '');
}

function extractClaudeAssistantText(root: HTMLElement): string {
  const preferred = root.querySelector<HTMLElement>(
    '.row-start-2 .standard-markdown'
  );
  if (preferred) {
    const value = normalizeText(preferred.innerText || preferred.textContent || '');
    if (value) return value;
  }

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('.font-claude-response .standard-markdown')
  )
    .map((node) => normalizeText(node.innerText || node.textContent || ''))
    .filter((value) => !!value)
    .sort((a, b) => b.length - a.length);

  if (candidates[0]) return candidates[0];

  const container = root.querySelector<HTMLElement>('.font-claude-response');
  return normalizeText(container?.innerText || container?.textContent || '');
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

function interceptClipboard(onWrite: (text: string) => void): () => void {
  const copyHandler = (event: ClipboardEvent) => {
    const value = normalizeText(event.clipboardData?.getData('text/plain') || '');
    if (value) onWrite(value);
  };
  document.addEventListener('copy', copyHandler, true);

  const clipboard = navigator.clipboard as Clipboard & {
    writeText?: (data: string) => Promise<void>;
    write?: (items: ClipboardItem[]) => Promise<void>;
  };

  const originalWriteText =
    clipboard && typeof clipboard.writeText === 'function'
      ? clipboard.writeText.bind(clipboard)
      : null;

  const originalWrite =
    clipboard && typeof clipboard.write === 'function'
      ? clipboard.write.bind(clipboard)
      : null;

  if (originalWriteText) {
    clipboard.writeText = async (value: string) => {
      if (value) onWrite(value);
      try {
        await originalWriteText(value);
      } catch {
        return;
      }
    };
  }

  if (originalWrite) {
    clipboard.write = async (items: ClipboardItem[]) => {
      for (const item of items || []) {
        if (!item.types.includes('text/plain')) continue;
        try {
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          if (text) onWrite(text);
        } catch {
          continue;
        }
      }
      try {
        await originalWrite(items);
      } catch {
        return;
      }
    };
  }

  return () => {
    document.removeEventListener('copy', copyHandler, true);
    if (originalWriteText) clipboard.writeText = originalWriteText;
    if (originalWrite) clipboard.write = originalWrite;
  };
}

function toElements<T extends Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

function uniqueElements<T extends Element>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function getVisibleUserNodes(config: SiteConfig): HTMLElement[] {
  const candidates = toElements<HTMLElement>(config.userMessageSelector).filter((node) =>
    isVisible(node)
  );

  const grouped = candidates.map((node) => {
    const group = node.closest(config.messageGroupSelector);
    if (
      group instanceof HTMLElement &&
      group.matches(config.userMessageSelector) &&
      isVisible(group)
    ) {
      return group;
    }
    return node;
  });

  return uniqueElements(grouped);
}

function getVisibleTurnContainers(config: SiteConfig): HTMLElement[] {
  return uniqueElements(
    toElements<HTMLElement>(config.messageGroupSelector).filter(
      (node) => isVisible(node) && !!node.dataset.turn
    )
  );
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function cleanActionLabels(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        !/^(Copy|Edit|Retry|Regenerate|Share|Like|Dislike|Thumbs up|Thumbs down)$/i.test(
          line.trim()
        )
    )
    .join('\n')
    .trim();
}

function hover(node: HTMLElement): void {
  node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}

function isVisible(node: HTMLElement): boolean {
  return !!(node.offsetParent || node.getClientRects().length);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  check: () => boolean,
  timeoutMs: number,
  intervalMs: number
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (check()) return;
    await wait(intervalMs);
  }
}
