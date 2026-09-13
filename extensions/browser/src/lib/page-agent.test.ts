import { afterEach, expect, it, vi } from 'vitest';
import { createPageAgent } from './page-agent';
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });
it('uses fresh visible element references and refuses changed targets or sensitive fields', () => {
  document.body.innerHTML = '<main><h1>Profile</h1><input aria-label="Search"/><input type="password" aria-label="Password"/><button>Continue</button></main>';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const agent = createPageAgent();
  const snapshot = agent.read();
  expect(snapshot.elements.some(el => el.label === 'Password')).toBe(false);
  const input = snapshot.elements.find(el => el.label === 'Search')!;
  expect(agent.act({ kind: 'fill', snapshotId: snapshot.snapshotId, elementId: input.id, value: 'Ada' }).success).toBe(true);
  expect(document.querySelector('input')?.value).toBe('Ada');
  const button = snapshot.elements.find(el => el.label === 'Continue')!;
  document.querySelector('button')!.textContent = 'Delete account';
  expect(agent.act({ kind: 'click', snapshotId: snapshot.snapshotId, elementId: button.id }).success).toBe(false);
  const next = agent.read();
  expect(next.snapshotId).not.toBe(snapshot.snapshotId);
  expect(agent.act({ kind: 'fill', snapshotId: snapshot.snapshotId, elementId: input.id, value: 'Changed' }).success).toBe(false);
});

it('operates on iframe controls using their own DOM realm and returns dropdown options', () => {
  document.body.innerHTML = '<iframe></iframe>';
  const frame = document.querySelector('iframe')!;
  const child = frame.contentDocument!;
  child.body.innerHTML = '<input aria-label="Search dashboard"><select aria-label="Severity"><option value="all">All</option><option value="high">High</option><option disabled value="locked">Locked</option></select>';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  vi.spyOn(child.defaultView!.HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const agent = createPageAgent();
  const first = agent.read();
  const field = first.elements.find((element) => element.label === 'Search dashboard')!;
  expect(agent.act({ kind: 'fill', snapshotId: first.snapshotId, elementId: field.id, value: 'wind' }).success).toBe(true);
  expect(child.querySelector('input')?.value).toBe('wind');
  const next = agent.read();
  const select = next.elements.find((element) => element.label === 'Severity')!;
  expect(select.options?.find((option) => option.value === 'locked')?.disabled).toBe(true);
  expect(agent.act({ kind: 'select', snapshotId: next.snapshotId, elementId: select.id, value: 'locked' }).success).toBe(false);
  expect(agent.act({ kind: 'select', snapshotId: next.snapshotId, elementId: select.id, value: 'high' }).success).toBe(true);
  expect(child.querySelector('select')?.value).toBe('high');
  frame.hidden = true;
  expect(agent.act({ kind: 'fill', snapshotId: first.snapshotId, elementId: field.id, value: 'wrong' }).success).toBe(false);
});

it('refuses disabled controls and invalidates references after a fill', () => {
  document.body.innerHTML = '<input aria-label="Query"><button disabled>Delete</button>';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  const agent = createPageAgent();
  const first = agent.read();
  const disabled = first.elements.find((element) => element.label === 'Delete')!;
  expect(disabled.disabled).toBe(true);
  expect(agent.act({ kind: 'click', snapshotId: first.snapshotId, elementId: disabled.id }).success).toBe(false);
  const field = first.elements.find((element) => element.label === 'Query')!;
  expect(agent.act({ kind: 'fill', snapshotId: first.snapshotId, elementId: field.id, value: 'updated' }).success).toBe(true);
  expect(agent.act({ kind: 'fill', snapshotId: first.snapshotId, elementId: field.id, value: 'stale' }).success).toBe(false);
});
