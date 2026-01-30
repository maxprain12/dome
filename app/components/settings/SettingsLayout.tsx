'use client';

import { User, Palette, Brain, Settings as SettingsIcon, MessageCircle } from 'lucide-react';

type SettingsSection = 'general' | 'appearance' | 'ai' | 'whatsapp' | 'advanced';

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  children: React.ReactNode;
}

interface SidebarItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
}

const sidebarItems: SidebarItem[] = [
  {
    id: 'general',
    label: 'General',
    icon: <User className="w-4 h-4" />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: <Palette className="w-4 h-4" />,
  },
  {
    id: 'ai',
    label: 'AI Configuration',
    icon: <Brain className="w-4 h-4" />,
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: <MessageCircle className="w-4 h-4" />,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: <SettingsIcon className="w-4 h-4" />,
  },
];

export default function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Sidebar */}
      <div
        className="w-64 border-r flex flex-col pt-8" // Added pt-8 for safe zone (traffic lights)
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-5">
          <h1 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--secondary-text)' }}>
            Settings
          </h1>
        </div>

        <nav className="flex-1 px-3 space-y-0.5" aria-label="Settings sections">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-secondary)]"
              style={{
                backgroundColor: activeSection === item.id ? 'var(--primary-subtle)' : 'transparent',
                color: activeSection === item.id ? 'var(--accent)' : 'var(--secondary-text)',
              }}
              onMouseEnter={(e) => {
                if (activeSection !== item.id) {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== item.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span className="shrink-0 opacity-90" style={{ color: activeSection === item.id ? 'var(--accent)' : 'var(--secondary-text)' }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top padding for drag region/safe zone interaction */}
        <div className="h-8 w-full app-drag-region shrink-0" />

        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar scrollbar-gutter-stable">
          <div className="max-w-3xl mx-auto pl-8 pr-12 pt-4 pb-20">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
