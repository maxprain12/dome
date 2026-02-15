'use client';

import { Home, Search, Tag, Settings, HelpCircle, WalletCards, Sparkles } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';

type SidebarSection = 'library' | 'flashcards' | 'chat' | 'projects' | 'recent' | 'tags' | 'studio';

interface NavItem {
  id: SidebarSection;
  label: string;
  icon: React.ReactNode;
}

interface HomeSidebarProps {
  flashcardDueCount?: number;
}

export default function HomeSidebar({ flashcardDueCount }: HomeSidebarProps) {
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);

  const navItems: NavItem[] = [
    { id: 'library', label: 'Library', icon: <Home className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'recent', label: 'Recent', icon: <Search className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'studio', label: 'Studio', icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'flashcards', label: 'Flashcards', icon: <WalletCards className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'tags', label: 'Tags', icon: <Tag className="w-5 h-5" strokeWidth={1.5} /> },
  ];

  return (
    <aside
      className="flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--dome-surface)',
        // Removed right border for a cleaner look, using subtle separation via color/shadow if needed in layout
      }}
    >
      {/* Spacer for drag region transparency */}
      <div className="h-4 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Logo Area */}
      <div
        className="flex items-center justify-center shrink-0 mb-4"
        style={{ padding: '0 8px' }}
      >
        <div className="w-9 h-9 shrink-0 opacity-90 start-item" title="Dome" style={{ filter: 'grayscale(0.2)' }}>
          <svg viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M328.634 306.098V235.894C328.634 182.087 286.288 138.468 234.051 138.468C181.814 138.468 139.467 182.087 139.467 235.894V306.098C139.467 318.605 152.245 326.74 163.106 321.146C171.884 316.625 182.34 317.296 190.506 322.903C199.692 329.212 211.659 329.212 220.846 322.903L224.181 320.613C230.158 316.509 237.944 316.509 243.92 320.613L247.256 322.903C256.442 329.212 268.409 329.212 277.596 322.903C285.761 317.296 296.218 316.625 304.996 321.146C315.856 326.74 328.634 318.605 328.634 306.098Z"
              fill="#E0EAB4"
            />
            <path
              d="M288.333 235.312C288.333 243.148 284.099 249.5 278.875 249.5C273.651 249.5 269.417 243.148 269.417 235.312C269.417 227.477 273.651 221.125 278.875 221.125C284.099 221.125 288.333 227.477 288.333 235.312Z"
              fill="#596037"
            />
            <ellipse cx="222.125" cy="235.312" rx="9.45833" ry="14.1875" fill="#596037" />
            <path
              d="M345.083 322.547V252.343C345.083 198.536 302.737 154.917 250.5 154.917C198.263 154.917 155.917 198.536 155.917 252.343V322.547C155.917 335.054 168.695 343.189 179.555 337.595C188.333 333.075 198.789 333.745 206.955 339.353C216.141 345.661 228.109 345.661 237.295 339.353L240.63 337.062C246.607 332.958 254.393 332.958 260.37 337.062L263.705 339.353C272.891 345.661 284.859 345.661 294.045 339.353C302.211 333.745 312.667 333.075 321.445 337.595C332.305 343.189 345.083 335.054 345.083 322.547Z"
              stroke="#596037"
              strokeWidth="7.59957"
            />
          </svg>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 flex flex-col gap-2 items-center w-full"
        style={{ padding: '0 10px' }}
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className="group relative flex items-center justify-center rounded-xl transition-all duration-200"
              style={{
                width: '42px',
                height: '42px',
                background: isActive ? 'var(--dome-accent-bg)' : 'transparent',
                color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
              }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
            >
              <div className="relative z-10 transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
                {item.icon}
              </div>
              
              {/* Subtle active indicator dot */}
              {isActive && (
                <div 
                  className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[var(--dome-accent)]"
                  style={{ opacity: 0.8 }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Actions */}
      <div
        className="flex flex-col items-center shrink-0 gap-3 pb-4"
      >
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.electron?.openSettings) {
              window.electron.openSettings();
            }
          }}
          className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg)] hover:text-[var(--dome-text)] transition-all"
          title="Settings"
        >
          <Settings className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <button
          className="flex items-center justify-center w-9 h-9 rounded-xl text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg)] hover:text-[var(--dome-text)] transition-all"
          title="Help & Resources"
        >
          <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
