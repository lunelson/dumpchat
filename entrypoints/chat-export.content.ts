type Site = 'chatgpt' | 'claude';

type SiteConfig = {
  titleSelectors: string[];
  conversationPath: RegExp;
  userMessageSelector: string;
  assistantMessageSelector: string;
  copyButtonSelector: string;
  editButtonSelector: string;
  editTextareaSelector: string;
  messageGroupSelector: string;
};

type AssistantExtractionDebug = {
  copyButtonsTotal: number;
  copyButtonsVisible: number;
  copyButtonsAfterUserFilter: number;
  clipboardCaptures: number;
  filteredByRoleHintCount: number;
  fallbackCount: number;
  usedFallbackCount: number;
  fromButtonFallbackCount: number;
  filteredAsUserMatchCount: number;
  userCopyReplacementsCount: number;
  emptyCount: number;
};

type CopyButtonRoleHint = 'user' | 'assistant' | 'unknown';

type AssistantExtractionResult = {
  messages: string[];
  userCopies: string[];
  debug: AssistantExtractionDebug;
};

type ExportData = {
  title: string;
  exportedAt: string;
  users: string[];
  assistants: string[];
  assistantDebug: AssistantExtractionDebug;
};

type HealthLevel = 'green' | 'yellow' | 'red' | 'gray';

type DiagnosticReport = {
  schema: {
    name: string;
    version: string;
  };
  generatedAt: string;
  site: Site;
  url: string;
  path: string;
  selectors: {
    userMessageSelector: string;
    assistantMessageSelector: string;
    copyButtonSelector: string;
    editButtonSelector: string;
    messageGroupSelector: string;
  };
  counts: {
    userNodes: number;
    assistantNodes: number;
    copyButtonsTotal: number;
    copyButtonsVisible: number;
  };
  extraction: {
    title: string;
    usersExtracted: number;
    assistantsExtracted: number;
    assistantsNonEmpty: number;
    assistantDebug: AssistantExtractionDebug;
  };
  health: {
    level: Exclude<HealthLevel, 'gray'>;
    summary: string;
  };
  samples: {
    users: Array<{ index: number; length: number; preview: string }>;
    assistants: Array<{ index: number; length: number; preview: string }>;
  };
  issues: string[];
};

const EXPORT_BUTTON_ID = 'chat-thread-exporter-button';
const VERIFY_BUTTON_ID = 'chat-thread-exporter-verify-button';
const STATUS_ID = 'chat-thread-exporter-status';
const HEALTH_BADGE_ID = 'chat-thread-exporter-health-badge';
const POLL_MS = 1200;
const DIAGNOSTICS_SCHEMA_NAME = 'chat-export-diagnostics';
const DIAGNOSTICS_SCHEMA_VERSION = '1.0.0';

const SITE_CONFIG: Record<Site, SiteConfig> = {
  chatgpt: {
    titleSelectors: ['main h1', '[data-testid="conversation-title"]', 'h1'],
    conversationPath: /^\/c\//,
    userMessageSelector: '[data-message-author-role="user"]',
    assistantMessageSelector: '[data-message-author-role="assistant"]',
    copyButtonSelector:
      'button[data-testid="copy-turn-action-button"], button[aria-label*="Copy"]',
    editButtonSelector:
      'button[data-testid="edit-turn-action-button"], button[aria-label*="Edit"]',
    editTextareaSelector:
      'textarea[data-testid="prompt-textarea"], textarea[name="prompt-textarea"], textarea',
    messageGroupSelector:
      'article[data-testid^="conversation-turn-"], div[data-testid^="conversation-turn-"]'
  },
  claude: {
    titleSelectors: [
      '[data-testid="chat-title-button"] .truncate',
      '[data-testid="chat-title-button"]',
      'main h1'
    ],
    conversationPath: /^\/chat\//,
    userMessageSelector: '[data-testid="user-message"], [data-testid="message-user"]',
    assistantMessageSelector:
      '[data-testid="assistant-message"], [data-testid="message-assistant"]',
    copyButtonSelector:
      'button[data-testid="action-bar-copy"], button[aria-label*="Copy"], button[aria-label*="copy"]',
    editButtonSelector: 'button[aria-label="Edit"], button[aria-label*="Edit"]',
    editTextareaSelector: 'textarea',
    messageGroupSelector: '.group, [data-testid="chat-message"]'
  }
};

