/**
 * ArtifactCard - Base component for rich content artifacts in chat
 *
 * Supports different artifact types: pdf_summary, table, action_items, chart, code, list
 */

import { useState, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import {
  FileText,
  Table,
  CheckSquare,
  BarChart3,
  Code,
  List,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ExternalLink,
  Bot,
  Zap,
  Play,
  MessageCircle,
  ArrowUpRight,
  Image,
   Maximize2,
  X,
} from 'lucide-react';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeButton from '@/components/ui/DomeButton';

export type ArtifactType = 'pdf_summary' | 'table' | 'action_items' | 'chart' | 'code' | 'list' | 'created_entity' | 'docling_images';

export interface BaseArtifact {
  type: ArtifactType;
  title?: string;
}

export interface PDFSummaryArtifact extends BaseArtifact {
  type: 'pdf_summary';
  resource_id: string;
  title: string;
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    pageCount?: number;
    creator?: string;
    producer?: string;
    page?: number;
  };
  total_pages: number;
  extracted_pages?: number;
  chars_extracted: number;
}

export interface TableArtifact extends BaseArtifact {
  type: 'table';
  resource_id?: string;
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ActionItemsArtifact extends BaseArtifact {
  type: 'action_items';
  items: Array<{
    id: string;
    text: string;
    completed?: boolean;
    assignee?: string;
    due_date?: string;
  }>;
}

export interface ChartArtifact extends BaseArtifact {
  type: 'chart';
  chart_type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      color?: string;
    }>;
  };
}

export interface CodeArtifact extends BaseArtifact {
  type: 'code';
  language: string;
  code: string;
}

export interface ListArtifact extends BaseArtifact {
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface CreatedEntityArtifact extends BaseArtifact {
  type: 'created_entity';
  entityType: 'agent' | 'automation';
  id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface DoclingImagesArtifact extends BaseArtifact {
  type: 'docling_images';
  resource_id: string;
  resource_title?: string;
  images: Array<{
    image_id: string;
    caption?: string;
    page_no?: number;
  }>;
}

export type AnyArtifact =
  | PDFSummaryArtifact
  | TableArtifact
  | ActionItemsArtifact
  | ChartArtifact
  | CodeArtifact
  | ListArtifact
  | CreatedEntityArtifact
  | DoclingImagesArtifact;

interface ArtifactCardProps {
  artifact: AnyArtifact;
  onOpenResource?: (resourceId: string, type: string) => void;
  className?: string;
}

/** Semantic accent colors per artifact type — fixed values that render in both themes */
const ARTIFACT_STYLES: Record<ArtifactType, { borderColor: string; iconColor: string }> = {
  pdf_summary: { borderColor: '#3b82f6', iconColor: '#3b82f6' },
  table: { borderColor: '#10b981', iconColor: '#10b981' },
  action_items: { borderColor: '#f59e0b', iconColor: '#f59e0b' },
  chart: { borderColor: '#8b5cf6', iconColor: '#8b5cf6' },
  code: { borderColor: 'var(--secondary-text)', iconColor: 'var(--secondary-text)' },
  list: { borderColor: '#ef4444', iconColor: '#ef4444' },
  created_entity: { borderColor: '#8b5cf6', iconColor: '#8b5cf6' },
  docling_images: { borderColor: '#14b8a6', iconColor: '#14b8a6' },
};

// Icon mapping
const ARTIFACT_ICONS: Record<ArtifactType, typeof FileText> = {
  pdf_summary: FileText,
  table: Table,
  action_items: CheckSquare,
  chart: BarChart3,
  code: Code,
  list: List,
  created_entity: Bot,
  docling_images: Image,
};

function ArtifactHeader({
  artifact,
  expanded,
  onToggle,
  onCopy,
  copied,
}: {
  artifact: AnyArtifact;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  const styles = ARTIFACT_STYLES[artifact.type];
  const Icon = ARTIFACT_ICONS[artifact.type];

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)]">
      <DomeButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="flex-1 min-w-0 justify-start gap-2 h-auto py-1 px-1 font-normal"
        leftIcon={
          <DomeIconBox
            size="sm"
            background={`color-mix(in srgb, ${styles.iconColor} 15%, transparent)`}
            className="!w-[26px] !h-[26px] !rounded-md"
          >
            <Icon className="w-3.5 h-3.5" style={{ color: styles.iconColor }} />
          </DomeIconBox>
        }
        rightIcon={
          expanded ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0 text-[var(--secondary-text)]" aria-hidden />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--secondary-text)]" aria-hidden />
          )
        }
      >
        <span className="text-[13px] font-semibold text-[var(--primary-text)] truncate text-left">
          {artifact.title || getArtifactTitle(artifact)}
        </span>
      </DomeButton>

