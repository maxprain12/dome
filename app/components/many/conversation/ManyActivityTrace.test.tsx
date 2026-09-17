import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import ManyActivityTrace from './ManyActivityTrace';
import { activityTraceCopyFromT, type ActivityTraceRow } from '@/lib/chat/manyActivityTrace';

const copy = activityTraceCopyFromT((key, opts) => {
  if (key === 'trace_ran_tools') return `Used ${String(opts?.count ?? '')}`;
  if (key === 'trace_steps_done') return `Steps ${String(opts?.count ?? '')}`;
  if (key === 'trace_more_results') return `+${String(opts?.count ?? '')} more`;
  return key;
});

const stepRows: ActivityTraceRow[] = [
  { id: 'ok', primary: 'Listed events', status: 'success', toolCallId: 'ok' },
  { id: 'bad', primary: 'Broken step', status: 'error', toolCallId: 'bad' },
  { id: 'run', primary: 'Still running', status: 'running', toolCallId: 'run' },
];

describe('ManyActivityTrace', () => {
  it('auto-expands while working and collapses when the work completes', () => {
    const { rerender } = render(
      <ManyActivityTrace kind="steps" working copy={copy} count={2} rows={stepRows} />,
    );
    const trigger = screen.getByRole('button', { name: 'trace_running_tools' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    rerender(<ManyActivityTrace kind="steps" working={false} copy={copy} count={2} rows={stepRows} />);
    expect(screen.getByRole('button', { name: 'Steps 2' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps a manual collapse while work continues', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ManyActivityTrace kind="search" working copy={copy} query="collapsible" />,
    );
    await user.click(screen.getByRole('button', { name: 'trace_searching' }));
    expect(screen.getByRole('button', { name: 'trace_searching' })).toHaveAttribute('aria-expanded', 'false');

    rerender(<ManyActivityTrace kind="search" working copy={copy} query="collapsible" />);
    expect(screen.getByRole('button', { name: 'trace_searching' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles from the keyboard after completion', async () => {
    const user = userEvent.setup();
    render(
      <ManyActivityTrace
        kind="reasoning"
        working={false}
        copy={copy}
        reasoning="Need a compact trace."
      />,
    );
    const trigger = screen.getByRole('button', { name: 'trace_reasoning_done' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Need a compact trace.')).toBeInTheDocument();
  });

  it('selects a row, keeps status styles, and shows its detail', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [selectedId, setSelectedId] = useState<string | null>(null);
      return (
        <ManyActivityTrace
          kind="steps"
          working
          copy={copy}
          rows={stepRows}
          selectedId={selectedId}
          onSelectRow={(row) => setSelectedId(row.id)}
          renderDetail={(row) => <div>detail:{row.id}</div>}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText('Broken step')).toHaveClass('text-destructive');
    await user.click(screen.getByRole('button', { name: /Broken step/ }));
    expect(screen.getByRole('button', { name: /Broken step/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('detail:bad')).toBeInTheDocument();
    expect(screen.getByText('Still running')).toBeInTheDocument();
    expect(screen.getByText('Listed events')).toBeInTheDocument();
  });

  it('opens search hits as links', async () => {
    const user = userEvent.setup();
    render(
      <ManyActivityTrace
        kind="search"
        working={false}
        copy={copy}
        query="many traces"
        linkMode="anchor"
        rows={[
          {
            id: 'hit',
            primary: 'Dome docs',
            secondary: 'dome.app',
            href: 'https://dome.app/docs',
            status: 'success',
          },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'trace_searched' }));
    const link = screen.getByRole('link', { name: /Dome docs/ });
    expect(link).toHaveAttribute('href', 'https://dome.app/docs');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