export default defineContentScript({
  matches: ['*://chatgpt.com/*', '*://claude.ai/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  main() {
    let lastHref = location.href;
    ensureUi();

    window.setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
      }
      ensureUi();
    }, POLL_MS);
  }
});

function detectSite(): Site | null {
  if (location.hostname === 'chatgpt.com') return 'chatgpt';
  if (location.hostname === 'claude.ai') return 'claude';
  return null;
}

function isConversationPage(site: Site): boolean {
  return SITE_CONFIG[site].conversationPath.test(location.pathname);
}

function ensureUi(): void {
  const site = detectSite();
  const exportButton = document.getElementById(EXPORT_BUTTON_ID);
  const verifyButton = document.getElementById(VERIFY_BUTTON_ID);
  const healthBadge = document.getElementById(HEALTH_BADGE_ID);

  if (!site || !isConversationPage(site)) {
    exportButton?.remove();
    verifyButton?.remove();
    healthBadge?.remove();
    document.getElementById(STATUS_ID)?.remove();
    return;
  }

  if (!exportButton) {
    const button = createButton({
      id: EXPORT_BUTTON_ID,
      label: 'Export Markdown',
      bottom: 20,
      background: '#111827',
      color: '#f9fafb'
    });
    button.addEventListener('click', async () => {
      await runExport(button, site);
    });
    document.body.appendChild(button);
  }

  if (!verifyButton) {
    const button = createButton({
      id: VERIFY_BUTTON_ID,
      label: 'Verify Export',
      bottom: 62,
      background: '#f3f4f6',
      color: '#111827'
    });
    button.addEventListener('click', async () => {
      await runDiagnostics(button, site);
    });
    document.body.appendChild(button);
  }

  if (!healthBadge) {
    setHealthBadge('gray', 'not checked');
  }
}

function createButton(options: {
  id: string;
  label: string;
  bottom: number;
  background: string;
  color: string;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = options.id;
  button.type = 'button';
  button.textContent = options.label;
  Object.assign(button.style, {
    position: 'fixed',
    right: '20px',
    bottom: `${options.bottom}px`,
    zIndex: '2147483646',
    borderRadius: '12px',
    border: '1px solid rgba(0, 0, 0, 0.25)',
    background: options.background,
    color: options.color,
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
  } as CSSStyleDeclaration);

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-1px)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = '';
  });

  return button;
}