      <DomeButton
        type="button"
        variant="ghost"
        size="xs"
        onClick={onCopy}
        title={t('ui.copy_content')}
        className="shrink-0 gap-1 h-auto py-1 px-2 text-[11px] text-[var(--secondary-text)] hover:bg-[var(--bg-hover)]"
        leftIcon={
          copied ? (
            <Check className="w-3 h-3 text-[var(--success)]" aria-hidden />
          ) : (
            <Copy className="w-3 h-3" aria-hidden />
          )
        }
      >
        {copied ? <span className="text-[var(--success)]">{t('common.copied')}</span> : t('common.copy')}
      </DomeButton>
    </div>
  );
}

function getArtifactTitle(artifact: AnyArtifact): string {
  switch (artifact.type) {
    case 'pdf_summary': return i18n.t('artifacts.pdf_summary');
    case 'table': return i18n.t('artifacts.table');
    case 'action_items': return i18n.t('artifacts.action_items');
    case 'chart': return i18n.t('artifacts.chart');
    case 'code': return i18n.t('artifacts.code');
    case 'list': return i18n.t('artifacts.list');
    case 'created_entity': {
      const e = artifact as CreatedEntityArtifact;
      return e.entityType === 'agent'
        ? i18n.t('artifacts.agent_named', { name: e.name })
        : i18n.t('artifacts.automation_named', { name: e.name });
    }
    case 'docling_images': {
      const d = artifact as DoclingImagesArtifact;
      const title = d.resource_title || d.title || i18n.t('artifacts.document');
      return i18n.t('artifacts.figures_named', { title, count: d.images?.length ?? 0 });
    }
    default: return i18n.t('artifacts.content');
  }
}

function getArtifactContent(artifact: AnyArtifact): ReactNode {
  switch (artifact.type) {
    case 'pdf_summary': return <PDFSummaryContent artifact={artifact} />;
    case 'table': return <TableContent artifact={artifact} />;
    case 'action_items': return <ActionItemsContent artifact={artifact} />;
    case 'chart': return <ChartContent artifact={artifact} />;
    case 'code': return <CodeContent artifact={artifact} />;
    case 'list': return <ListContent artifact={artifact} />;
    case 'created_entity': return <CreatedEntityContent artifact={artifact as CreatedEntityArtifact} />;
    case 'docling_images': return <DoclingImagesContent artifact={artifact as DoclingImagesArtifact} />;
    default: return null;
  }
}

// =============================================================================
// Content Components
// =============================================================================

