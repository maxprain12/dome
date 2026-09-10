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
