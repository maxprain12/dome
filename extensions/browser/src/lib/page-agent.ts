import { extractContact } from './extractors';
import { getPageSnapshot } from './page-content';

export interface BrowserElement {
  id: string;
  label: string;
  role: string;
  href?: string;
  inputType?: string;
}
export function createPageAgent(doc: Document = document) {
  let snapshotId = '';
  let snapshotUrl = '';
  const elements = new Map<string, { node: HTMLElement; signature: string }>();
  const label = (node: HTMLElement) =>
    (
      node.getAttribute('aria-label') ||
      (node as HTMLInputElement).labels?.[0]?.textContent ||
      node.getAttribute('placeholder') ||
      node.innerText ||
      node.textContent ||
      node.getAttribute('title') ||
      node.getAttribute('name') ||
      node.tagName
    )
      .trim()
      .slice(0, 160);
  const signature = (node: HTMLElement) =>
    JSON.stringify([
      node.tagName,
      label(node),
      node.getAttribute('href'),
      node.getAttribute('type'),
    ]);
  const visible = (node: HTMLElement) =>
    node.isConnected &&
    node.getClientRects().length > 0 &&
    getComputedStyle(node).visibility !== 'hidden' &&
    !node.closest('[hidden], [inert], [aria-hidden="true"]');
  const sensitive = (node: HTMLElement) =>
    /password|file|hidden/.test((node as HTMLInputElement).type || '') ||
    /cc-|one-time-code|current-password|new-password/.test(
      node.getAttribute('autocomplete') || '',
    );
  function read() {
    snapshotId = crypto.randomUUID();
    snapshotUrl = doc.location.href;
    elements.clear();
    const candidates = Array.from(
      doc.querySelectorAll<HTMLElement>(
        'a[href], button, input, textarea, select, [role="button"], [role="link"]',
      ),
    )
      .filter((node) => visible(node) && !sensitive(node))
      .slice(0, 150);
    const inventory: BrowserElement[] = candidates.map((node, index) => {
      const id = `e${index + 1}`;
      elements.set(id, { node, signature: signature(node) });
      return {
        id,
        label: label(node),
        role: node.getAttribute('role') || node.tagName.toLowerCase(),
        href: node.getAttribute('href') || undefined,
        inputType: node.getAttribute('type') || undefined,
      };
    });
    return {
      ...getPageSnapshot(doc, doc.location.href),
      contact: extractContact(doc, doc.location.href),
      snapshotId,
      elements: inventory,
    };
  }
  function act(action: {
    kind: 'click' | 'fill';
    snapshotId: string;
    elementId: string;
    value?: string;
  }) {
    const item = elements.get(action.elementId);
    if (
      action.snapshotId !== snapshotId ||
      snapshotUrl !== doc.location.href ||
      !item ||
      !visible(item.node) ||
      signature(item.node) !== item.signature ||
      sensitive(item.node)
    )
      return { success: false, error: 'Page changed. Read a new snapshot.' };
    const node = item.node;
    if (action.kind === 'click') {
      node.click();
      elements.clear();
      return { success: true, label: label(node) };
    }
    if (
      !(
        node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
      ) ||
      node.disabled ||
      node.readOnly ||
      !['text', 'search', 'url', 'email', 'tel', 'number', 'textarea'].includes(
        node.type,
      )
    )
      return { success: false, error: 'This field cannot be filled.' };
    const proto =
      node instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(
      node,
      String(action.value || '').slice(0, 10000),
    );
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, label: label(node), submitted: false };
  }
  return { read, act };
}