function PDFSummaryContent({ artifact }: { artifact: PDFSummaryArtifact }) {
  const { t } = useTranslation();
  const [showFull, setShowFull] = useState(false);
  const maxPreviewLength = 800;
  const shouldTruncate = artifact.text.length > maxPreviewLength;

  const displayText = showFull || !shouldTruncate
    ? artifact.text
    : artifact.text.substring(0, maxPreviewLength) + '...';

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Metadata */}
      {artifact.metadata && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--secondary-text)' }}>
          {artifact.metadata.author && (
            <span>
              <span style={{ fontWeight: 600 }}>{t('artifacts.author')}:</span> {artifact.metadata.author}
            </span>
          )}
          {artifact.total_pages && (
            <span>
              <span style={{ fontWeight: 600 }}>{t('artifacts.pages')}:</span> {artifact.total_pages}
            </span>
          )}
          <span>
            <span style={{ fontWeight: 600 }}>{t('artifacts.characters')}:</span> {artifact.chars_extracted.toLocaleString()}
          </span>
        </div>
      )}

      {/* Summary text */}
      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--primary-text)' }}>
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {displayText}
        </div>
        {shouldTruncate && (
          <button
            type="button"
            onClick={() => setShowFull(!showFull)}
            style={{
              marginTop: 8,
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {showFull ? t('artifacts.show_less') : t('artifacts.show_more')}
          </button>
        )}
      </div>

      {/* Link to open PDF at specific page */}
      <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
        <a
          href={`dome://resource/${artifact.resource_id}/pdf`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} />
          {t('artifacts.open_pdf')}
        </a>
        {artifact.metadata?.page && (
          <a
            href={`dome://resource/${artifact.resource_id}/pdf?page=${artifact.metadata.page}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
            {t('artifacts.go_to_page', { page: artifact.metadata.page })}
          </a>
        )}
      </div>
    </div>
  );
}

function TableContent({ artifact }: { artifact: TableArtifact }) {
  return (
    <div style={{ padding: 12, overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {artifact.headers.map((header, idx) => (
              <th
                key={idx}
                style={{
                  padding: '6px 10px',
                  textAlign: 'left',
                  fontWeight: 600,
                  borderBottom: '2px solid var(--border)',
                  backgroundColor: 'var(--bg-hover)',
                  color: 'var(--primary-text)',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {artifact.rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              style={{ transition: 'background 150ms ease' }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {row.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  style={{
                    padding: '5px 10px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--secondary-text)',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionItemsContent({ artifact }: { artifact: ActionItemsArtifact }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {artifact.items.map((item, idx) => (
        <div key={item.id || idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
          <div
            style={{
              width: 16,
              height: 16,
              marginTop: 2,
              borderRadius: 3,
              border: item.completed ? 'none' : '1px solid var(--border)',
              backgroundColor: item.completed ? 'var(--success)' : 'transparent',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.completed && <Check style={{ width: 10, height: 10, color: 'var(--base-text)' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                color: 'var(--primary-text)',
                textDecoration: item.completed ? 'line-through' : 'none',
                opacity: item.completed ? 0.6 : 1,
              }}
            >
              {item.text}
            </span>
            {(item.assignee || item.due_date) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--tertiary-text)' }}>
                {item.assignee && <span>@{item.assignee}</span>}
                {item.due_date && <span>{t('artifacts.due')} {item.due_date}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartContent({ artifact }: { artifact: ChartArtifact }) {
  const maxValue = Math.max(...artifact.data.datasets.flatMap((d) => d.data), 1);

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--primary-text)' }}>
        {artifact.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {artifact.data.labels.map((label, idx) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, width: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--secondary-text)', flexShrink: 0 }}>
              {label}
            </span>
            <div style={{ flex: 1, height: 20, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
              {artifact.data.datasets.map((dataset, dIdx) => (
                <div
                  key={dIdx}
                  style={{
                    height: '100%',
                    borderRadius: 3,
                    width: `${(dataset.data[idx] / maxValue) * 100}%`,
                    backgroundColor: dataset.color || 'var(--accent)',
                    transition: 'width 300ms ease',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 11, width: 40, textAlign: 'right', color: 'var(--secondary-text)', flexShrink: 0 }}>
              {artifact.data.datasets[0]?.data[idx]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeContent({ artifact }: { artifact: CodeArtifact }) {
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--secondary-text)' }}>
          {artifact.language}
        </span>
      </div>
      <pre
        style={{
          fontSize: 12,
          overflowX: 'auto',
          padding: '10px 12px',
          borderRadius: 6,
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--primary-text)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        <code>{artifact.code}</code>
      </pre>
    </div>
  );
}

function ListContent({ artifact }: { artifact: ListArtifact }) {
  const ListTag = artifact.ordered ? 'ol' : 'ul';
  const items = artifact.items;

  return (
    <div style={{ padding: 12 }}>
      <ListTag
        style={{
          paddingLeft: 20,
          margin: 0,
          listStyleType: artifact.ordered ? 'decimal' : 'disc',
          color: 'var(--primary-text)',
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

function DoclingImagesContent({ artifact }: { artifact: DoclingImagesArtifact }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const lightboxStyle = {
    position: 'fixed' as const,
    top: 'var(--app-header-total)',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    background: 'rgba(0,0,0,0.9)',
    padding: 24,
  };

  useEffect(() => {
    const docling = (window as Window & { electron?: { docling?: { getImageData?: (id: string) => Promise<{ success: boolean; data?: string; error?: string }> } } }).electron?.docling;
    const getImageData = docling?.getImageData;
    if (!artifact.images?.length || !getImageData) return;
    const load = async () => {
      const results: Record<string, string> = {};
      const errs: Record<string, string> = {};
      for (const img of artifact.images) {
        try {
          const res = await getImageData(img.image_id);
          if (res.success && res.data) results[img.image_id] = res.data;
          else if (res.error) errs[img.image_id] = res.error;
        } catch (e) {
          errs[img.image_id] = e instanceof Error ? e.message : i18n.t('artifacts.failed_load');
        }
      }
      setLoaded(results);
      setErrors(errs);
    };
    void load();
  }, [artifact.images]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (lightboxIndex != null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [lightboxIndex]);

  if (!artifact.images?.length) return null;

  const lightboxImg = lightboxIndex != null ? artifact.images[lightboxIndex] : null;
  const lightboxDataUrl = lightboxImg ? loaded[lightboxImg.image_id] : null;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {artifact.resource_id && (
        <a
          href={`dome://resource/${artifact.resource_id}/pdf`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} />
          {t('artifacts.open_document')}
        </a>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {artifact.images.map((img, idx) => {
          const dataUrl = loaded[img.image_id];
          const err = errors[img.image_id];
          const label = img.caption || t('artifacts.figure', { n: idx + 1 });
          const pageSuffix = img.page_no != null ? t('artifacts.page_suffix', { page: img.page_no }) : '';
          const isClickable = !!dataUrl;
          return (
            <div
              key={img.image_id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                cursor: isClickable ? 'pointer' : 'default',
              }}
            >
              <p style={{ fontSize: 11, color: 'var(--secondary-text)', margin: 0 }}>{label}{pageSuffix}</p>
              {dataUrl ? (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  style={{
                    position: 'relative',
                    padding: 0,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--bg)',
                    cursor: 'pointer',
                    transition: 'border-color 150ms, box-shadow 150ms',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <img
                    src={dataUrl}
                    alt={label}
                    style={{
                      width: '100%',
                      minHeight: 140,
                      maxHeight: 200,
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      right: 8,
                      padding: 4,
                      borderRadius: 6,
                      background: 'rgba(0,0,0,0.5)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Maximize2 style={{ width: 14, height: 14 }} />
                  </div>
                </button>
              ) : err ? (
                <span style={{ fontSize: 11, color: 'var(--error)' }}>{err}</span>
              ) : (
                <div style={{ minHeight: 140, background: 'var(--bg-tertiary)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--tertiary-text)' }}>
                  {t('artifacts.loading')}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox — portal to body so it covers full viewport */}
      {lightboxIndex != null &&
        lightboxImg &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('artifacts.lightbox_aria')}
            style={lightboxStyle}
            onClick={() => setLightboxIndex(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                padding: 8,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={t('artifacts.close')}
            >
              <X style={{ width: 24, height: 24 }} />
            </button>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxDataUrl ? (
                <img
                  src={lightboxDataUrl}
                  alt={lightboxImg.caption || t('artifacts.figure', { n: lightboxIndex + 1 })}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    borderRadius: 8,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : null}
            </div>
            <p
              style={{
                marginTop: 12,
                fontSize: 14,
                color: 'rgba(255,255,255,0.9)',
                textAlign: 'center',
                maxWidth: 600,
              }}
            >
              {lightboxImg.caption || t('artifacts.figure', { n: lightboxIndex + 1 })}
              {lightboxImg.page_no != null ? t('artifacts.page_suffix', { page: lightboxImg.page_no }) : ''}
            </p>
          </div>,
          document.body
        )}
    </div>
  );
}

function CreatedEntityContent({ artifact }: { artifact: CreatedEntityArtifact }) {
  const { t } = useTranslation();
  const isAgent = artifact.entityType === 'agent';
  const accentColor = isAgent ? 'var(--accent)' : 'var(--warning)';
  const Icon = isAgent ? Bot : Zap;

  const navigate = (section: string) => {
    window.dispatchEvent(new CustomEvent('dome:navigate-section', { detail: section }));
  };

  const configEntries = artifact.config
    ? Object.entries(artifact.config).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : [];

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Entity header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `color-mix(in srgb, ${accentColor} 15%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 18, height: 18, color: accentColor }} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', margin: 0 }}>{artifact.name}</p>
          {artifact.description && (
            <p style={{ fontSize: 12, color: 'var(--secondary-text)', margin: '2px 0 0', lineHeight: 1.4 }}>{artifact.description}</p>
          )}
        </div>
      </div>

      {/* Config details */}
      {configEntries.length > 0 && (
        <div style={{
          background: 'var(--bg-tertiary)', borderRadius: 6, padding: '8px 10px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {configEntries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
              <span style={{ color: 'var(--tertiary-text)', fontWeight: 500, flexShrink: 0, textTransform: 'capitalize' }}>
                {k.replace(/_/g, ' ')}:
              </span>
              <span style={{ color: 'var(--secondary-text)', wordBreak: 'break-word' }}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        {isAgent ? (
          <>
            <button
              type="button"
              onClick={() => navigate(`agent:${artifact.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: accentColor, color: 'var(--base-text)', border: 'none', cursor: 'pointer',
              }}
            >
              <MessageCircle style={{ width: 12, height: 12 }} /> {t('artifacts.chat')}
            </button>
            <button
              type="button"
              onClick={() => navigate('automations-hub')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: 'var(--bg-hover)', color: 'var(--secondary-text)', border: 'none', cursor: 'pointer',
              }}
            >
              <ArrowUpRight style={{ width: 12, height: 12 }} /> {t('artifacts.view_in_hub')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => navigate('automations-hub')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                background: accentColor, color: 'var(--base-text)', border: 'none', cursor: 'pointer',
              }}
            >
              <Play style={{ width: 12, height: 12 }} /> {t('artifacts.view_and_run')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function ArtifactCard({ artifact, onOpenResource: _onOpenResource, className = '' }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const styles = ARTIFACT_STYLES[artifact.type];

  const handleCopy = async () => {
    let contentToCopy = '';

    switch (artifact.type) {
      case 'pdf_summary':
        contentToCopy = (artifact as PDFSummaryArtifact).text;
        break;
      case 'table':
        contentToCopy =
          (artifact as TableArtifact).headers.join('\t') +
          '\n' +
          (artifact as TableArtifact).rows.map((row) => row.join('\t')).join('\n');
        break;
      case 'action_items':
        contentToCopy = (artifact as ActionItemsArtifact).items
          .map((item) => `${item.completed ? '[x]' : '[ ]'} ${item.text}`)
          .join('\n');
        break;
      case 'code':
        contentToCopy = (artifact as CodeArtifact).code;
        break;
      case 'list':
        contentToCopy = (artifact as ListArtifact).items.join('\n');
        break;
      case 'docling_images': {
        const d = artifact as DoclingImagesArtifact;
        contentToCopy = d.images
          ?.map((img, i) =>
            `${img.caption || i18n.t('artifacts.figure', { n: i + 1 })}${
              img.page_no != null ? i18n.t('artifacts.page_suffix', { page: img.page_no }) : ''
            }`
          )
          .join('\n') ?? '';
        if (d.resource_id && contentToCopy) {
          contentToCopy += `\n\n${i18n.t('artifacts.view_document_md', { url: `dome://resource/${d.resource_id}/pdf` })}`;
        }
        break;
      }
      default:
        contentToCopy = JSON.stringify(artifact, null, 2);
    }

    try {
      await navigator.clipboard.writeText(contentToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div
      className={className}
      style={{
        borderRadius: 6,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${styles.borderColor}`,
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <ArtifactHeader
        artifact={artifact}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        onCopy={handleCopy}
        copied={copied}
      />

      {expanded && (
        <div className="animate-in fade-in duration-200">
          {getArtifactContent(artifact)}
        </div>
      )}
    </div>
  );
}

// Export types for external use
export type { ArtifactCardProps };
