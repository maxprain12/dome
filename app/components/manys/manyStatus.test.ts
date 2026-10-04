import { beforeEach, describe, expect, it, vi } from 'vitest';
import { delegateToMany, request, type ManyDetail, type Task } from '@/lib/manys/api';
import { isFailedTask, retryTask, summarizeMany } from './manyStatus';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn(), delegateToMany: vi.fn() }));

const task = (overrides: Partial<Task>): Task => ({ id: 't', prompt: 'Report', state: 'completed', question: null, result: null, ...overrides });
const detail = (tasks: Task[], overrides: Partial<ManyDetail> = {}): ManyDetail => ({
  many: { id: 'm', name: 'Research', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: [] } },
  conversations: [{ id: 'c' }], tasks, messages: [], actions: [], recurrences: [], conflicts: [], computer: null, ...overrides,
});

beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(delegateToMany).mockReset();
});

describe('summarizeMany', () => {
  it('reads the newest task first, as Provider returns them', () => {
    const newest = task({ id: 'new', state: 'completed' });
    const oldest = task({ id: 'old', state: 'paused', checkpoint: { reason: 'provider_key_missing' } });
    expect(summarizeMany(detail([newest, oldest])).lastFailed).toBeNull();
    expect(summarizeMany(detail([oldest, newest])).lastFailed?.id).toBe('old');
  });

  it('treats a paused task with a reason as a failure, because Provider never writes failed', () => {
    const paused = task({ state: 'paused', checkpoint: { reason: 'provider_key_missing' } });
    const summary = summarizeMany(detail([paused]));
    expect(isFailedTask(paused)).toBe(true);
    expect(summary.status).toBe('failed');
    expect(summary.lastFailed).toBe(paused);
    expect(summary.activeTasks).toHaveLength(0);
  });

  it('keeps a pause chosen by the person as paused', () => {
    const summary = summarizeMany(detail([task({ state: 'paused' })]));
    expect(summary.status).toBe('paused');
    expect(summary.lastFailed).toBeNull();
  });

  it('lets a pending decision outrank a failure', () => {
    const summary = summarizeMany(detail(
      [task({ state: 'paused', checkpoint: { reason: 'runtime_ended_without_outcome' } })],
      { actions: [{ id: 'a', digest: 'd', state: 'pending', expires_at: '', proposal: {}, receipt: null }] },
    ));
    expect(summary.status).toBe('waiting_approval');
  });
});

describe('retryTask', () => {
  it('resumes a paused task instead of sending its prompt again', async () => {
    vi.mocked(request).mockResolvedValue({});
    await retryTask('m', task({ id: 't1', state: 'paused', checkpoint: { reason: 'x' } }));
    expect(request).toHaveBeenCalledWith('/m/tasks/t1', 'PATCH', { action: 'resume' });
    expect(delegateToMany).not.toHaveBeenCalled();
  });

  it('sends a failed task again as a new one', async () => {
    vi.mocked(delegateToMany).mockResolvedValue(task({}));
    await retryTask('m', task({ state: 'failed', prompt: 'Report' }));
    expect(delegateToMany).toHaveBeenCalledWith('m', 'Report');
  });
});