async function runExport(button: HTMLButtonElement, site: Site): Promise<void> {
  try {
    setBusy(button, true, 'Exporting...', 'Export Markdown');
    showStatus('Collecting conversation...');
    const result = await buildMarkdown(site);
    triggerDownload(result.filename, result.markdown);
    showStatus(`Saved ${result.filename}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    showStatus(message);
  } finally {
    setBusy(button, false, 'Exporting...', 'Export Markdown');
  }
}

async function runDiagnostics(
  button: HTMLButtonElement,
  site: Site
): Promise<void> {
  try {
    setBusy(button, true, 'Verifying...', 'Verify Export');
    showStatus('Running export verification...');
    const report = await buildDiagnosticReport(site);
    setHealthBadge(report.health.level, report.health.summary);
    const timestamp = formatTimestampForFilename(report.generatedAt);
    const filename = `chat-export-diagnostics-${site}-${timestamp}.json`;
    triggerDownload(filename, JSON.stringify(report, null, 2));
    showStatus(`Saved ${filename}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    setHealthBadge('red', 'verification failed');
    showStatus(message);
  } finally {
    setBusy(button, false, 'Verifying...', 'Verify Export');
  }
}

function setBusy(
  button: HTMLButtonElement,
  busy: boolean,
  busyLabel: string,
  idleLabel: string
): void {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
  button.style.opacity = busy ? '0.7' : '1';
  button.style.cursor = busy ? 'progress' : 'pointer';
}

function showStatus(message: string): void {
  let status = document.getElementById(STATUS_ID) as HTMLDivElement | null;
  if (!status) {
    status = document.createElement('div');
    status.id = STATUS_ID;
    Object.assign(status.style, {
      position: 'fixed',
      right: '20px',
      bottom: '104px',
      zIndex: '2147483646',
      borderRadius: '10px',
      border: '1px solid rgba(0, 0, 0, 0.2)',
      background: '#ffffff',
      color: '#111827',
      padding: '9px 12px',
      fontSize: '12px',
      fontWeight: '500',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
      maxWidth: '360px'
    } as CSSStyleDeclaration);
    document.body.appendChild(status);
  }

  status.textContent = message;
  window.setTimeout(() => {
    if (status) status.style.opacity = '0.9';
  }, 20);
}

function setHealthBadge(level: HealthLevel, detail: string): void {
  let badge = document.getElementById(HEALTH_BADGE_ID) as HTMLDivElement | null;
  if (!badge) {
    badge = document.createElement('div');
    badge.id = HEALTH_BADGE_ID;
    Object.assign(badge.style, {
      position: 'fixed',
      right: '20px',
      bottom: '146px',
      zIndex: '2147483646',
      borderRadius: '999px',
      border: '1px solid rgba(0, 0, 0, 0.22)',
      padding: '6px 10px',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.2px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)'
    } as CSSStyleDeclaration);
    document.body.appendChild(badge);
  }

  const styles = {
    gray: { bg: '#f3f4f6', fg: '#374151', label: 'PENDING' },
    green: { bg: '#dcfce7', fg: '#166534', label: 'HEALTHY' },
    yellow: { bg: '#fef3c7', fg: '#92400e', label: 'WARNING' },
    red: { bg: '#fee2e2', fg: '#991b1b', label: 'ERROR' }
  } as const;
  const style = styles[level];
  badge.style.background = style.bg;
  badge.style.color = style.fg;
  badge.textContent = `Export ${style.label}: ${detail}`;
}

async function buildMarkdown(
  site: Site
): Promise<{ filename: string; markdown: string }> {
  const data = await collectExportData(site);
  const turnCount = Math.max(data.users.length, data.assistants.length);

  if (turnCount === 0) {
    throw new Error('No messages found on this page');
  }

  const chunks: string[] = [];
  for (let i = 0; i < turnCount; i += 1) {
    const user = data.users[i];
    const assistant = data.assistants[i];
    if (user) chunks.push(formatTurnSection(i + 1, 'User', user));
    if (assistant) chunks.push(formatTurnSection(i + 1, 'Assistant', assistant));
  }

  const markdown = [
    `# ${data.title}`,
    '',
    `- Source: ${site}`,
    `- URL: ${location.href}`,
    `- Exported: ${data.exportedAt}`,
    '- Format: XML-style turn markers with fenced markdown bodies',
    '',
    chunks.join('\n\n')
  ].join('\n');

  const timestamp = formatTimestampForFilename(data.exportedAt);
  const filename = `${sanitizeFilename(data.title)}-${timestamp}.md`;

  return { filename, markdown };
}

async function collectExportData(site: Site): Promise<ExportData> {
  const config = SITE_CONFIG[site];
  const userNodes = getVisibleUserNodes(config);
  const users: string[] = [];

  for (const node of userNodes) {
    const value = await extractUserMessage(node, config);
    if (value) users.push(value);
  }

  const assistantResult = await extractAssistantMessages(config, users);
  const title = readTitle(config) || `${site} conversation`;
  const usersWithCopyFormatting = users.map(
    (value, index) => assistantResult.userCopies[index] || value
  );

  return {
    title,
    exportedAt: new Date().toISOString(),
    users: usersWithCopyFormatting,
    assistants: assistantResult.messages,
    assistantDebug: assistantResult.debug
  };
}

