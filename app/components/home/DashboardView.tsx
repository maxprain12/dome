import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  File,
  Video,
  Music,
  Image as ImageIcon,
  Link2,
  FolderOpen,
  Notebook,
  Presentation,
  Plus,
  Upload,
  MessageSquarePlus,
  WalletCards,
  Calendar,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { InlineSearch } from '@/components/Search/SimpleSearch';
import type { RecentResource } from '@/lib/hooks/useDashboardData';
import { formatDistanceToNow } from '@/lib/utils';
import { showToast } from '@/lib/store/useToastStore';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGreeting(t: ReturnType<typeof useTranslation>['t']): string {
  const h = new Date().getHours();
  if (h < 12) return t('dashboard.greeting_morning');
  if (h < 18) return t('dashboard.greeting_afternoon');
  return t('dashboard.greeting_evening');
}

/** Color + background per resource type */
const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  note:     { color: '#7c6fcd', bg: 'rgba(124,111,205,0.12)' },
  notebook: { color: '#7c6fcd', bg: 'rgba(124,111,205,0.12)' },
  pdf:      { color: '#e05c5c', bg: 'rgba(224,92,92,0.12)'   },
  video:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)'  },
  audio:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)'  },
  image:    { color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
  url:      { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  folder:   { color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
  ppt:      { color: '#f97316', bg: 'rgba(249,115,22,0.12)'  },
  document: { color: '#e05c5c', bg: 'rgba(224,92,92,0.12)'   },
};

function getTypeStyle(type: string, folderColor?: string): { color: string; bg: string } {
  if (type === 'folder' && folderColor) {
    return { color: folderColor, bg: `${folderColor}20` };
  }
  return TYPE_STYLE[type] ?? { color: 'var(--dome-accent)', bg: 'rgba(124,111,205,0.12)' };
}

function getResourceIcon(type: string) {
  const cls = 'h-4 w-4 shrink-0';
  switch (type) {
    case 'note':     return <FileText className={cls} strokeWidth={1.5} />;
    case 'notebook': return <Notebook className={cls} strokeWidth={1.5} />;
    case 'pdf':      return <File className={cls} strokeWidth={1.5} />;
    case 'video':    return <Video className={cls} strokeWidth={1.5} />;
    case 'audio':    return <Music className={cls} strokeWidth={1.5} />;
    case 'image':    return <ImageIcon className={cls} strokeWidth={1.5} />;
    case 'url':      return <Link2 className={cls} strokeWidth={1.5} />;
    case 'folder':   return <FolderOpen className={cls} strokeWidth={1.5} />;
    case 'ppt':      return <Presentation className={cls} strokeWidth={1.5} />;
    default:         return <File className={cls} strokeWidth={1.5} />;
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    note: 'Nota', notebook: 'Cuaderno', pdf: 'PDF',
    video: 'Video', audio: 'Audio', image: 'Imagen',
    url: 'Enlace', folder: 'Carpeta', ppt: 'Presentación',
  };
  return labels[type] ?? type;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[11px] font-semibold uppercase tracking-widest mb-3"
      style={{ color: 'var(--dome-text-secondary, #4a4766)' }}
    >
      {children}
    </h2>
  );
}

function ResourceCard({ resource, onClick }: { resource: RecentResource; onClick: () => void }) {
  const folderColor = resource.type === 'folder' ? resource.metadata?.color : undefined;
  const { color, bg } = getTypeStyle(resource.type, folderColor);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 w-full"
      style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = color;
        el.style.boxShadow = `0 0 0 1px ${color}33`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--dome-border)';
        el.style.boxShadow = 'none';
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: bg, color }}
      >
        {getResourceIcon(resource.type)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
          {resource.title || 'Sin título'}
        </p>
        <p className="text-xs mt-0.5 font-medium" style={{ color }}>
          {getTypeLabel(resource.type)}
        </p>
      </div>
      <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
        {formatDistanceToNow(resource.updated_at * 1000)}
      </span>
    </button>
  );
}

