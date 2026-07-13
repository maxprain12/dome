
import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Cancel01Icon,
  Download04Icon,
  CheckmarkCircle02Icon,
  CircleIcon,
  Loading03Icon,
  Search01Icon,
  GlobeIcon,
  BrainIcon,
  SparklesIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LeftToRightListBulletIcon,
} from '@hugeicons/core-free-icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { typesetDocsClass } from '@/lib/typeset';
import type { ResearchPlan, ResearchReport, ResearchLogEntry } from '@/types';
import { lazyRef } from '@/lib/utils/lazyRef';

// =============================================================================
// Types
// =============================================================================

interface DeepResearchProps {
  title?: string;
  status: 'idle' | 'planning' | 'researching' | 'synthesizing' | 'complete';
  plan?: ResearchPlan;
  report?: ResearchReport;
  log?: ResearchLogEntry[];
  onClose?: () => void;
  onExport?: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const LOG_TYPE_ICONS: Record<ResearchLogEntry['type'], IconSvgElement> = {
  search: Search01Icon,
  fetch: GlobeIcon,
  analyze: BrainIcon,
  synthesize: SparklesIcon,
  info: InformationCircleIcon,
};

const LOG_TYPE_COLORS: Record<ResearchLogEntry['type'], string> = {
  search: 'var(--info)',
  fetch: 'var(--primary)',
  analyze: 'var(--warning)',
  synthesize: 'var(--primary)',
  info: 'var(--muted-foreground)',
};

const STATUS_LABELS: Record<DeepResearchProps['status'], string> = {
  idle: 'Ready',
  planning: 'Creating research plan...',
  researching: 'Gathering information...',
  synthesizing: 'Synthesizing findings...',
  complete: 'Research complete',
};

// =============================================================================
// Sub-components
// =============================================================================

function SubtopicItem({
  subtopic,
}: {
  subtopic: ResearchPlan['subtopics'][number];
}) {
  const getStatusIcon = () => {
    switch (subtopic.status) {
      case 'done':
        return <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-[var(--success)]" />;
      case 'searching':
      case 'analyzing':
        return (
          <HugeiconsIcon icon={Loading03Icon}
            size={16}
            className="animate-spin text-[var(--info)]"
          />
        );
      case 'pending':
      default:
        return <HugeiconsIcon icon={CircleIcon} size={16} className="text-muted-foreground" />;
    }
  };

  const getStatusLabel = () => {
    switch (subtopic.status) {
      case 'done':
        return 'Complete';
      case 'searching':
        return 'Searching...';
      case 'analyzing':
        return 'Analyzing...';
      case 'pending':
      default:
        return 'Pending';
    }
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg transition-colors"
      style={{
        background:
          subtopic.status === 'searching' || subtopic.status === 'analyzing'
            ? 'var(--muted)'
            : 'transparent',
      }}
    >
      <div className="shrink-0 mt-0.5">{getStatusIcon()}</div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium text-foreground"
        >
          {subtopic.title}
        </div>
        <div
          className="text-xs mt-0.5 text-muted-foreground"
        >
          {getStatusLabel()}
        </div>
        {subtopic.queries && subtopic.queries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {subtopic.queries.map((query, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--card)',
                  color: 'var(--muted-foreground)',
                  border: '1px solid var(--border)',
                }}
              >
                {query}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionLog({ log }: { log: ResearchLogEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [log.length, isExpanded, prefersReducedMotion]);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
        style={{ background: 'transparent' }}
      >
        {isExpanded ? (
          <HugeiconsIcon icon={ChevronDownIcon} size={14} className="text-muted-foreground" />
        ) : (
          <HugeiconsIcon icon={ChevronRightIcon} size={14} className="text-muted-foreground" />
        )}
        <span
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Activity log
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{
            background: 'var(--muted)',
            color: 'var(--muted-foreground)',
          }}
        >
          {log.length}
        </span>
      </button>

      {isExpanded && (
        <div
          className="max-h-48 overflow-y-auto px-4 pb-3"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {log.map((entry, index) => {
            const entryIcon = LOG_TYPE_ICONS[entry.type];
            const color = LOG_TYPE_COLORS[entry.type];
            const time = new Date(entry.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

            return (
              <div
                key={index}
                className="flex items-start gap-2 py-1 text-xs"
              >
                <span className="text-muted-foreground">{time}</span>
                <HugeiconsIcon icon={entryIcon} size={12} className="shrink-0 mt-0.5" style={{ color }} />
                <span className="text-muted-foreground">
                  {entry.message}
                </span>
              </div>
            );
          })}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

function ProgressView({
  status,
  plan,
  log,
}: {
  status: DeepResearchProps['status'];
  plan?: ResearchPlan;
  log?: ResearchLogEntry[];
}) {
  const completedCount = plan?.subtopics.filter(
    (s) => s.status === 'done'
  ).length ?? 0;
  const totalCount = plan?.subtopics.length ?? 0;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-y-6">
        {/* Status header */}
        <div className="flex items-center gap-3">
          <HugeiconsIcon icon={Loading03Icon}
            size={20}
            className="animate-spin text-primary"
          />
          <div>
            <div
              className="text-sm font-semibold text-foreground"
            >
              {STATUS_LABELS[status]}
            </div>
            {plan && (
              <div
                className="text-xs mt-0.5 text-muted-foreground"
              >
                {completedCount} of {totalCount} subtopics completed
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {plan && (
          <div
            className="h-1.5 rounded-full overflow-hidden bg-muted"
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${progressPercent}%`,
                background: 'var(--primary)',
              }}
            />
          </div>
        )}

        {/* Research plan */}
        {plan && (
          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground"
            >
              Research plan: {plan.topic}
            </h4>
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--card)',
              }}
            >
              {plan.subtopics.map((subtopic) => (
                <SubtopicItem key={subtopic.id} subtopic={subtopic} />
              ))}
            </div>
          </div>
        )}

        {/* Action log */}
        {log && log.length > 0 && <ActionLog log={log} />}
      </div>
    </div>
  );
}

function TableOfContents({
  sections,
  activeSection,
  onSectionClick,
}: {
  sections: ResearchReport['sections'];
  activeSection: string | null;
  onSectionClick: (id: string) => void;
}) {
  return (
    <div
      className="w-48 shrink-0 overflow-y-auto py-4 pl-4 pr-2"
      style={{ borderRight: '1px solid var(--border)' }}
    >
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-3 px-2 text-muted-foreground"
      >
        Contents
      </div>
      <nav className="flex flex-col gap-y-0.5">
        {sections.map((section) => (
          <button
            type="button"
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className="w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate"
            style={{
              color:
                activeSection === section.id
                  ? 'var(--primary)'
                  : 'var(--muted-foreground)',
              background:
                activeSection === section.id
                  ? 'color-mix(in srgb, var(--primary) 12%, transparent)'
                  : 'transparent',
              fontWeight: activeSection === section.id ? 600 : 400,
            }}
          >
            {section.heading}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SourcesList({
  sources,
}: {
  sources: ResearchReport['sources'];
}) {
  return (
    <div
      className="rounded-lg p-4 mt-8"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <h3
        className="text-sm font-semibold mb-3 text-foreground"
      >
        Sources ({sources.length})
      </h3>
      <div className="flex flex-col gap-y-3">
        {sources.map((source, index) => (
          <div key={source.id} className="flex gap-3">
            <span
              className="text-xs font-bold shrink-0 mt-0.5 size-5 rounded-full flex items-center justify-center"
              style={{
                background: 'var(--muted)',
                color: 'var(--muted-foreground)',
              }}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-sm font-medium truncate text-foreground"
                >
                  {source.title}
                </span>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-primary"
                  >
                    <HugeiconsIcon icon={ExternalLinkIcon} size={12} />
                  </a>
                )}
              </div>
              <p
                className="text-xs mt-0.5 line-clamp-2 text-muted-foreground"
              >
                {source.snippet}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportView({
  report,
  onExport: _onExport,
}: {
  report: ResearchReport;
  onExport?: () => void;
}) {
  const [activeSection, setActiveSection] = useState<string | null>(
    report.sections[0]?.id ?? null
  );
  const showToc = true;
  const sectionRefs = useRef<Map<string, HTMLElement> | null>(null);
  const sectionRefMap = lazyRef(sectionRefs, () => new Map());
  const prefersReducedMotion = useReducedMotion();

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    const element = sectionRefMap.get(id);
    if (element) {
      element.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  // Observe which section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.getAttribute('data-section-id'));
          }
        }
      },
      { threshold: 0.3 }
    );

    for (const [, element] of sectionRefMap) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [report.sections, sectionRefMap]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Table of Contents */}
      {showToc && report.sections.length > 1 && (
        <TableOfContents
          sections={report.sections}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
        />
      )}

      {/* Report content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Report title */}
          <h1
            className="text-xl font-bold mb-1"
            style={{
              color: 'var(--foreground)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {report.title}
          </h1>
          <div
            className="text-xs mb-6 text-muted-foreground"
          >
            {report.sources.length} sources cited
          </div>

          {/* Sections */}
          {report.sections.map((section) => (
            <div
              key={section.id}
              data-section-id={section.id}
              ref={(el) => {
                if (el) sectionRefMap.set(section.id, el);
              }}
              className="mb-8"
            >
              <h2
                className="text-base font-semibold mb-3 pb-2"
                style={{
                  color: 'var(--foreground)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {section.heading}
              </h2>
              <div className={typesetDocsClass()}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {section.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}

          {/* Sources */}
          {report.sources.length > 0 && (
            <SourcesList sources={report.sources} />
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function DeepResearch({
  title,
  status,
  plan,
  report,
  log,
  onClose,
  onExport,
}: DeepResearchProps) {
  const { t } = useTranslation();
  const isResearching =
    status === 'planning' ||
    status === 'researching' ||
    status === 'synthesizing';
  const isComplete = status === 'complete' && report;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0 border-border"
      >
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={BrainIcon} size={16} className="text-primary" />
          <h3
            className="text-sm font-semibold text-foreground"
          >
            {title || 'Deep Research'}
          </h3>
          {isResearching && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{
                background: 'var(--info-bg)',
                color: 'var(--info)',
              }}
            >
              <HugeiconsIcon icon={Loading03Icon} size={10} className="animate-spin" />
              In progress
            </span>
          )}
          {isComplete && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{
                background: 'var(--success-bg)',
                color: 'var(--success)',
              }}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} />
              Complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isComplete && (
            <>
              <Button
                type="button"
                onClick={() => {
                  /* Toggle TOC handled internally */
                }}
                variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Toggle table of contents"
                title="Toggle table of contents"
              >
                <HugeiconsIcon icon={LeftToRightListBulletIcon} size={16} className="text-muted-foreground" />
              </Button>
              {onExport && (
                <Button
                  type="button"
                  onClick={onExport}
                  variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  aria-label="Export report"
                  title="Export report"
                >
                  <HugeiconsIcon icon={Download04Icon}
                    size={16} className="text-muted-foreground"
                  />
                </Button>
              )}
            </>
          )}
          {onClose && (
            <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('studio.close_button')} title={t('studio.close_button')}>
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isResearching && (
        <ProgressView status={status} plan={plan} log={log} />
      )}

      {isComplete && report && (
        <ReportView report={report} onExport={onExport} />
      )}

      {status === 'idle' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <HugeiconsIcon icon={BrainIcon}
              size={40}
              className="mx-auto mb-3 text-muted-foreground"
            />
            <p
              className="text-sm text-muted-foreground"
            >
              Ask the AI assistant to research a topic
            </p>
            <p
              className="text-xs mt-1 text-muted-foreground"
            >
              The deep research agent will search, analyze, and synthesize
              findings into a comprehensive report.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
