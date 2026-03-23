
import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Palette, Brain, Settings as SettingsIcon, MessageCircle, Puzzle, Plug2, Wand2, Database, Cloud, Globe } from 'lucide-react';
import { useHorizontalScroll } from '@/lib/hooks/useHorizontalScroll';

type SettingsSection = 'general' | 'appearance' | 'ai' | 'whatsapp' | 'mcp' | 'skills' | 'plugins' | 'advanced' | 'indexing' | 'cloud' | 'language';

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  children: React.ReactNode;
}

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

interface Tab {
  id: SettingsSection;
  icon: React.ReactNode;
}

const TAB_DEFS: Tab[] = [
  { id: 'general',    icon: <User className="w-3.5 h-3.5" /> },
  { id: 'appearance', icon: <Palette className="w-3.5 h-3.5" /> },
  { id: 'ai',         icon: <Brain className="w-3.5 h-3.5" /> },
  { id: 'skills',     icon: <Wand2 className="w-3.5 h-3.5" /> },
  { id: 'whatsapp',   icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { id: 'mcp',        icon: <Plug2 className="w-3.5 h-3.5" /> },
  { id: 'cloud',      icon: <Cloud className="w-3.5 h-3.5" /> },
  { id: 'plugins',    icon: <Puzzle className="w-3.5 h-3.5" /> },
  { id: 'indexing',   icon: <Database className="w-3.5 h-3.5" /> },
  { id: 'advanced',   icon: <SettingsIcon className="w-3.5 h-3.5" /> },
  { id: 'language',   icon: <Globe className="w-3.5 h-3.5" /> },
];

export default function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  const { t } = useTranslation();
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useHorizontalScroll(navRef);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: 'nearest', behavior: 'smooth', block: 'nearest' });
  }, [activeSection]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--dome-bg)' }}>

      {/* ── Sticky header ── */}
      <div
        className="shrink-0 sticky top-0 z-10"
        style={{ backgroundColor: 'var(--dome-bg)', borderBottom: '1px solid var(--dome-border)' }}
      >
        {/* Title row */}
        <div className="px-6 pt-5 pb-3 flex items-center gap-2.5">
          <div
            className="w-5 h-5 rounded flex items-center justify-center"
            style={{ backgroundColor: DOME_GREEN }}
          >
            <SettingsIcon className="w-3 h-3" style={{ color: DOME_GREEN_LIGHT }} />
          </div>
          <h1 className="text-sm font-bold tracking-wide" style={{ color: 'var(--dome-text)' }}>
            {t('settings.title')}
          </h1>
        </div>

        {/* Tab strip */}
        <nav
          ref={navRef}
          className="flex items-end gap-0.5 px-4 overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
          aria-label="Settings tabs"
        >
          {TAB_DEFS.map((tab) => {
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeTabRef : undefined}
                type="button"
                onClick={() => onSectionChange(tab.id)}
                className="relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors shrink-0"
                style={{
                  color: isActive ? DOME_GREEN : 'var(--dome-text-muted)',
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
                }}
              >
                <span style={{ color: isActive ? DOME_GREEN : 'inherit' }}>{tab.icon}</span>
                {t(`settings.tabs.${tab.id}`)}
                {/* Active underline */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                    style={{ backgroundColor: DOME_GREEN }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-8 py-8 pb-20">
          {children}
        </div>
      </div>
    </div>
  );
}
