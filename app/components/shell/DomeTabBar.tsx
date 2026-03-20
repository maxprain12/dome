import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Home,
  Settings,
  Calendar,
  MessageCircle,
  FileText,
  BookOpen,
  Globe,
  Youtube,
  Presentation,
  File,
  X,
  Plus,
  Sparkles,
  WalletCards,
  Tag,
  Store,
  Zap,
  FolderOpen,
} from 'lucide-react';
import { useTabStore, type DomeTab } from '@/lib/store/useTabStore';
import { getDomeTabDisplayTitle } from '@/lib/dome-tab-title';

function TabIcon({ type }: { type: DomeTab['type'] }) {
  const cls = 'w-3.5 h-3.5 shrink-0';
  const sw = 1.75;
  switch (type) {
    case 'home': return <Home className={cls} strokeWidth={sw} />;
    case 'settings': return <Settings className={cls} strokeWidth={sw} />;
    case 'calendar': return <Calendar className={cls} strokeWidth={sw} />;
    case 'chat': return <MessageCircle className={cls} strokeWidth={sw} />;
    case 'note': return <FileText className={cls} strokeWidth={sw} />;
    case 'notebook': return <BookOpen className={cls} strokeWidth={sw} />;
    case 'url': return <Globe className={cls} strokeWidth={sw} />;
    case 'youtube': return <Youtube className={cls} strokeWidth={sw} />;
    case 'docx': return <FileText className={cls} strokeWidth={sw} />;
    case 'ppt': return <Presentation className={cls} strokeWidth={sw} />;
    case 'resource': return <File className={cls} strokeWidth={sw} />;
    case 'studio': return <Sparkles className={cls} strokeWidth={sw} />;
    case 'flashcards': return <WalletCards className={cls} strokeWidth={sw} />;
    case 'tags': return <Tag className={cls} strokeWidth={sw} />;
    case 'marketplace': return <Store className={cls} strokeWidth={sw} />;
    case 'agents': return <Zap className={cls} strokeWidth={sw} />;
    case 'folder': return <FolderOpen className={cls} strokeWidth={sw} />;
    case 'learn': return <BookOpen className={cls} strokeWidth={sw} />;
    default: return <File className={cls} strokeWidth={sw} />;
  }
}

interface TabItemProps {
  tab: DomeTab;
  isActive: boolean;
  onActivate: () => void;
  onClose: () => void;
}

function TabItem({ tab, isActive, onActivate, onClose }: TabItemProps) {
  const { t } = useTranslation();
  const displayTitle = getDomeTabDisplayTitle(tab, t);
  return (
    <button
      type="button"
      onClick={onActivate}
      className="flex items-center gap-1.5 px-3 shrink-0 relative group transition-colors duration-100"
      style={{
        height: '100%',
        maxWidth: 180,
        minWidth: 80,
        fontSize: 12,
        fontWeight: 500,
        color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
        background: isActive ? 'var(--dome-surface)' : 'transparent',
        borderRight: '1px solid var(--dome-border)',
        borderBottom: isActive ? '2px solid var(--dome-accent)' : '2px solid transparent',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }
      }}
    >
      <TabIcon type={tab.type} />
      <span className="truncate flex-1 text-left" style={{ maxWidth: 120 }}>
        {displayTitle}
      </span>
      {!tab.pinned && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onClose(); } }}
          className="flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
          style={{
            width: 16,
            height: 16,
            color: 'var(--dome-text-muted)',
          }}
          aria-label={t('workspace.close_tab', { title: displayTitle })}
        >
          <X className="w-3 h-3" strokeWidth={2} />
        </span>
      )}
    </button>
  );
}

interface DomeTabBarProps {
  onNewChat?: () => void;
}

export default function DomeTabBar({ onNewChat }: DomeTabBarProps) {
  const { t } = useTranslation();
  const { tabs, activeTabId, activateTab, closeTab } = useTabStore();

  return (
    <div
      className="flex items-stretch flex-1 min-w-0 overflow-x-auto scrollbar-none"
      style={{
        height: '100%',
        background: 'var(--dome-bg)',
      }}
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => activateTab(tab.id)}
          onClose={() => closeTab(tab.id)}
        />
      ))}

      {/* New chat / tab button */}
      <button
        type="button"
        onClick={onNewChat}
        className="flex items-center justify-center shrink-0 transition-colors duration-100"
        style={{
          width: 36,
          height: '100%',
          color: 'var(--dome-text-muted)',
          borderRight: '1px solid var(--dome-border)',
        }}
        title={t('workspace.new_conversation')}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
        }}
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}