async function buildDiagnosticReport(site: Site): Promise<DiagnosticReport> {
  const config = SITE_CONFIG[site];
  const data = await collectExportData(site);
  const userNodes = getVisibleUserNodes(config);
  const assistantNodes = toElements<HTMLElement>(config.assistantMessageSelector);
  const allCopyButtons = uniqueElements(toElements<HTMLButtonElement>(config.copyButtonSelector));
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

function deriveHealthStatus(input: {
  issues: string[];
  assistantNodes: number;
  usersExtracted: number;
  assistantsExtracted: number;
  assistantDebug: AssistantExtractionDebug;
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

function formatTurnSection(
  turnNumber: number,
  role: 'User' | 'Assistant',
  content: string
): string {
  const index = String(turnNumber).padStart(3, '0');
  const openingTag = `&lt;turn index="${index}" role="${role.toLowerCase()}"&gt;`;
  const closingTag = '&lt;/turn&gt;';
  return [openingTag, renderFencedMarkdown(content), closingTag].join('\n\n');
}

function renderFencedMarkdown(content: string): string {
  const normalized = normalizeText(content);
  const fence = pickFence(normalized);
  return `${fence}markdown\n${normalized}\n${fence}`;
}

function pickFence(content: string): string {
  const runs = content.match(/`+/g) || [];
  let maxRunLength = 2;
  for (const run of runs) {
    if (run.length > maxRunLength) maxRunLength = run.length;
  }
  return '`'.repeat(Math.max(3, maxRunLength + 1));
}

function readTitle(config: SiteConfig): string {
  for (const selector of config.titleSelectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = normalizeText(node?.innerText ?? node?.textContent ?? '');
    if (value) return value;
  }
  return '';
}

async function extractUserMessage(
  node: HTMLElement,
  config: SiteConfig
): Promise<string> {
  const fromEdit = await tryExtractFromEdit(node, config);
  if (fromEdit) return fromEdit;
  return normalizeText(node.innerText || node.textContent || '');
}

async function tryExtractFromEdit(
  node: HTMLElement,
  config: SiteConfig
): Promise<string> {
  const root = (node.closest(config.messageGroupSelector) ?? node) as HTMLElement;
  hover(root);
  hover(node);

  const editButton =
    root.querySelector<HTMLButtonElement>(config.editButtonSelector) ??
    node.querySelector<HTMLButtonElement>(config.editButtonSelector);

  if (!editButton) return '';

  editButton.click();
  await wait(120);

  const textarea = document.querySelector<HTMLTextAreaElement>(
    config.editTextareaSelector
  );
  if (!textarea) {
    dispatchEscape(document.body);
    return '';
  }

  const value = normalizeText(textarea.value);
  dispatchEscape(textarea);
  dispatchEscape(document.body);
  await wait(80);
  return value;
}

function detectCopyButtonRoleHint(
  button: HTMLButtonElement,
  config: SiteConfig
): CopyButtonRoleHint {
  const directUser = button.closest(config.userMessageSelector);
  const directAssistant = button.closest(config.assistantMessageSelector);
  if (directUser && !directAssistant) return 'user';
  if (directAssistant && !directUser) return 'assistant';

  const group = button.closest(config.messageGroupSelector);
  if (group instanceof HTMLElement) {
    const groupIsUser = group.matches(config.userMessageSelector);
    const groupHasUser = !!group.querySelector(config.userMessageSelector);
    const groupIsAssistant = group.matches(config.assistantMessageSelector);
    const groupHasAssistant = !!group.querySelector(config.assistantMessageSelector);

    if ((groupIsUser || groupHasUser) && !(groupIsAssistant || groupHasAssistant)) {
      return 'user';
    }
    if ((groupIsAssistant || groupHasAssistant) && !(groupIsUser || groupHasUser)) {
      return 'assistant';
    }
  }

  return 'unknown';
}

async function extractAssistantMessages(
  config: SiteConfig,
  users: string[]
): Promise<AssistantExtractionResult> {
  const allButtons = uniqueElements(toElements<HTMLButtonElement>(config.copyButtonSelector));
  const visibleButtons = allButtons.filter((el) => isVisible(el));
  const roleHints = visibleButtons.map((button) =>
    detectCopyButtonRoleHint(button, config)
  );
  const nonUserButtonCount = roleHints.filter((hint) => hint !== 'user').length;
  const assistantButtons = visibleButtons;
  const fallback = toElements<HTMLElement>(config.assistantMessageSelector).map((node) =>
    normalizeText(node.innerText || node.textContent || '')
  );

  if (assistantButtons.length === 0) {
    return {
      messages: fallback,
      userCopies: [],
      debug: {
        copyButtonsTotal: allButtons.length,
        copyButtonsVisible: visibleButtons.length,
        copyButtonsAfterUserFilter: 0,
        clipboardCaptures: 0,
        filteredByRoleHintCount: 0,
        fallbackCount: fallback.length,
        usedFallbackCount: fallback.length,
        fromButtonFallbackCount: 0,
        filteredAsUserMatchCount: 0,
        userCopyReplacementsCount: 0,
        emptyCount: fallback.filter((value) => !value).length
      }
    };
  }

  const captured: string[] = [];
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (const button of assistantButtons) {
      hover(button);
      button.click();
      await wait(220);
    }
    await waitFor(() => captured.length >= assistantButtons.length, 3000, 100);
  } finally {
    stopIntercept();
  }

  let usedFallbackCount = 0;
  let fromButtonFallbackCount = 0;
  let filteredByRoleHintCount = 0;
  const rawMessages = assistantButtons.map((_, idx) => {
    const copied = captured[idx] || '';
    const selectorFallback = fallback[idx] || '';
    const buttonFallback = extractAssistantTextFromCopyButton(assistantButtons[idx]);
    const value = copied || selectorFallback || buttonFallback || '';
    if (!copied && (selectorFallback || buttonFallback)) {
      usedFallbackCount += 1;
    }
    if (!copied && !selectorFallback && buttonFallback) {
      fromButtonFallbackCount += 1;
    }
    return value;
  });

  const userCanonical = users.map(toCanonicalText);
  const userCopyMatches = new Array<string>(users.length);
  let filteredAsUserMatchCount = 0;
  const messages: string[] = [];
  for (let idx = 0; idx < rawMessages.length; idx += 1) {
    const value = rawMessages[idx];
    if (!value) continue;

    const hint = roleHints[idx];
    const canonical = toCanonicalText(value);
    const matchedUserIndex = canonical
      ? userCanonical.findIndex(
          (candidate, userIdx) => candidate === canonical && !userCopyMatches[userIdx]
        )
      : -1;

    if (hint === 'user') {
      filteredByRoleHintCount += 1;
      if (matchedUserIndex !== -1) {
        userCopyMatches[matchedUserIndex] = value;
        filteredAsUserMatchCount += 1;
      }
      continue;
    }

    if (matchedUserIndex !== -1) {
      userCopyMatches[matchedUserIndex] = value;
      filteredAsUserMatchCount += 1;
      continue;
    }

    messages.push(value);
  }
  const userCopyReplacementsCount = userCopyMatches.filter(Boolean).length;

  return {
    messages,
    userCopies: userCopyMatches,
    debug: {
      copyButtonsTotal: allButtons.length,
      copyButtonsVisible: visibleButtons.length,
      copyButtonsAfterUserFilter: nonUserButtonCount,
      clipboardCaptures: captured.length,
      filteredByRoleHintCount,
      fallbackCount: fallback.length,
      usedFallbackCount,
      fromButtonFallbackCount,
      filteredAsUserMatchCount,
      userCopyReplacementsCount,
      emptyCount: messages.filter((value) => !value).length
    }
  };
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

function triggerDownload(filename: string, content: string): void {
  const mime = filename.endsWith('.json')
    ? 'application/json;charset=utf-8'
    : 'text/markdown;charset=utf-8';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  return cleaned || 'conversation-export';
}

function formatTimestampForFilename(isoTimestamp: string): string {
  return isoTimestamp.replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
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

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function toCanonicalText(value: string): string {
  const normalized = normalizeText(value)
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, '').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .replace(/^(user|human)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'")) ||
    (normalized.startsWith('“') && normalized.endsWith('”'))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
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

function dispatchEscape(target: HTMLElement): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true
    })
  );
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
