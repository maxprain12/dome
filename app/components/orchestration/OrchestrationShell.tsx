import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, GitBranch, Zap, Activity, type LucideIcon } from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';

export type OrchestrationSection = 'agents' | 'workflows' | 'automations' | 'runs';

export interface OrchestrationStat {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'accent' | 'success' | 'error' | 'warning' | 'info';
}

interface Props {
  section: OrchestrationSection;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  stats: OrchestrationStat[];
  /** Right-aligned CTA buttons in the hero. */
  actions?: ReactNode;
  /** Optional row under the stats (filters, search…). */
  toolbar?: ReactNode;
  children: ReactNode;
}

const SECTION_META: Record<OrchestrationSection, { icon: LucideIcon; tint: string; tintBg: string }> = {
  agents: { icon: Bot, tint: 'var(--dome-accent)', tintBg: 'var(--dome-accent-bg)' },
  workflows: { icon: GitBranch, tint: 'var(--info)', tintBg: 'var(--info-bg)' },
  automations: { icon: Zap, tint: 'var(--warning)', tintBg: 'var(--warning-bg)' },
  runs: { icon: Activity, tint: 'var(--success)', tintBg: 'var(--success-bg)' },
};

const STAT_TONE_COLOR: Record<NonNullable<OrchestrationStat['tone']>, string> = {
  default: 'var(--dome-text)',
  accent: 'var(--dome-accent)',
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--info)',
};

/**
 * Shared frame for the four orchestration sections (Agents, Workflows,
 * Automations, Runs): cross-section pills, hero with live KPI cards and a
 * scrollable content area. The zero-data state is a first-class dashboard —
 * stats always render (with zeros) so no screen is ever empty.
 */
export default function OrchestrationShell({
  section,
  title,
  subtitle,
  icon: Icon,
  stats,
  actions,
  toolbar,
  children,
}: Props) {
  const { t } = useTranslation();
  const { openAgentsTab, openWorkflowsTab, openAutomationsTab, openRunsTab } = useTabStore();
  const meta = SECTION_META[section];

  const crossNav: Array<{ key: OrchestrationSection; label: string; open: () => void }> = [
    { key: 'agents', label: t('tabs.agents'), open: openAgentsTab },
    { key: 'workflows', label: t('tabs.workflows'), open: openWorkflowsTab },
    { key: 'automations', label: t('tabs.automations'), open: openAutomationsTab },
    { key: 'runs', label: t('tabs.runs'), open: openRunsTab },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
      <header className="shrink-0 px-6 pt-4 pb-4" style={{ borderBottom: '1px solid var(--dome-border)' }}>
        {/* Cross-section navigation */}
        <nav className="mb-4 flex items-center gap-1.5 flex-wrap" aria-label={t('orchestration.sections_nav')}>
          {crossNav.map(({ key, label, open }) => {
            const ItemIcon = SECTION_META[key].icon;
            const active = key === section;
            return (
              <button
                key={key}
                type="button"
                onClick={active ? undefined : open}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? SECTION_META[key].tintBg : 'transparent',
                  color: active ? SECTION_META[key].tint : 'var(--dome-text-muted)',
                  border: `1px solid ${active ? SECTION_META[key].tint : 'var(--dome-border)'}`,
                  cursor: active ? 'default' : 'pointer',
                }}
              >
                <ItemIcon className="size-3" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Title + actions */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex size-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: meta.tintBg, color: meta.tint }}
            >
              <Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--dome-text)' }}>
                {title}
              </h1>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {subtitle}
              </p>
            </div>
          </div>
          {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
        </div>

        {/* KPI cards */}
        {stats.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-xl px-3.5 py-3"
                style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  {s.label}
                </div>
                <div
                  className="mt-0.5 text-2xl font-bold leading-tight tabular-nums"
                  style={{ color: STAT_TONE_COLOR[s.tone ?? 'default'] }}
                >
                  {s.value}
                </div>
                {s.sub ? (
                  <div className="text-[11px] truncate" style={{ color: 'var(--dome-text-muted)' }} title={s.sub}>
                    {s.sub}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </header>

      {toolbar ? (
        <div
          className="shrink-0 px-6 py-2.5"
          style={{ borderBottom: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
        >
          {toolbar}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
