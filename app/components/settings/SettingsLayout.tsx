import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User, Palette, Brain, Mic, Settings as SettingsIcon,
  MessageCircle, Puzzle, Plug2, Wand2, Database, Cloud,
  Globe, BookMarked, Calendar,
} from 'lucide-react';

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'ai'
  | 'transcription'
  | 'whatsapp'
  | 'mcp'
  | 'skills'
  | 'plugins'
  | 'advanced'
  | 'indexing'
  | 'cloud'
  | 'language'
  | 'kb_llm'
  | 'calendar';

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  children: ReactNode;
}

interface NavItem {
  id: SettingsSection;
  icon: ReactNode;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'settings.groups.preferences',
    items: [
      { id: 'general',    icon: <User className="w-3.5 h-3.5" /> },
      { id: 'appearance', icon: <Palette className="w-3.5 h-3.5" /> },
      { id: 'language',   icon: <Globe className="w-3.5 h-3.5" /> },
    ],
  },
  {
    labelKey: 'settings.groups.ai_voice',
    items: [
      { id: 'ai',           icon: <Brain className="w-3.5 h-3.5" /> },
      { id: 'transcription', icon: <Mic className="w-3.5 h-3.5" /> },
    ],
  },
  {
    labelKey: 'settings.groups.integrations',
    items: [
      { id: 'whatsapp', icon: <MessageCircle className="w-3.5 h-3.5" /> },
      { id: 'cloud',    icon: <Cloud className="w-3.5 h-3.5" /> },
      { id: 'calendar', icon: <Calendar className="w-3.5 h-3.5" /> },
      { id: 'mcp',      icon: <Plug2 className="w-3.5 h-3.5" /> },
    ],
  },
  {
    labelKey: 'settings.groups.knowledge',
    items: [
      { id: 'indexing', icon: <Database className="w-3.5 h-3.5" /> },
      { id: 'kb_llm',   icon: <BookMarked className="w-3.5 h-3.5" /> },
    ],
  },
  {
    labelKey: 'settings.groups.extensions',
    items: [
      { id: 'skills',  icon: <Wand2 className="w-3.5 h-3.5" /> },
      { id: 'plugins', icon: <Puzzle className="w-3.5 h-3.5" /> },
    ],
  },
  {
    labelKey: 'settings.groups.system',
    items: [
      { id: 'advanced', icon: <SettingsIcon className="w-3.5 h-3.5" /> },
    ],
  },
];

export default function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-screen"
      style={{ backgroundColor: 'var(--dome-bg)' }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="shrink-0 flex flex-col overflow-y-auto"
        style={{
          width: 188,
          borderRight: '1px solid var(--dome-border)',
          backgroundColor: 'var(--dome-bg-secondary, var(--dome-bg))',
        }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-4 shrink-0">
          <span
            className="text-xs font-bold tracking-widest uppercase"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            {t('settings.title')}
          </span>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 px-2 pb-6 space-y-4" aria-label="Settings navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey}>
              {/* Group label */}
              <p
                className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}
              >
                {t(group.labelKey)}
              </p>

              {/* Items */}
              {group.items.map(({ id, icon }) => {
                const isActive = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSectionChange(id)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors mb-0.5"
                    style={{
                      backgroundColor: isActive ? 'var(--dome-accent-subtle, rgba(101,93,197,0.12))' : 'transparent',
                      color: isActive ? 'var(--dome-accent, #7b76d0)' : 'var(--dome-text-secondary, var(--dome-text-muted))',
                      fontWeight: isActive ? 500 : 400,
                      fontSize: 13,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                          'var(--dome-bg-hover, rgba(0,0,0,0.04))';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color =
                          'var(--dome-text-secondary, var(--dome-text-muted))';
                      }
                    }}
                  >
                    <span style={{ opacity: isActive ? 1 : 0.65 }}>{icon}</span>
                    {t(`settings.tabs.${id}`)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Content area ── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-8 py-8 pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}
