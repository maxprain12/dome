import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DashboardSectionCards } from './DashboardSectionCards';
import { DashboardDataTable } from './DashboardDataTable';
import { DashboardAreaChart } from './DashboardAreaChart';
import { buildActivityChartPoints } from './activityChart';

describe('buildActivityChartPoints', () => {
  it('fills missing days with zero for the selected range', () => {
    const now = Date.parse('2026-09-15T12:00:00');
    const points = buildActivityChartPoints({ '2026-09-15': 4 }, '7d', now);
    expect(points).toHaveLength(7);
    expect(points.at(-1)).toEqual({ date: '2026-09-15', value: 4 });
    expect(points[0]?.value).toBe(0);
  });
});

describe('DashboardSectionCards', () => {
  it('renders KPI labels and trend badges', () => {
    render(
      <DashboardSectionCards
        items={[
          { id: 'chats', label: 'Chats', value: 12, delta: 3 },
          { id: 'runs', label: 'Runs', value: 2, delta: -1 },
        ]}
      />,
    );
    expect(screen.getByText('Chats')).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('+3')).toBeVisible();
    expect(screen.getByText('Runs')).toBeVisible();
    expect(screen.getByText('-1')).toBeVisible();
  });
});

describe('DashboardDataTable', () => {
  it('switches tabs and opens a row', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const onRowClick = vi.fn();
    render(
      <DashboardDataTable
        tabs={[
          { id: 'activity', label: 'Activity', count: 1 },
          { id: 'pending', label: 'Pending', count: 0 },
        ]}
        tab="activity"
        onTabChange={onTabChange}
        columns={[{ id: 'title', header: 'Title', cell: (row) => row.title }]}
        rows={[{ id: 'a1', title: 'Research note' }]}
        onRowClick={onRowClick}
        emptyTitle="No rows"
      />,
    );
    expect(screen.getByText('Research note')).toBeVisible();
    await user.click(screen.getByText('Pending'));
    expect(onTabChange).toHaveBeenCalledWith('pending');
    await user.click(screen.getByText('Research note'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 'a1', title: 'Research note' });
  });

  it('keeps a long primary cell from painting into later columns', () => {
    render(
      <DashboardDataTable
        columns={[
          { id: 'title', header: 'Title', cell: (row) => row.title },
          { id: 'status', header: 'Status', className: 'w-[7rem]', cell: () => 'Open' },
        ]}
        rows={[
          {
            id: 'long',
            title:
              'A very long subject line that would otherwise collide with status and date columns in the mail table',
          },
        ]}
        emptyTitle="No rows"
      />,
    );
    const subject = screen.getByText(/A very long subject line/);
    expect(subject.closest('td')).toHaveClass('overflow-hidden');
    expect(screen.getByText('Open')).toBeVisible();
    expect(screen.getByText('Status')).toBeVisible();
  });
});

describe('DashboardAreaChart empty state', () => {
  it('shows the empty title when every point is zero', () => {
    render(
      <DashboardAreaChart
        title="Audience"
        data={[
          { date: '2026-09-14', value: 0 },
          { date: '2026-09-15', value: 0 },
        ]}
        range="7d"
        onRangeChange={() => undefined}
        valueLabel="Followers"
        rangeLabels={{ '7d': '7d', '30d': '30d', '90d': '90d' }}
        emptyTitle="No audience yet"
      />,
    );
    expect(screen.getByText('No audience yet')).toBeVisible();
  });
});
