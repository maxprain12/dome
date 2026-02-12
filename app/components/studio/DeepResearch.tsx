
import { useState, useRef, useEffect, useMemo } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import {
  X,
  Download,
  CheckCircle2,
  Circle,
  Loader2,
  Search,
  Globe,
  Brain,
  Sparkles,
  Info,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  List,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ResearchPlan, ResearchReport, ResearchLogEntry } from '@/types';

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

const LOG_TYPE_ICONS: Record<ResearchLogEntry['type'], typeof Search> = {
  search: Search,
  fetch: Globe,
  analyze: Brain,
  synthesize: Sparkles,
  info: Info,
};

const LOG_TYPE_COLORS: Record<ResearchLogEntry['type'], string> = {
  search: 'var(--info)',
  fetch: 'var(--dome-accent, #596037)',
  analyze: 'var(--warning)',
  synthesize: 'var(--accent)',
  info: 'var(--tertiary-text)',
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
        return <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />;
      case 'searching':
      case 'analyzing':
        return (
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: 'var(--info)' }}
          />
        );
      case 'pending':
      default:
        return <Circle size={16} style={{ color: 'var(--tertiary-text)' }} />;
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
            ? 'var(--bg-tertiary)'
            : 'transparent',
      }}
    >
      <div className="shrink-0 mt-0.5">{getStatusIcon()}</div>
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium"
          style={{ color: 'var(--primary-text)' }}
        >
          {subtopic.title}
        </div>
        <div
          className="text-xs mt-0.5"
          style={{ color: 'var(--tertiary-text)' }}
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
                  background: 'var(--bg-secondary)',
                  color: 'var(--secondary-text)',
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
        background: 'var(--bg-secondary)',
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors"
        style={{ background: 'transparent' }}
      >
        {isExpanded ? (
          <ChevronDown size={14} style={{ color: 'var(--tertiary-text)' }} />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--tertiary-text)' }} />
        )}
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--tertiary-text)' }}
        >
          Activity log
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--tertiary-text)',
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
            const Icon = LOG_TYPE_ICONS[entry.type];
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
                <span style={{ color: 'var(--tertiary-text)' }}>{time}</span>
                <Icon size={12} className="shrink-0 mt-0.5" style={{ color }} />
                <span style={{ color: 'var(--secondary-text)' }}>
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
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Status header */}
        <div className="flex items-center gap-3">
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: 'var(--accent)' }}
          />
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: 'var(--primary-text)' }}
            >
              {STATUS_LABELS[status]}
            </div>
            {plan && (
              <div
                className="text-xs mt-0.5"
                style={{ color: 'var(--secondary-text)' }}
              >
                {completedCount} of {totalCount} subtopics completed
              </div>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {plan && (
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
        )}

        {/* Research plan */}
        {plan && (
          <div>
            <h4
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Research plan: {plan.topic}
            </h4>
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
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
        className="text-xs font-semibold uppercase tracking-wider mb-3 px-2"
        style={{ color: 'var(--tertiary-text)' }}
      >
        Contents
      </div>
      <nav className="space-y-0.5">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className="w-full text-left text-xs px-2 py-1.5 rounded transition-colors truncate"
            style={{
              color:
                activeSection === section.id
                  ? 'var(--accent)'
                  : 'var(--secondary-text)',
              background:
                activeSection === section.id
                  ? 'var(--translucent)'
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
        background: 'var(--bg-secondary)',
      }}
    >
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: 'var(--primary-text)' }}
      >
        Sources ({sources.length})
      </h3>
      <div className="space-y-3">
        {sources.map((source, index) => (
          <div key={source.id} className="flex gap-3">
            <span
              className="text-xs font-bold shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--secondary-text)',
              }}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--primary-text)' }}
                >
                  {source.title}
                </span>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                    style={{ color: 'var(--accent)' }}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <p
                className="text-xs mt-0.5 line-clamp-2"
                style={{ color: 'var(--tertiary-text)' }}
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
  onExport,
}: {
  report: ResearchReport;
  onExport?: () => void;
}) {
  const [activeSection, setActiveSection] = useState<string | null>(
    report.sections[0]?.id ?? null
  );
  const [showToc, setShowToc] = useState(true);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const prefersReducedMotion = useReducedMotion();

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    const element = sectionRefs.current.get(id);
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

    for (const [, element] of sectionRefs.current) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [report.sections]);

  // Markdown components for custom styling
  const markdownComponents = useMemo(
    () => ({
      h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h1
          className="text-lg font-semibold mt-6 mb-3"
          style={{ color: 'var(--primary-text)' }}
          {...props}
        >
          {children}
        </h1>
      ),
      h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h2
          className="text-base font-semibold mt-5 mb-2"
          style={{ color: 'var(--primary-text)' }}
          {...props}
        >
          {children}
        </h2>
      ),
      h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
        <h3
          className="text-sm font-semibold mt-4 mb-2"
          style={{ color: 'var(--primary-text)' }}
          {...props}
        >
          {children}
        </h3>
      ),
      p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
        <p
          className="text-sm leading-relaxed mb-3"
          style={{ color: 'var(--secondary-text)' }}
          {...props}
        >
          {children}
        </p>
      ),
      ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
        <ul className="list-disc pl-5 mb-3 space-y-1" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
        <ol className="list-decimal pl-5 mb-3 space-y-1" {...props}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
        <li
          className="text-sm leading-relaxed"
          style={{ color: 'var(--secondary-text)' }}
          {...props}
        >
          {children}
        </li>
      ),
      strong: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => (
        <strong
          className="font-semibold"
          style={{ color: 'var(--primary-text)' }}
          {...props}
        >
          {children}
        </strong>
      ),
      a: ({
        children,
        href,
        ...props
      }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: 'var(--accent)' }}
          {...props}
        >
          {children}
        </a>
      ),
      blockquote: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLQuoteElement>) => (
        <blockquote
          className="pl-4 my-3 text-sm italic"
          style={{
            borderLeft: '3px solid var(--border)',
            color: 'var(--secondary-text)',
          }}
          {...props}
        >
          {children}
        </blockquote>
      ),
      code: ({
        children,
        className,
        ...props
      }: React.HTMLAttributes<HTMLElement>) => {
        const isInline = !className;
        if (isInline) {
          return (
            <code
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--primary-text)',
                fontFamily: 'var(--font-mono)',
              }}
              {...props}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            className={className}
            style={{ fontFamily: 'var(--font-mono)' }}
            {...props}
          >
            {children}
          </code>
        );
      },
      pre: ({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
        <pre
          className="rounded-lg p-4 my-3 overflow-x-auto text-xs"
          style={{
            background: 'var(--bg-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}
          {...props}
        >
          {children}
        </pre>
      ),
    }),
    []
  );

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
              color: 'var(--primary-text)',
              fontFamily: 'var(--font-display)',
            }}
          >
            {report.title}
          </h1>
          <div
            className="text-xs mb-6"
            style={{ color: 'var(--tertiary-text)' }}
          >
            {report.sources.length} sources cited
          </div>

          {/* Sections */}
          {report.sections.map((section) => (
            <div
              key={section.id}
              data-section-id={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
              }}
              className="mb-8"
            >
              <h2
                className="text-base font-semibold mb-3 pb-2"
                style={{
                  color: 'var(--primary-text)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {section.heading}
              </h2>
              <div className="prose-sm">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
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
  const isResearching =
    status === 'planning' ||
    status === 'researching' ||
    status === 'synthesizing';
  const isComplete = status === 'complete' && report;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Brain size={16} style={{ color: 'var(--dome-accent, #596037)' }} />
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--primary-text)' }}
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
              <Loader2 size={10} className="animate-spin" />
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
              <CheckCircle2 size={10} />
              Complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isComplete && (
            <>
              <button
                onClick={() => {
                  /* Toggle TOC handled internally */
                }}
                className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                aria-label="Toggle table of contents"
                title="Toggle table of contents"
              >
                <List size={16} style={{ color: 'var(--secondary-text)' }} />
              </button>
              {onExport && (
                <button
                  onClick={onExport}
                  className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  aria-label="Export report"
                  title="Export report"
                >
                  <Download
                    size={16}
                    style={{ color: 'var(--secondary-text)' }}
                  />
                </button>
              )}
            </>
          )}
          {onClose && (
            <button onClick={onClose} className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Close" title="Close">
              <X size={16} />
            </button>
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
            <Brain
              size={40}
              className="mx-auto mb-3"
              style={{ color: 'var(--tertiary-text)' }}
            />
            <p
              className="text-sm"
              style={{ color: 'var(--secondary-text)' }}
            >
              Ask the AI assistant to research a topic
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--tertiary-text)' }}
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
