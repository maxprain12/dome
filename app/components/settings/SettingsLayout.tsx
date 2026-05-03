import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User, Palette, Brain, Mic, Settings as SettingsIcon,
  MessageCircle, Puzzle, Plug2, Wand2, Database, Cloud,
  Globe, BookMarked, Calendar, Server,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DomeButton from '@/components/ui/DomeButton';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'ai'
  | 'transcription'
  | 'whatsapp'
  | 'mcp'
  | 'dome_mcp'
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
      { id: 'dome_mcp', icon: <Server className="w-3.5 h-3.5" /> },
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
          <DomeSectionLabel compact={false} className="!text-xs !font-bold !tracking-widest text-[var(--dome-text-muted)]">
            {t('settings.title')}
          </DomeSectionLabel>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 px-2 pb-6 space-y-4" aria-label="Settings navigation">
          {NAV_GROUPS.map((group) => (
                       <div key={group.labelKey}>
              <DomeSectionLabel className="px-2 mb-1 opacity-60 text-[var(--dome-text-muted)]">
                {t(group.labelKey)}
              </DomeSectionLabel>

              {group.items.map(({ id, icon }) => {
                const isActive = activeSection === id;
                return (
                  <DomeButton
                    key={id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSectionChange(id)}
                    className={cn(
                      'w-full justify-start gap-2.5 px-2.5 py-1.5 mb-0.5 rounded-md text-[13px] font-normal h-auto min-h-0',
                      isActive
                        ? 'bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] text-[var(--dome-accent,#7b76d0)] font-medium hover:bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))]'
                        : 'text-[var(--dome-text-secondary,var(--dome-text-muted))] hover:bg-[var(--dome-bg-hover,rgba(0,0,0,0.04))] hover:text-[var(--dome-text)]',
                    )}
                  >
                    <span className={cn('shrink-0', !isActive && 'opacity-65')}>{icon}</span>
                    {t(`settings.tabs.${id}`)}
                  </DomeButton>
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
