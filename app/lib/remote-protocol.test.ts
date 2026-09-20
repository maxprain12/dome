import { describe, expect, it } from 'vitest';
import {
  REMOTE_COMMAND_TYPES,
  REMOTE_EVENT_TYPES,
  isRemoteCommandType,
  isRemoteEventType,
} from './remote-protocol';

describe('remote-protocol renderer contract', () => {
  it('exposes refs.*, mode.set, plan and visual', () => {
    expect(REMOTE_COMMAND_TYPES).toContain('refs.list');
    expect(REMOTE_COMMAND_TYPES).toContain('refs.preview');
    expect(REMOTE_COMMAND_TYPES).toContain('refs.export');
    expect(REMOTE_COMMAND_TYPES).toContain('mode.set');
    expect(REMOTE_EVENT_TYPES).toContain('plan');
    expect(REMOTE_EVENT_TYPES).toContain('visual');
    expect(REMOTE_EVENT_TYPES).toContain('refs');
    expect(isRemoteCommandType('mode.set')).toBe(true);
    expect(isRemoteEventType('plan')).toBe(true);
    expect(isRemoteCommandType('unknown')).toBe(false);
  });
});
