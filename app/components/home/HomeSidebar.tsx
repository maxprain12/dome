'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Tag, Settings, HelpCircle, WalletCards, Sparkles, Bot, CirclePlus, Calendar, Store, Workflow } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { getManyAgents } from '@/lib/agents/api';
import { getAgentTeams } from '@/lib/agent-team/api';
import type { ManyAgent, AgentTeam } from '@/types';
import AgentOnboarding from '@/components/agents/AgentOnboarding';
import { startDomeTour } from '@/lib/tour/domeTour';

type SidebarSection = 'library' | 'flashcards' | 'chat' | 'projects' | 'recent' | 'tags' | 'studio' | 'agents' | 'marketplace' | 'agent-teams';

interface NavItem {
  id: SidebarSection;
  label: string;
  icon: React.ReactNode;
}

interface HomeSidebarProps {
  flashcardDueCount?: number;
}

export default function HomeSidebar({ flashcardDueCount }: HomeSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const isCalendar = location.pathname === '/calendar';
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [showAgentOnboarding, setShowAgentOnboarding] = useState(false);

  const loadAgents = useCallback(async () => {
    const list = await getManyAgents();
    setAgents(list);
  }, []);

  const loadTeams = useCallback(async () => {
    const list = await getAgentTeams();
    setTeams(list);
  }, []);

  useEffect(() => {
    loadAgents();
    loadTeams();
  }, [loadAgents, loadTeams]);

  useEffect(() => {
    const handler = () => loadAgents();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, [loadAgents]);

  useEffect(() => {
    const handler = () => loadTeams();
    window.addEventListener('dome:teams-changed', handler);
    return () => window.removeEventListener('dome:teams-changed', handler);
  }, [loadTeams]);

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
    { id: 'studio', label: 'Studio', icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'flashcards', label: 'Flashcards', icon: <WalletCards className="w-5 h-5" strokeWidth={1.5} /> },
    { id: 'tags', label: 'Tags', icon: <Tag className="w-5 h-5" strokeWidth={1.5} /> },
  ];

  return (
    <aside
      className="flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out relative z-50 text-[var(--dome-text-muted)] group/sidebar"
      style={{
        width: 'var(--sidebar-width, 64px)',
        background: 'var(--dome-bg)',
        borderRight: '1px solid var(--dome-border)',
      }}
    >
      {/* Spacer for drag region transparency */}
      <div className="h-4 shrink-0 w-full" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Logo Area */}
      <div
        className="flex items-center justify-center shrink-0 mb-4"
        style={{ padding: '0 8px' }}
      >
        <div className="w-8 h-8 shrink-0 start-item" title="Dome" style={{ filter: 'var(--dome-logo-filter)' }}>
          <img
            src="/many.png"
            alt="Dome"
            width={32}
            height={32}
            style={{ objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full scrollbar-none pb-4" style={{ padding: '0 12px' }}>
        <nav className="flex flex-col gap-1 items-center w-full">
          {/* Main Apps */}
          {navItems.filter((i) => i.id === 'library').map((item) => {
            const isActive = !isCalendar && activeSection === item.id;
            return (
              <button
                key={item.id}
                data-tour={item.id}
                onClick={() => {
                  if (isCalendar) navigate('/');
                  setSection(item.id);
                }}
                className={`flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]`}
                style={{
                  width: '40px',
                  height: '40px',
                  background: isActive ? 'var(--dome-surface)' : 'transparent',
                  color: isActive ? 'var(--dome-text)' : 'inherit',
                }}
                title={item.label}
              >
                <div className="relative z-10 opacity-80">
                  {item.icon}
                </div>
              </button>
            );
          })}

          <button
            onClick={() => navigate('/calendar')}
            className={`flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]`}
            style={{
              width: '40px',
              height: '40px',
              background: isCalendar ? 'var(--dome-surface)' : 'transparent',
              color: isCalendar ? 'var(--dome-text)' : 'inherit',
            }}
            title="Calendario"
          >
            <div className="relative z-10 opacity-80">
              <Calendar className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </button>

          {navItems.filter((i) => i.id !== 'library').map((item) => {
            const isActive = !isCalendar && activeSection === item.id;
            return (
              <button
                key={item.id}
                data-tour={item.id}
                onClick={() => {
                  if (isCalendar) navigate('/');
                  setSection(item.id);
                }}
                className={`flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]`}
                style={{
                  width: '40px',
                  height: '40px',
                  background: isActive ? 'var(--dome-surface)' : 'transparent',
                  color: isActive ? 'var(--dome-text)' : 'inherit',
                }}
                title={item.label}
              >
                <div className="relative z-10 opacity-80">
                  {item.icon}
                </div>
              </button>
            );
          })}

          {/* AI Ecosystem - Agents, Teams, Marketplace */}
          <button
            data-tour="agents"
            onClick={() => {
              if (isCalendar) navigate('/');
              setSection('agents');
            }}
            className={`flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]`}
            style={{
              width: '40px',
              height: '40px',
              background: !isCalendar && activeSection === 'agents' ? 'var(--dome-surface)' : 'transparent',
              color: !isCalendar && activeSection === 'agents' ? 'var(--dome-text)' : 'inherit',
            }}
            title="Agentes"
          >
            <div className="relative z-10 opacity-80">
              <Bot className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </button>

          <button
            onClick={() => {
              if (isCalendar) navigate('/');
              setSection('agent-teams');
            }}
            className={`flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]`}
            style={{
              width: '40px',
              height: '40px',
              background: !isCalendar && (activeSection === 'agent-teams' || activeSection.toString().startsWith('team:')) ? 'var(--dome-surface)' : 'transparent',
              color: !isCalendar && (activeSection === 'agent-teams' || activeSection.toString().startsWith('team:')) ? 'var(--dome-text)' : 'inherit',
            }}
            title="Equipos"
          >
            <div className="relative z-10 opacity-80">
              <Workflow className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </button>

          <button
            onClick={() => {
              if (isCalendar) navigate('/');
              setSection('marketplace');
            }}
            className={`flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]`}
            style={{
              width: '40px',
              height: '40px',
              background: !isCalendar && activeSection === 'marketplace' ? 'var(--dome-surface)' : 'transparent',
              color: !isCalendar && activeSection === 'marketplace' ? 'var(--dome-text)' : 'inherit',
            }}
            title="Marketplace"
          >
            <div className="relative z-10 opacity-80">
              <Store className="w-5 h-5" strokeWidth={1.5} />
            </div>
          </button>
        </nav>
      </div>

      {/* Footer Actions */}
      <div className="flex flex-col items-center shrink-0 gap-1 pb-4 pt-2 border-t border-[var(--dome-border)] bg-[var(--dome-bg)] w-full">
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.electron?.openSettings) {
              window.electron.openSettings();
            }
          }}
          className="flex items-center justify-center w-[40px] h-[40px] rounded-lg opacity-80 hover:opacity-100 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)] transition-colors duration-200"
          title="Ajustes"
        >
          <Settings className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => startDomeTour()}
          className="flex items-center justify-center w-[40px] h-[40px] rounded-lg opacity-80 hover:opacity-100 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)] transition-colors duration-200"
          title="Ayuda y Tour"
        >
          <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div >

      {/* Agent onboarding modal */}
      {
        showAgentOnboarding && (
          <div
            className="fixed inset-0 flex items-center justify-center z-[var(--z-modal)] bg-black/50 backdrop-blur-sm transition-opacity duration-200"
          >
            <div
              className="relative rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden bg-[var(--dome-bg)] border border-[var(--dome-border)]"
            >
              <AgentOnboarding
                onComplete={handleAgentComplete}
                onCancel={() => setShowAgentOnboarding(false)}
              />
            </div>
          </div>
        )
      }
    </aside >
  );
}
