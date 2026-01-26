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
          borderColor: 'var(--border-subtle)', // Softer border
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Header */}
        <div className="px-6 py-4">
          {/* Removed border-b for cleaner look */}
          <h1 className="text-sm font-semibold uppercase tracking-wider opacity-70" style={{ color: 'var(--secondary)' }}>
            Settings
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 ${activeSection === item.id ? 'bg-white/10 shadow-sm' : 'hover:bg-white/5'
                }`}
              style={{
                backgroundColor: activeSection === item.id ? 'var(--active-item-bg)' : 'transparent',
                color: activeSection === item.id ? 'var(--primary)' : 'var(--secondary)',
              }}
            >
              {/* Icons slightly smaller/subtler */}
              <span className="opacity-80">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top padding for drag region/safe zone interaction */}
        <div className="h-8 w-full app-drag-region shrink-0" />

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto p-8 pt-4 pb-20">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
