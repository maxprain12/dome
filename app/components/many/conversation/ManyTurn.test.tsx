import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ManyTurn from './ManyTurn';
import type { ManyMessageData } from '@/lib/many/types';
const { renderMessage } = vi.hoisted(() => ({ renderMessage: vi.fn() }));
vi.mock('./ManyMessageView', () => ({ default: ({ message }: { message: ManyMessageData }) => { renderMessage(message); return <p>{message.content}</p>; } }));
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
    const view = render(<ManyTurn messages={[message]} onRegenerate={regenerate} />);
    expect(renderMessage).toHaveBeenCalledTimes(1);
    view.rerender(<ManyTurn messages={[message]} onRegenerate={regenerate} />);
    expect(renderMessage).toHaveBeenCalledTimes(1);
    view.rerender(<ManyTurn messages={[{ ...message, toolCalls: [] }]} onRegenerate={regenerate} />);
    expect(renderMessage).toHaveBeenCalledTimes(2);
    view.rerender(<ManyTurn messages={[message]} onRegenerate={vi.fn()} />);
    expect(renderMessage).toHaveBeenCalledTimes(3);
  });
});
