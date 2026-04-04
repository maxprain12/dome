'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Tag, Settings, HelpCircle, WalletCards, Sparkles, Bot, Calendar, Store, Zap } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { getManyAgents } from '@/lib/agents/api';
import { getAgentTeams } from '@/lib/agent-team/api';
import type { ManyAgent, AgentTeam } from '@/types';
import AgentOnboarding from '@/components/agents/AgentOnboarding';
import { startDomeTour } from '@/lib/tour/domeTour';

type SidebarSection = 'library' | 'flashcards' | 'chat' | 'projects' | 'recent' | 'tags' | 'studio' | 'agents' | 'marketplace' | 'agent-teams' | 'automations-hub';

type NavAction = 'navigate' | 'section';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: NavAction;
  path?: string;
  section?: SidebarSection;
  /** Custom isActive check; for section items defaults to activeSection === section */
  isActive?: (activeSection: string) => boolean;
}

interface HomeSidebarProps {
  flashcardDueCount?: number;
}

export default function HomeSidebar({ flashcardDueCount }: HomeSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = useAppStore((s) => s.homeSidebarSection);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const hubProjectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const isCalendar = location.pathname === '/calendar';
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [showAgentOnboarding, setShowAgentOnboarding] = useState(false);

  const loadAgents = useCallback(async () => {
    const list = await getManyAgents(hubProjectId);
    setAgents(list);
  }, [hubProjectId]);

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

  const allNavItems: NavItem[] = [
    { id: 'library', label: t('nav.library'), icon: <Home className="w-5 h-5" strokeWidth={1.5} />, action: 'section', section: 'library' },
    { id: 'calendar', label: t('nav.calendar'), icon: <Calendar className="w-5 h-5" strokeWidth={1.5} />, action: 'navigate', path: '/calendar' },
    { id: 'studio', label: t('nav.studio'), icon: <Sparkles className="w-5 h-5" strokeWidth={1.5} />, action: 'section', section: 'studio' },
    { id: 'flashcards', label: t('nav.flashcards'), icon: <WalletCards className="w-5 h-5" strokeWidth={1.5} />, action: 'section', section: 'flashcards' },
    { id: 'tags', label: t('nav.tags'), icon: <Tag className="w-5 h-5" strokeWidth={1.5} />, action: 'section', section: 'tags' },
    {
      id: 'automations-hub',
      label: t('nav.agents_flows'),
      icon: <Zap className="w-5 h-5" strokeWidth={1.5} />,
      action: 'section',
      section: 'automations-hub',
      isActive: (s) =>
        s === 'automations-hub' ||
        s === 'agents' ||
        s === 'agent-teams' ||
        s.toString().startsWith('agent:') ||
        s.toString().startsWith('workflow:'),
    },
    { id: 'marketplace', label: t('nav.marketplace'), icon: <Store className="w-5 h-5" strokeWidth={1.5} />, action: 'section', section: 'marketplace' },
  ];

  const getIsActive = (item: NavItem) => {
    if (item.action === 'navigate') {
      return location.pathname === item.path;
    }
    if (!isCalendar && item.section) {
      return item.isActive ? item.isActive(activeSection) : activeSection === item.section;
    }
    return false;
  };

  const handleNavClick = (item: NavItem) => {
    if (item.action === 'navigate' && item.path) {
      navigate(item.path);
    } else if (item.action === 'section' && item.section) {
      if (isCalendar) {
        setSection(item.section);
        navigate('/');
      } else {
        setSection(item.section);
      }
    }
  };

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
          {allNavItems.map((item) => {
            const isActive = getIsActive(item);
            return (
              <button
                key={item.id}
                type="button"
                data-tour={item.id === 'agents' ? 'agents' : item.id}
                onClick={() => handleNavClick(item)}
                className="flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)]"
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
          title={t('settings.settings')}
        >
          <Settings className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => startDomeTour()}
          className="flex items-center justify-center w-[40px] h-[40px] rounded-lg opacity-80 hover:opacity-100 hover:bg-[var(--dome-surface)] hover:text-[var(--dome-text)] transition-colors duration-200"
          title={t('common.help_tour')}
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
                projectId={hubProjectId}
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
