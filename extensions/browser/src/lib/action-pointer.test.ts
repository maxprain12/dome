import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { hideActionPointer, showActionPointer } from './action-pointer';
let field: HTMLInputElement;
beforeEach(() => {
  vi.useFakeTimers();
  field = document.createElement('input');
  field.scrollIntoView = vi.fn();
  document.body.append(field);
});
afterEach(() => {
  hideActionPointer();
  document.body.replaceChildren();
  vi.useRealTimers();
});
it('removes the visual pointer and cancels the pending action when stopped', async () => {
  const ready = showActionPointer(field, []);
  expect(document.querySelector('[data-dome-agent-ui=pointer]')).not.toBeNull();
  await vi.advanceTimersByTimeAsync(20);
  hideActionPointer();
  await vi.advanceTimersByTimeAsync(300);
  expect(await ready).toBe(false);
  expect(document.querySelector('[data-dome-agent-ui=pointer]')).toBeNull();
});
it('shows feedback without intercepting input, then removes itself', async () => {
  const ready = showActionPointer(field, []);
  const overlay = document.querySelector<HTMLElement>('[data-dome-agent-ui=pointer]')!;
  expect(overlay.style.pointerEvents).toBe('none');
  await vi.advanceTimersByTimeAsync(300);
  expect(await ready).toBe(true);
  await vi.advanceTimersByTimeAsync(1200);
  expect(overlay.isConnected).toBe(false);
});
