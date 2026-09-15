import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type DashboardChartRange = '7d' | '30d' | '90d';

export type DashboardChartPoint = {
  date: string;
  value: number;
};

export function DashboardAreaChart({
  title,
  description,
  data,
  range,
  onRangeChange,
  valueLabel,
  rangeLabels,
  emptyTitle,
}: {
  title: string;
  description?: string;
  data: DashboardChartPoint[];
  range: DashboardChartRange;
  onRangeChange: (range: DashboardChartRange) => void;
  valueLabel: string;
  rangeLabels: Record<DashboardChartRange, string>;
  emptyTitle?: string;
}) {
  const chartConfig = {
    value: {
      label: valueLabel,
      color: 'var(--primary)',
    },
  } satisfies ChartConfig;

  const values = data.map((point) => point.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const pad = min === max ? Math.max(Math.abs(max) * 0.08, 1) : (max - min) * 0.2;
  const yDomain: [number, number] = [Math.max(0, min - pad), max + pad];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        <CardAction>
          <ToggleGroup
            value={[range]}
            onValueChange={(values) => {
              const next = values[0];
              if (next === '7d' || next === '30d' || next === '90d') onRangeChange(next);
            }}
          >
            <ToggleGroupItem value="90d">{rangeLabels['90d']}</ToggleGroupItem>
            <ToggleGroupItem value="30d">{rangeLabels['30d']}</ToggleGroupItem>
            <ToggleGroupItem value="7d">{rangeLabels['7d']}</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        {emptyTitle && !data.some((point) => point.value !== 0) ? (
          <Empty className="h-56 border-0">
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fillDashboardValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <YAxis type="number" width={0} tick={false} axisLine={false} tickLine={false} domain={yDomain} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value: string) => {
                  const date = new Date(`${value}T00:00:00`);
                  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      if (typeof value !== 'string') return String(value ?? '');
                      return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      });
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="value"
                type="linear"
                fill="url(#fillDashboardValue)"
                stroke="var(--color-value)"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
