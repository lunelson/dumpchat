import {
  EXPORT_BUTTON_ID,
  HEALTH_BADGE_ID,
  POLL_MS,
  STATUS_ID,
  VERIFY_BUTTON_ID,
  detectSite,
  isConversationPage
} from './lib/dumpchat/config';
import {
  buildDiagnosticReport,
  collectExportData
} from './lib/dumpchat/extraction';
import type { HealthLevel, Site } from './lib/dumpchat/types';

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
    if (user) chunks.push(formatTurnSection(i + 1, 'User', user, location.href));
    if (assistant)
      chunks.push(formatTurnSection(i + 1, 'Assistant', assistant, location.href));
  }

  const markdown = [
    `# ${data.title}`,
    '',
    `- Source: ${site}`,
    `- URL: ${location.href}`,
    `- Exported: ${data.exportedAt}`,
    '- Format: XML-style turn markers with raw markdown bodies',
    '',
    chunks.join('\n\n')
  ].join('\n');

  const timestamp = formatTimestampForFilename(data.exportedAt);
  const filename = `${sanitizeFilename(data.title)}-${timestamp}.md`;

  return { filename, markdown };
}

function formatTurnSection(
  turnNumber: number,
  role: 'User' | 'Assistant',
  content: string,
  sourceUrl: string
): string {
  const index = String(turnNumber).padStart(3, '0');
  const openingTag = `<turn index="${index}" role="${role.toLowerCase()}" url="${escapeXmlAttribute(
    sourceUrl
  )}">`;
  const closingTag = '</turn>';
  return [openingTag, normalizeText(content), closingTag].join('\n\n');
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}
