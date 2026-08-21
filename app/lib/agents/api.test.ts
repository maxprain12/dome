import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAgentsConfig, parseAgentsConfig } from './api';
import type { ManyAgent } from '@/types';

vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils')>('@/lib/utils');
  return {
    ...actual,
    generateId: vi.fn(() => 'id-fixed'),
  };
});

describe('exportAgentsConfig', () => {
  it('pretty-prints agents as JSON', () => {
    const agents: ManyAgent[] = [
      {
        id: 'a1',
        projectId: 'default',
        name: 'Alpha',
        description: '',
        systemInstructions: '',
        toolIds: [],
        mcpServerIds: [],
        iconIndex: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(JSON.parse(exportAgentsConfig(agents))).toEqual(agents);
  });
});

describe('parseAgentsConfig', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  it('parses a single agent object and assigns a new id', () => {
    const result = parseAgentsConfig(
      JSON.stringify({
        name: ' Researcher ',
        description: 'd',
        systemInstructions: 'sys',
        toolIds: ['t1'],
        mcpServerIds: ['m1'],
        skillIds: ['s1'],
        iconIndex: 5,
        folderId: 'fold-1',
        favorite: true,
        projectId: 'proj-a',
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      id: 'id-fixed',
      projectId: 'proj-a',
      name: 'Researcher',
      description: 'd',
      systemInstructions: 'sys',
      toolIds: ['t1'],
      mcpServerIds: ['m1'],
      skillIds: ['s1'],
      iconIndex: 5,
      folderId: 'fold-1',
      favorite: true,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    });
  });

  it('parses an array and skips non-object entries', () => {
    const result = parseAgentsConfig(
      JSON.stringify([{ name: 'One' }, null, 'x', { name: 'Two', favorite: false }]),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map((a) => a.name)).toEqual(['One', 'Two']);
    expect(result.data[1]?.favorite).toBe(false);
    expect(result.data[1]?.folderId).toBeUndefined();
    expect(result.data[0]?.projectId).toBe('default');
    expect(result.data[0]?.iconIndex).toBe(1);
  });

  it('rejects an agent missing a name', () => {
    const result = parseAgentsConfig(JSON.stringify([{ name: '  ' }, { name: 'Ok' }]));
    expect(result).toEqual({
      success: false,
      error: 'Agente 1: falta el nombre',
    });
  });

  it('rejects when no valid agents remain', () => {
    expect(parseAgentsConfig(JSON.stringify([null, 1, true]))).toEqual({
      success: false,
      error: 'No se encontraron agentes válidos en el archivo',
    });
  });

  it('rejects invalid JSON', () => {
    const result = parseAgentsConfig('{');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('clamps iconIndex outside 1..18 to 1', () => {
    const low = parseAgentsConfig(JSON.stringify({ name: 'A', iconIndex: 0 }));
    const high = parseAgentsConfig(JSON.stringify({ name: 'B', iconIndex: 99 }));
    expect(low.success && low.data[0]?.iconIndex).toBe(1);
    expect(high.success && high.data[0]?.iconIndex).toBe(1);
  });
});
