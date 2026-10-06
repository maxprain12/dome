import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManyTurn from './ManyTurn';
import type { ManyMessageData, ManyMessageRenderer } from '@/lib/many/types';
const { drawn } = vi.hoisted(() => ({ drawn: vi.fn() }));
const renderMessage: ManyMessageRenderer = ({ message }) => { drawn(message); return <p>{message.content}</p>; };
vi.mock('@/components/ui/message', () => {
  const Element = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Message: Element, MessageAvatar: Element, MessageContent: Element, MessageGroup: Element };
});
vi.mock('@/components/ui/message-scroller', () => ({ MessageScrollerItem: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/many/ManyAvatar', () => ({ default: () => null }));
describe('historical Many turn rendering', () => {
  it('ignores regrouping on another streaming turn but renders actual message/tool changes', () => {
    const message: ManyMessageData = { id: 'old', role: 'assistant', content: 'Original', timestamp: 1 };
    const regenerate = vi.fn();
    const view = render(<ManyTurn messages={[message]} renderMessage={renderMessage} onRegenerate={regenerate} />);
    expect(drawn).toHaveBeenCalledTimes(1);
    view.rerender(<ManyTurn messages={[message]} renderMessage={renderMessage} onRegenerate={regenerate} />);
    expect(drawn).toHaveBeenCalledTimes(1);
    view.rerender(<ManyTurn messages={[{ ...message, toolCalls: [] }]} renderMessage={renderMessage} onRegenerate={regenerate} />);
    expect(drawn).toHaveBeenCalledTimes(2);
    view.rerender(<ManyTurn messages={[message]} renderMessage={renderMessage} onRegenerate={vi.fn()} />);
    expect(drawn).toHaveBeenCalledTimes(3);
  });

  it('hands each message to the renderer with its place in the turn and a regenerate only for the last assistant row', () => {
    const calls: Array<{ id: string; isLastInGroup: boolean; canRegenerate: boolean }> = [];
    const spy: ManyMessageRenderer = ({ message, isLastInGroup, onRegenerate }) => {
      calls.push({ id: message.id, isLastInGroup, canRegenerate: Boolean(onRegenerate) });
      return null;
    };
    const first: ManyMessageData = { id: 'a1', role: 'assistant', content: 'one', timestamp: 1 };
    const last: ManyMessageData = { id: 'a2', role: 'assistant', content: 'two', timestamp: 2 };
    render(<ManyTurn messages={[first, last]} renderMessage={spy} onRegenerate={vi.fn()} />);
    expect(calls).toEqual([
      { id: 'a1', isLastInGroup: false, canRegenerate: false },
      { id: 'a2', isLastInGroup: true, canRegenerate: true },
    ]);
  });
});
