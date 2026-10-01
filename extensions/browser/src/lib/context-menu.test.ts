import { describe, expect, it, vi } from 'vitest';
import { createContextMenuSetup } from './context-menu';

describe('context menu setup', () => {
  it('serializes startup/install and waits for Chrome create to finish', async () => {
    const items = new Set<string>();
    const operations: string[] = [];
    const setup = createContextMenuSetup({
      removeAll: async () => { operations.push('remove'); items.clear(); },
      create: (properties, callback) => {
        operations.push('create');
        expect(items.has(properties.id)).toBe(false);
        items.add(properties.id);
        queueMicrotask(callback);
        return properties.id;
      },
    }, () => 'Add selection', () => undefined);
    await Promise.all([setup(), setup()]);
    expect(operations).toEqual(['remove', 'create', 'remove', 'create']);
    expect([...items]).toEqual(['dome-add-selection']);
  });

  it('consumes lastError and allows recovery after a failed create', async () => {
    let failure: { message: string } | undefined = { message: 'Duplicate ID' };
    const readError = vi.fn(() => failure);
    const setup = createContextMenuSetup({removeAll: async () => {}, create: (_properties, callback) => { callback(); }}, () => 'Add selection', readError);
    await expect(setup()).rejects.toThrow('Duplicate ID');
    failure = undefined;
    await expect(setup()).resolves.toBeUndefined();
    expect(readError).toHaveBeenCalledTimes(2);
  });
});
