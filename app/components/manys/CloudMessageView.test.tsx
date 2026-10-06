import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CloudMessageView from './CloudMessageView';
import { ManysHostProvider } from './ManysHost';
import type { ManyMessageData } from '@/lib/many/types';

const assistant = (patch: Partial<ManyMessageData> = {}): ManyMessageData => ({ id: 'a', role: 'assistant', content: 'Hello **world**', timestamp: 1, ...patch });

describe('CloudMessageView', () => {
  it('shows what the person said as a plain bubble', () => {
    render(<CloudMessageView message={{ id: 'u', role: 'user', content: 'Find <b>this</b>', timestamp: 1 }} isLastInGroup />);
    expect(screen.getByText('Find <b>this</b>')).toBeInTheDocument();
  });

  it('draws the reply as Markdown, with tables, and never as HTML', () => {
    const content = 'Hello **world**\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>';
    const { container } = render(<CloudMessageView message={assistant({ content })} isLastInGroup />);
    expect(container.querySelector('strong')).toHaveTextContent('world');
    expect(container.querySelector('table td')).toHaveTextContent('1');
    expect(container.querySelector('script')).toBeNull();
  });

  it('puts the tool calls where they happened in the reply', () => {
    const message = assistant({
      content: 'Let me check.Found it.',
      toolCalls: [{ id: 'c1', name: 'web_research', arguments: { operation: 'search' }, status: 'success', contentOffset: 'Let me check.'.length }],
    });
    const { container } = render(<CloudMessageView message={message} isLastInGroup />);
    const text = container.textContent ?? '';
    expect(text.indexOf('Let me check.')).toBeLessThan(text.indexOf('Found it.'));
    expect(container.querySelector('[data-kind]')).not.toBeNull();
  });

  it('shows a status while the reply has not started and a copy button once it is done', () => {
    const waiting = render(<CloudMessageView message={assistant({ content: '', isStreaming: true })} isLastInGroup />);
    expect(waiting.container.querySelector('[role="status"]')).not.toBeNull();
    waiting.unmount();
    render(<CloudMessageView message={assistant()} isLastInGroup />);
    expect(screen.getByRole('button', { name: /Copy message|Copiar mensaje/ })).toBeInTheDocument();
  });

  it('opens links in a new tab, or where the host says', () => {
    const message = assistant({ content: '[docs](https://example.com/docs)' });
    const alone = render(<CloudMessageView message={message} isLastInGroup />);
    const plain = alone.container.querySelector('a');
    expect(plain).toHaveAttribute('href', 'https://example.com/docs');
    expect(plain).toHaveAttribute('target', '_blank');
    alone.unmount();
    const openLink = vi.fn();
    const hosted = render(<ManysHostProvider value={{ openLink }}><CloudMessageView message={message} isLastInGroup /></ManysHostProvider>);
    fireEvent.click(hosted.container.querySelector('a') as HTMLAnchorElement);
    expect(openLink).toHaveBeenCalledWith('https://example.com/docs');
  });
});
