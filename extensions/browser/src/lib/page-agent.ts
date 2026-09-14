import { showActionPointer } from './action-pointer';
import { extractContact } from './extractors';
import { getPageSnapshot } from './page-content';
import { inViewport, pageRoots, rendered } from './page-dom';

export interface BrowserElement {
  id: string;
  label: string;
  role: string;
  href?: string;
  inputType?: string;
  inViewport?: boolean;
  disabled?: boolean;
  checked?: boolean;
  expanded?: string;
  scrollable?: boolean;
  options?: Array<{ value: string; label: string; disabled: boolean }>;
}
export type ElementAction = {
  kind: 'click' | 'fill' | 'select' | 'scroll';
  snapshotId: string;
  elementId: string;
  value?: string;
  direction?: 'up' | 'down' | 'top' | 'bottom';
};

export function createPageAgent(doc: Document = document) {
  let snapshotId = '';
  let snapshotUrl = '';
  const elements = new Map<string, { node: HTMLElement; signature: string; frames: HTMLIFrameElement[] }>();
  const label = (node: HTMLElement) => {
    const labelled = node.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => node.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim();
    return (node.getAttribute('aria-label') || labelled ||
      (node as HTMLInputElement).labels?.[0]?.textContent || node.getAttribute('placeholder') ||
      node.innerText || node.textContent || node.getAttribute('title') || node.getAttribute('name') || node.tagName).trim().slice(0, 160);
  };
  const disabled = (node: HTMLElement) => node.matches(':disabled, [aria-disabled="true"]');
  const sensitive = (node: HTMLElement) =>
    /password|file|hidden/.test((node as HTMLInputElement).type || '') ||
    /cc-|one-time-code|current-password|new-password/.test(node.getAttribute('autocomplete') || '');
  const signature = (node: HTMLElement) => JSON.stringify([
    node.tagName, label(node), node.getAttribute('href'), node.getAttribute('type'),
    node.getAttribute('role'), node.getAttribute('onclick'), disabled(node), node.getAttribute('aria-expanded'),
    node.tagName === 'SELECT' ? Array.from((node as HTMLSelectElement).options).map((option) => [option.value, option.text, option.disabled]) : null,
  ]);
  const scrollable = (node: HTMLElement) => node.scrollHeight > node.clientHeight + 4 &&
    /auto|scroll/.test(node.ownerDocument.defaultView?.getComputedStyle(node).overflowY || '');
  const visible = (node: HTMLElement) => node.isConnected && node.getClientRects().length > 0 && rendered(node);
  function read() {
    snapshotId = crypto.randomUUID();
    snapshotUrl = doc.location.href;
    elements.clear();
    const candidates = pageRoots(doc).roots.flatMap(({ root, frames }) =>
      Array.from(root.querySelectorAll<HTMLElement>('*'))
        .filter((node) => visible(node) && !sensitive(node) &&
          (node.matches('a[href], button, input, textarea, select, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"], [role="combobox"], [role="menuitem"], [role="option"], [tabindex], [onclick]') || scrollable(node)))
        .map((node) => ({ node, frames })),
    );
    candidates.sort((a, b) => Number(inViewport(b.node) && b.frames.every(inViewport)) - Number(inViewport(a.node) && a.frames.every(inViewport)));
    const inventory: BrowserElement[] = candidates.slice(0, 200).map(({ node, frames }, index) => {
      const id = `e${index + 1}`;
      elements.set(id, { node, signature: signature(node), frames });
      return {
        id, label: label(node), role: node.getAttribute('role') || node.tagName.toLowerCase(),
        href: node.tagName === 'A' ? (node as HTMLAnchorElement).href : undefined,
        inputType: node.getAttribute('type') || undefined,
        inViewport: inViewport(node) && frames.every(inViewport), disabled: disabled(node),
        checked: node.matches('input[type=checkbox], input[type=radio]') ? (node as HTMLInputElement).checked : undefined,
        expanded: node.getAttribute('aria-expanded') || undefined,
        scrollable: scrollable(node),
        options: node.tagName === 'SELECT' ? Array.from((node as HTMLSelectElement).options).slice(0, 80).map((option) => ({ value: option.value, label: option.text, disabled: option.disabled || option.parentElement?.matches('optgroup:disabled') === true })) : undefined,
      };
    });
    return {
      ...getPageSnapshot(doc, doc.location.href),
      contact: extractContact(doc, doc.location.href), snapshotId, elements: inventory,
      elementsTruncated: candidates.length > inventory.length,
    };
  }
  function act(action: ElementAction) {
    const item = elements.get(action.elementId);
    if (action.snapshotId !== snapshotId || snapshotUrl !== doc.location.href || !item ||
      !visible(item.node) || item.frames.some((frame, index) => !visible(frame) || (index + 1 < item.frames.length && frame.contentDocument !== item.frames[index + 1].ownerDocument)) ||
      (item.frames.length > 0 && item.frames.at(-1)?.contentDocument !== item.node.ownerDocument) ||
      signature(item.node) !== item.signature || sensitive(item.node) || disabled(item.node))
      return { success: false, error: 'Page changed or target unavailable. Read a new snapshot.' };
    const node = item.node;
    const win = node.ownerDocument.defaultView!;
    if (action.kind === 'scroll') {
      if (!scrollable(node)) return { success: false, error: 'Target is not a scrollable panel.' };
      node.scrollTo({ top: action.direction === 'top' ? 0 : action.direction === 'bottom' ? node.scrollHeight : node.scrollTop + node.clientHeight * 0.75 * (action.direction === 'up' ? -1 : 1), behavior: 'auto' });
    } else if (action.kind === 'click') {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      node.click();
    } else if (action.kind === 'select') {
      if (node.tagName !== 'SELECT') return { success: false, error: 'Use select only with a native select; click custom options.' };
      const select = node as HTMLSelectElement;
      const option = Array.from(select.options).find((entry) => entry.value === action.value);
      if (!option || option.disabled || option.parentElement?.matches('optgroup:disabled') || select.multiple)
        return { success: false, error: 'Option is unavailable or select is multiple.' };
      select.value = option.value;
      node.dispatchEvent(new win.Event('input', { bubbles: true }));
      node.dispatchEvent(new win.Event('change', { bubbles: true }));
    } else {
      const input = node as HTMLInputElement | HTMLTextAreaElement;
      if (!['INPUT', 'TEXTAREA'].includes(node.tagName) || input.readOnly ||
        !['text', 'search', 'url', 'email', 'tel', 'number', 'textarea'].includes(input.type))
        return { success: false, error: 'This field cannot be filled.' };
      const proto = Object.getPrototypeOf(node);
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(node, String(action.value || '').slice(0, 10000));
      node.dispatchEvent(new win.Event('input', { bubbles: true }));
      node.dispatchEvent(new win.Event('change', { bubbles: true }));
    }
    elements.clear();
    return { success: true, label: label(node), ...(action.kind === 'fill' ? { submitted: false } : {}) };
  }
  const point = async (action: ElementAction) => {
    const item = elements.get(action.elementId);
    if (!item || action.snapshotId !== snapshotId || snapshotUrl !== doc.location.href || !visible(item.node)) return false;
    return showActionPointer(item.node, item.frames);
  };
  return { read, act, point };
}
