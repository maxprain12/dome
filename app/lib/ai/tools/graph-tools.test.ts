import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectRelatedResources,
  createGraphTools,
  rankRelatedResources,
} from './graph-tools';

describe('collectRelatedResources', () => {
  it('aggregates relations and strength for the other endpoint', () => {
    const related = collectRelatedResources(
      [
        { source: 'a', target: 'b', similarity: 0.4, relation_type: 'similar' },
        { source: 'c', target: 'a', similarity: 0.5, relation_type: 'manual' },
        { source: 'a', target: 'b', similarity: 0.3, relation_type: 'similar' },
        { source: 'a', target: 'a', similarity: 0.9, relation_type: 'self' },
      ],
      'a',
    );

    expect(related.get('b')?.relations).toEqual(['similar']);
    expect(related.get('b')?.strength).toBeCloseTo(0.7);
    expect(related.get('c')).toEqual({ relations: ['manual'], strength: 0.5 });
    expect(related.has('a')).toBe(false);
  });

  it('keeps distinct relation types on the same neighbor', () => {
    const related = collectRelatedResources(
      [
        { source: 'a', target: 'b', similarity: 0.3, relation_type: 'similar' },
        { source: 'a', target: 'b', similarity: 0.1, relation_type: 'manual' },
      ],
      'a',
    );

    expect(related.get('b')).toEqual({
      relations: ['similar', 'manual'],
      strength: 0.4,
    });
  });
});

describe('rankRelatedResources', () => {
  it('sorts by strength descending and applies default limit 10', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      title: `T${i}`,
      type: 'note',
      relations: ['similar'],
      strength: i,
      updated_at: i,
    }));

    const ranked = rankRelatedResources(rows);
    expect(ranked).toHaveLength(10);
    expect(ranked[0]?.id).toBe('r11');
    expect(ranked[9]?.id).toBe('r2');
  });

  it('respects an explicit limit', () => {
    const rows = [
      {
        id: 'weak',
        title: 'Weak',
        type: 'note',
        relations: ['similar'],
        strength: 0.1,
        updated_at: 1,
      },
      {
        id: 'strong',
        title: 'Strong',
        type: 'note',
        relations: ['manual'],
        strength: 0.9,
        updated_at: 2,
      },
    ];

    expect(rankRelatedResources(rows, 1).map((r) => r.id)).toEqual(['strong']);
  });
});

describe('get_related_resources tool', () => {
  const getGraph = vi.fn();
  const getById = vi.fn();

  beforeEach(() => {
    getGraph.mockReset();
    getById.mockReset();
    Object.defineProperty(window, 'electron', {
      configurable: true,
      writable: true,
      value: {
        invoke: vi.fn(),
        on: vi.fn(() => vi.fn()),
        db: {
          semantic: { getGraph },
          resources: { getById },
        },
      },
    });
  });

  function getRelatedTool() {
    const tool = createGraphTools().find((t) => t.name === 'get_related_resources');
    expect(tool).toBeDefined();
    return tool!;
  }

  it('returns ranked related resources from the semantic graph', async () => {
    getGraph.mockResolvedValue({
      success: true,
      data: {
        nodes: [],
        edges: [
          { source: 'focus', target: 'b', similarity: 0.4, relation_type: 'similar' },
          { source: 'c', target: 'focus', similarity: 0.8, relation_type: 'manual' },
        ],
      },
    });
    getById.mockImplementation(async (id: string) => {
      if (id === 'b') {
        return {
          success: true,
          data: { id: 'b', title: 'Beta', type: 'note', updated_at: 10 },
        };
      }
      if (id === 'c') {
        return {
          success: true,
          data: { id: 'c', title: 'Gamma', type: 'pdf', updated_at: 20 },
        };
      }
      return { success: false, error: 'missing' };
    });

    const result = await getRelatedTool().execute('tc-1', {
      resource_id: 'focus',
      min_weight: 0.3,
      limit: 10,
    });

    expect(getGraph).toHaveBeenCalledWith('focus', 0.3);
    expect(result.isError).toBeFalsy();
    expect(result.details).toEqual({
      status: 'success',
      resource_id: 'focus',
      related_count: 2,
      related_resources: [
        {
          id: 'c',
          title: 'Gamma',
          type: 'pdf',
          relations: ['manual'],
          strength: 0.8,
          updated_at: 20,
        },
        {
          id: 'b',
          title: 'Beta',
          type: 'note',
          relations: ['similar'],
          strength: 0.4,
          updated_at: 10,
        },
      ],
    });
  });

  it('skips neighbors that fail resource lookup', async () => {
    getGraph.mockResolvedValue({
      success: true,
      data: {
        nodes: [],
        edges: [
          { source: 'focus', target: 'gone', similarity: 0.5, relation_type: 'similar' },
          { source: 'focus', target: 'ok', similarity: 0.2, relation_type: 'similar' },
        ],
      },
    });
    getById.mockImplementation(async (id: string) => {
      if (id === 'ok') {
        return {
          success: true,
          data: { id: 'ok', title: 'Ok', type: 'note', updated_at: 1 },
        };
      }
      return { success: false, error: 'not found' };
    });

    const result = await getRelatedTool().execute('tc-2', {
      resource_id: 'focus',
      limit: 5,
    });

    expect(result.details).toMatchObject({
      status: 'success',
      related_count: 1,
      related_resources: [{ id: 'ok', title: 'Ok' }],
    });
  });

  it('returns an error when getGraph fails', async () => {
    getGraph.mockResolvedValue({ success: false, error: 'boom' });

    const result = await getRelatedTool().execute('tc-3', { resource_id: 'focus' });

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ status: 'error', error: 'boom' });
  });
});
