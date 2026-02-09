
import { Home, Search, Tag, Folder, Settings } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';

type SidebarSection = 'library' | 'flashcards' | 'chat' | 'projects' | 'recent' | 'tags';

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
  const { name } = useUserStore();

  const navItems: NavItem[] = [
    {
      id: 'library',
      label: 'Home',
      icon: <Home className="w-[18px] h-[18px]" strokeWidth={2} />,
    },
    {
      id: 'recent',
      label: 'Search',
      icon: <Search className="w-[18px] h-[18px]" strokeWidth={2} />,
    },
    {
      id: 'tags',
      label: 'Tags',
      icon: <Tag className="w-[18px] h-[18px]" strokeWidth={2} />,
    },
  ];

  const collections = [
    { label: 'Research Papers' },
    { label: 'Notes' },
    { label: 'Web Links' },
  ];

  // Generate initials from user name
  const initials = name
    ? name
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('')
    : 'U';

  return (
    <aside
      className="flex flex-col h-full shrink-0"
      style={{
        width: 'var(--sidebar-width)',
        background: 'var(--dome-surface)',
        borderRight: '1px solid var(--dome-border)',
      }}
    >
      {/* macOS traffic lights padding */}
      <div className="h-10 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Logo section */}
      <div
        style={{
          padding: '0 20px 24px',
          borderBottom: '1px solid var(--dome-border)',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 shrink-0">
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
          <span
            className="text-lg font-semibold"
            style={{ color: 'var(--dome-text)' }}
          >
            Dome
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className="flex-1 flex flex-col gap-1 overflow-y-auto"
        style={{ padding: '24px 12px' }}
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className="w-full flex items-center gap-3 rounded-lg transition-all duration-200"
              style={{
                padding: '10px 12px',
                background: isActive ? 'var(--dome-accent-bg)' : 'transparent',
                color: isActive ? 'var(--dome-text)' : 'var(--dome-text-secondary)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--dome-bg)';
                  e.currentTarget.style.color = 'var(--dome-text)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--dome-text-secondary)';
                }
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="shrink-0" style={{ color: isActive ? 'var(--dome-accent)' : 'currentColor' }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Collections section */}
        <div
          style={{
            padding: '16px 12px 8px',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--dome-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Collections
        </div>

        {collections.map((col) => (
          <button
            key={col.label}
            onClick={() => setSection('library')}
            className="w-full flex items-center gap-3 rounded-lg transition-all duration-200"
            style={{
              padding: '10px 12px',
              background: 'transparent',
              color: 'var(--dome-text-secondary)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--dome-bg)';
              e.currentTarget.style.color = 'var(--dome-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--dome-text-secondary)';
            }}
          >
            <Folder className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
            <span>{col.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid var(--dome-border)',
          padding: '20px',
        }}
      >
        {/* Settings link */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.electron?.openSettings) {
              window.electron.openSettings();
            }
          }}
          className="w-full flex items-center gap-3 rounded-lg transition-all duration-200 mb-3"
          style={{
            padding: '8px 8px',
            color: 'var(--dome-text-muted)',
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            fontSize: '13px',
            fontWeight: 500,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--dome-bg)';
            e.currentTarget.style.color = 'var(--dome-text)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--dome-text-muted)';
          }}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          <span>Settings</span>
        </button>

        {/* User profile */}
        <div
          className="flex items-center gap-3 rounded-lg transition-all duration-200"
          style={{
            padding: '8px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--dome-bg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--dome-accent)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="truncate"
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--dome-text)',
              }}
            >
              {name || 'User'}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--dome-text-muted)',
              }}
            >
              Online
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
