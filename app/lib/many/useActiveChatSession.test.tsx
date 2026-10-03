import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { expect, test } from 'vitest';
import { useActiveChatSession } from './useActiveChatSession';
import { useManyStore } from '@/lib/store/useManyStore';
import TabPaneShell from '@/components/shell/TabPaneShell';
function Draft({ id }: { id: string }) { const [value, setValue] = useState(''); return <input aria-label={id} value={value} onChange={e => setValue(e.target.value)} />; }
function Router({ active }: { active: string | undefined }) {
  useActiveChatSession(active);
  const messages = useManyStore(s => s.messages);
  return <><p>{messages[0]?.content}</p>{['A', 'B'].map(id => <TabPaneShell key={id} tabId={id} isActive={id === active} isPersistent><Draft id={id} /></TabPaneShell>)}</>;
}
test('A to B to A restores the transcript while mounted drafts and run indicators survive sidebar navigation', () => {
  const sessions = ['A', 'B'].map(id => ({ id, title: id, createdAt: 1, messages: [{ id, role: 'user' as const, content: `Transcript ${id}`, timestamp: 1 }] }));
  useManyStore.setState({ sessions, currentSessionId: 'B', messages: sessions[1].messages, activeRunBySessionId: { A: 'streaming' } });
  const { rerender } = render(<Router active="A" />);
  expect(screen.getByText('Transcript A')).toBeVisible(); fireEvent.change(screen.getByRole('textbox', { name: 'A' }), { target: { value: 'Draft A' } });
  rerender(<Router active="B" />); expect(useManyStore.getState().currentSessionId).toBe('B'); expect(screen.getByText('Transcript B')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'B' }), { target: { value: 'Draft B' } });
  rerender(<Router active={undefined} />); expect(useManyStore.getState().currentSessionId).toBe('B');
  rerender(<Router active="A" />); expect(useManyStore.getState().currentSessionId).toBe('A'); expect(screen.getByText('Transcript A')).toBeVisible(); expect(screen.getByRole('textbox', { name: 'A' })).toHaveValue('Draft A'); expect(useManyStore.getState().activeRunBySessionId.A).toBe('streaming');
  rerender(<Router active="B" />); expect(screen.getByRole('textbox', { name: 'B' })).toHaveValue('Draft B');
});
