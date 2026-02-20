'use client';

import { useState, useEffect, useCallback } from 'react';
import { Home, Search, Tag, Settings, HelpCircle, WalletCards, Sparkles, Bot, CirclePlus } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { getManyAgents } from '@/lib/agents/api';
import type { ManyAgent } from '@/types';
import AgentOnboarding from '@/components/agents/AgentOnboarding';

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
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [showAgentOnboarding, setShowAgentOnboarding] = useState(false);

  const loadAgents = useCallback(async () => {
    const list = await getManyAgents();
    setAgents(list);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleAgentComplete = useCallback(
    (agent: ManyAgent) => {
      setShowAgentOnboarding(false);
      setAgents((prev) => [agent, ...prev]);
      setSection(`agent:${agent.id}`);
    },
    [setSection]
  );

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
          <img
            src="/many.png"
            alt="Dome"
            width={36}
            height={36}
            style={{ objectFit: 'contain' }}
          />
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

        {/* Agents section - always visible with separator, vertical like nav */}
        <div
          className="w-full mt-2 pt-2 border-t flex flex-col items-center gap-2"
          style={{ borderColor: 'var(--dome-border, rgba(0,0,0,0.12))' }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            title="Agentes"
            style={{ width: '42px', height: '42px', color: 'var(--dome-text-muted)' }}
          >
            <Bot className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <button
            onClick={() => setShowAgentOnboarding(true)}
            className="group relative flex items-center justify-center rounded-xl transition-all duration-200 shrink-0 hover:bg-[var(--dome-bg)]"
            style={{
              width: '42px',
              height: '42px',
              color: 'var(--dome-text-muted)',
            }}
            title="Nuevo agente"
            aria-label="Nuevo agente"
          >
            <div className="transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
              <CirclePlus className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </button>
          {agents.length > 0 ? (
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto w-full">
              {agents.map((agent) => {
                const sectionId = `agent:${agent.id}` as const;
                const isActive = activeSection === sectionId;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSection(sectionId)}
                    className="group flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all"
                    style={{
                      background: isActive ? 'var(--dome-accent-bg)' : 'transparent',
                      color: isActive ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                    }}
                    title={agent.name}
                  >
                    <img
                      src={`/agents/sprite_${agent.iconIndex}.png`}
                      alt=""
                      className="w-6 h-6 shrink-0 object-contain rounded"
                    />
                    <span className="text-xs truncate flex-1 text-left">{agent.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
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

      {/* Agent onboarding modal */}
      {showAgentOnboarding && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[var(--z-modal)]"
          style={{
            backgroundColor: 'var(--translucent)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="relative rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-fade-in"
            style={{
              backgroundColor: 'var(--bg)',
              border: '1px solid var(--border)',
            }}
          >
            <AgentOnboarding
              onComplete={handleAgentComplete}
              onCancel={() => setShowAgentOnboarding(false)}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
