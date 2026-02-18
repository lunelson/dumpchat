import type { SiteConfig } from './types';

export function toElements<T extends Element>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

export function uniqueElements<T extends Element>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

export function cleanActionLabels(value: string): string {
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

export function hover(node: HTMLElement): void {
  node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  node.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
}

export function isVisible(node: HTMLElement): boolean {
  return !!(node.offsetParent || node.getClientRects().length);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(
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

export function interceptClipboard(onWrite: (text: string) => void): () => void {
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

export function getVisibleUserNodes(config: SiteConfig): HTMLElement[] {
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
