import { expect, it, vi } from 'vitest';
import { createArtifactSaveQueue } from './artifactSaveQueue';

it('coalesces keystrokes and flushes the last edit before closing', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const queue = createArtifactSaveQueue(save, vi.fn(), 10000);
  queue.enqueue({ text: 'a' });
  queue.enqueue({ text: 'ab' });
  await queue.flush();
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith({ text: 'ab' });
});

it('serializes edits that arrive during a pending save', async () => {
  let release!: () => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
  const queue = createArtifactSaveQueue(save, vi.fn(), 10000);
  queue.enqueue({ n: 1 });
  const first = queue.flush();
  queue.enqueue({ n: 2 });
  expect(save).toHaveBeenCalledTimes(1);
  release();
  await first;
  expect(save.mock.calls.map((call) => call[0])).toEqual([{ n: 1 }, { n: 2 }]);
});

it('surfaces failed saves instead of reporting success', async () => {
  const status = vi.fn();
  const queue = createArtifactSaveQueue(vi.fn().mockRejectedValue(new Error('Disk error')), status);
  queue.enqueue({ x: 1 });
  expect(await queue.flush()).toBe(false);
  expect(queue.isPending()).toBe(true);
  expect(status).toHaveBeenLastCalledWith(false, 'Disk error');
});
