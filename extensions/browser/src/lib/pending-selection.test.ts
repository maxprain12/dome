import { describe, expect, it } from 'vitest';
import { consumePendingSelection, setPendingSelection, subscribePendingSelection } from './pending-selection';

describe('pending selection', () => {
  it('replays the latest excerpt to new subscribers', () => {
    const seen: string[] = [];
    setPendingSelection('one');
    const stop = subscribePendingSelection((text) => seen.push(text));
    expect(seen).toEqual(['one']);
    expect(consumePendingSelection()).toBe('one');
    expect(consumePendingSelection()).toBeNull();
    stop();
  });
});