function StatCard({
  label, value, icon: Icon, iconColor, iconBg, onClick, loading = false,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  iconColor: string;
  iconBg: string;
  onClick?: () => void;
  loading?: boolean;
}) {
  const isClickable = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isClickable}
      className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all duration-150 ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
      onMouseEnter={(e) => {
        if (isClickable) {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = iconColor;
          el.style.boxShadow = `0 0 0 1px ${iconColor}33`;
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = 'var(--dome-border)';
          el.style.boxShadow = 'none';
        }
      }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: iconBg, color: iconColor }}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      </span>
      <div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--dome-text)' }}>
          {loading ? (
            <span className="inline-block h-7 w-8 animate-pulse rounded" style={{ background: 'var(--dome-border)' }} />
          ) : value}
        </span>
        <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--dome-text-secondary, #4a4766)' }}>
          {label}
        </p>
      </div>
    </button>
  );
}

function QuickActionBtn({
  label, icon: Icon, onClick, variant = 'default', description,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  onClick: () => void;
  variant?: 'primary' | 'default';
  description?: string;
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all duration-150 w-full border"
      style={{
        background: isPrimary ? 'var(--dome-accent)' : 'var(--dome-surface)',
        borderColor: isPrimary ? 'transparent' : 'var(--dome-border)',
        color: isPrimary ? '#fff' : 'var(--dome-text)',
        boxShadow: isPrimary ? '0 2px 8px rgba(124,111,205,0.35)' : 'none',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (isPrimary) {
          el.style.boxShadow = '0 4px 12px rgba(124,111,205,0.45)';
          el.style.transform = 'translateY(-1px)';
        } else {
          el.style.borderColor = 'var(--dome-accent)';
          el.style.boxShadow = '0 0 0 1px rgba(124,111,205,0.2)';
        }
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        if (isPrimary) {
          el.style.boxShadow = '0 2px 8px rgba(124,111,205,0.35)';
          el.style.transform = '';
        } else {
          el.style.borderColor = 'var(--dome-border)';
          el.style.boxShadow = 'none';
        }
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: isPrimary ? 'rgba(255,255,255,0.22)' : 'var(--dome-bg)',
          color: isPrimary ? '#fff' : 'var(--dome-accent)',
          border: isPrimary ? '1px solid rgba(255,255,255,0.18)' : 'none',
        }}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate leading-tight">{label}</p>
        {description && (
          <p
            className="text-xs mt-0.5 truncate"
            style={{ color: isPrimary ? 'rgba(255,255,255,0.72)' : 'var(--dome-text-muted)' }}
          >
            {description}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DashboardView() {
  const { t } = useTranslation();
  const { name } = useUserStore();
  const { openResourceTab, openFolderTab, openCalendarTab, openChatTab } = useTabStore();
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const currentProject = useAppStore((s) => s.currentProject);

  const { stats, recentResources, loading } = useDashboardData(currentProject?.id ?? null);

  const handleResourceClick = useCallback(
    (r: RecentResource) => {
      if (r.type === 'folder') {
        openFolderTab(r.id, r.title);
      } else {
        openResourceTab(r.id, r.type, r.title);
      }
    },
    [openResourceTab, openFolderTab],
  );

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const res = {
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'note' as const,
      title: t('dashboard.untitled_note'),
      content: '',
      project_id: currentProject?.id ?? 'default',
      created_at: now,
      updated_at: now,
    };
    const result = await window.electron.db.resources.create(res);
    if (result.success && result.data) {
      openResourceTab(result.data.id, 'note', result.data.title);
    }
  }, [currentProject?.id, t, openResourceTab]);

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (!paths?.length) return;
    const result = await window.electron.resource.importMultiple(paths, currentProject?.id ?? 'default');
    if (result?.errors?.length) {
      const duplicateCount = result.errors.filter((entry) => entry.error === 'duplicate').length;
      if (duplicateCount > 0) {
        showToast('warning', `${duplicateCount} archivo(s) ya existían en la biblioteca.`);
      }
    }
  }, [currentProject?.id]);

  const handleNewChat = useCallback(async () => {
    const sessionId = `session_${Date.now()}`;
    openChatTab(sessionId, 'Chat');
  }, [openChatTab]);

  const handleResourceSelect = useCallback(
    (resource: { id: string; type: string; title: string }) => {
      if (resource.type === 'folder') {
        openFolderTab(resource.id, resource.title);
      } else {
        openResourceTab(resource.id, resource.type, resource.title);
      }
    },
    [openResourceTab, openFolderTab],
  );

  const greeting = getGreeting(t);
  const firstName = name?.split(' ')[0] || '';
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--dome-bg)' }}>
      <div className="mx-auto max-w-3xl px-6 py-10">

        {/* ── Hero ── */}
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--dome-text)' }}>
            {greeting}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--dome-text-secondary, #4a4766)' }}>
            {today}
          </p>
        </div>

        {/* ── Search ── */}
        <div className="mb-8">
          <InlineSearch onResourceSelect={handleResourceSelect} />
        </div>

        {/* ── Quick Actions ── */}
        <section className="mb-8">
          <SectionLabel>{t('dashboard.quick_actions', 'Acciones rápidas')}</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <QuickActionBtn
              label={t('dashboard.action_new_note')}
              description={t('dashboard.action_new_note_desc', 'Crea una nota en blanco')}
              icon={Plus}
              onClick={handleNewNote}
              variant="primary"
            />
            <QuickActionBtn
              label={t('dashboard.action_upload')}
              description={t('dashboard.action_upload_desc', 'PDF, vídeo, imagen…')}
              icon={Upload}
              onClick={handleUpload}
            />
            <QuickActionBtn
              label={t('dashboard.action_new_chat')}
              description={t('dashboard.action_new_chat_desc', 'Abre un chat con IA')}
              icon={MessageSquarePlus}
              onClick={handleNewChat}
            />
          </div>
        </section>

        {/* ── Stats ── */}
        <section className="mb-8">
          <SectionLabel>{t('dashboard.overview', 'Resumen')}</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={t('dashboard.stat_resources')}
              value={stats.resourceCount}
              icon={FileText}
              iconColor="#7c6fcd"
              iconBg="rgba(124,111,205,0.12)"
              loading={loading}
            />
            <StatCard
              label={t('dashboard.stat_flashcards')}
              value={stats.dueFlashcards}
              icon={WalletCards}
              iconColor="#10b981"
              iconBg="rgba(16,185,129,0.12)"
              loading={loading}
            />
            <StatCard
              label={t('dashboard.stat_events')}
              value={stats.upcomingEvents}
              icon={Calendar}
              iconColor="#f59e0b"
              iconBg="rgba(245,158,11,0.12)"
              onClick={openCalendarTab}
            />
            <StatCard
              label={t('dashboard.stat_chats')}
              value={stats.recentChats}
              icon={MessageSquare}
              iconColor="#3b82f6"
              iconBg="rgba(59,130,246,0.12)"
              loading={loading}
            />
          </div>
        </section>

        {/* ── Recently opened ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>{t('dashboard.recent_resources')}</SectionLabel>
            <button
              type="button"
              onClick={() => setHomeSidebarSection('library')}
              className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70 -mt-3"
              style={{ color: 'var(--dome-accent)' }}
            >
              {t('dashboard.view_all', 'Ver todo')}
              <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[60px] animate-pulse rounded-xl" style={{ background: 'var(--dome-surface)' }} />
              ))}
            </div>
          ) : recentResources.length === 0 ? (
            <div
              className="rounded-xl border p-8 text-center"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
            >
              <FileText className="mx-auto h-8 w-8 mb-3" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                {t('dashboard.no_recent_resources')}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                {t('dashboard.no_recent_hint', 'Crea una nota o sube un archivo para empezar')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentResources.slice(0, 8).map((r) => (
                <ResourceCard key={r.id} resource={r} onClick={() => handleResourceClick(r)} />
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
