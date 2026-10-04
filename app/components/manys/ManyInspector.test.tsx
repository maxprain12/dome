import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ManyInspector, { INSPECTOR_TABS } from './ManyInspector';
import { request, type ManyDetail } from '@/lib/manys/api';

vi.mock('@/lib/manys/api', () => ({ request: vi.fn() }));

const detail: ManyDetail = {
  many: { id: 'many-test', name: 'Peregrini', instructions: '', grant_revision: 1, grants: { projects: [], resources: [], capabilities: ['vault.read', 'computer.read', 'computer.write'] } },
  conversations: [{ id: 'c' }], tasks: [], messages: [], actions: [], recurrences: [], conflicts: [], computer: { control: 'agent' },
};

beforeEach(() => {
  vi.mocked(request).mockReset().mockResolvedValue({ state: 'running' });
});

describe('the inspector tabs', () => {
  it('names every tab with a real label, never an i18n error', () => {
    render(<ManyInspector tab="computer" onTab={() => undefined} detail={detail} busy={false} perform={async () => undefined} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(INSPECTOR_TABS.length);
    for (const tab of tabs) {
      expect(tab.textContent?.trim()).toBeTruthy();
      expect(tab.textContent).not.toMatch(/returned an object|key '|manys\./i);
    }
    expect(tabs[0]).toHaveTextContent(/Computer|Ordenador|Ordinateur|Computador/);
  });

  it('keeps every tab reachable in a narrow panel by letting the bar wrap', () => {
    render(<ManyInspector tab="computer" onTab={() => undefined} detail={detail} busy={false} perform={async () => undefined} />);
    expect(screen.getAllByRole('tablist')[0].className).toMatch(/flex-wrap/);
    expect(screen.getAllByRole('tablist')[0].className).not.toMatch(/overflow-x-auto/);
  });
});
