'use client';

import { useState, useEffect, useCallback } from 'react';
import { Workflow, PlusCircle, Trash2, Users, ChevronRight } from 'lucide-react';
import type { AgentTeam, ManyAgent } from '@/types';
import { getAgentTeams, deleteAgentTeam } from '@/lib/agent-team/api';
import { getManyAgents } from '@/lib/agents/api';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import AgentTeamOnboarding from './AgentTeamOnboarding';

export default function AgentTeamView() {
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentTeam | null>(null);
  const setSection = useAppStore((s) => s.setHomeSidebarSection);

  const load = useCallback(async () => {
    const [t, a] = await Promise.all([getAgentTeams(), getManyAgents()]);
    setTeams(t);
    setAgents(a);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreated = (team: AgentTeam) => {
    setShowCreate(false);
    setTeams((prev) => [...prev, team]);
    setSection(`team:${team.id}` as `team:${string}`);
    window.dispatchEvent(new CustomEvent('dome:teams-changed'));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const result = await deleteAgentTeam(deleteTarget.id);
    if (result.success) {
      setTeams((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      showToast('success', 'Equipo eliminado');
      window.dispatchEvent(new CustomEvent('dome:teams-changed'));
    } else {
      showToast('error', result.error ?? 'Error al eliminar');
    }
    setDeleteTarget(null);
  };

  const getMemberNames = (team: AgentTeam) => {
    return team.memberAgentIds
      .map((id) => agents.find((a) => a.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-5"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <Workflow className="w-5 h-5" style={{ color: 'var(--dome-accent, #6366f1)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--dome-text)' }}>
              Agent Teams
            </h1>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              Equipos de agentes orquestados
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all"
          style={{
            background: 'var(--dome-accent, #6366f1)',
            color: 'white',
          }}
        >
          <PlusCircle className="w-4 h-4" />
          Nuevo equipo
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
            <div
              className="w-16 h-16 flex items-center justify-center rounded-2xl"
              style={{ background: 'var(--dome-surface)' }}
            >
              <Workflow className="w-8 h-8" style={{ color: 'var(--dome-text-muted)' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>
                Sin equipos todavía
              </h2>
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                Crea un equipo para orquestar varios agentes colaborando en una misma tarea.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'var(--dome-accent, #6366f1)', color: 'white' }}
            >
              <PlusCircle className="w-4 h-4" />
              Crear mi primer equipo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {teams.map((team) => {
              const memberNames = getMemberNames(team);
              const memberAvatars = team.memberAgentIds
                .slice(0, 4)
                .map((id) => agents.find((a) => a.id === id))
                .filter((a): a is ManyAgent => a !== null);

              return (
                <div
                  key={team.id}
                  className="group flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: 'var(--dome-surface)',
                    border: '1px solid var(--dome-border)',
                  }}
                  onClick={() => setSection(`team:${team.id}` as `team:${string}`)}
                >
                  {/* Icon */}
                  <div
                    className="w-12 h-12 shrink-0 rounded-xl overflow-hidden"
                    style={{ background: 'var(--dome-accent-bg)' }}
                  >
                    <img
                      src={`/agents/sprite_${team.iconIndex}.png`}
                      alt={team.name}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>
                      {team.name}
                    </h3>
                    {team.description && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--dome-text-muted)' }}>
                        {team.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex -space-x-1">
                        {memberAvatars.map((a) => (
                          <img
                            key={a.id}
                            src={`/agents/sprite_${a.iconIndex}.png`}
                            alt={a.name}
                            title={a.name}
                            className="w-5 h-5 rounded-full object-contain"
                            style={{ background: 'var(--dome-bg)', border: '1.5px solid var(--dome-surface)' }}
                          />
                        ))}
                        {team.memberAgentIds.length > 4 && (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                            style={{
                              background: 'var(--dome-bg)',
                              color: 'var(--dome-text-muted)',
                              border: '1.5px solid var(--dome-surface)',
                              fontSize: '9px',
                            }}
                          >
                            +{team.memberAgentIds.length - 4}
                          </div>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                        <Users className="inline w-3 h-3 mr-0.5" />
                        {team.memberAgentIds.length} agentes
                        {memberNames ? ` · ${memberNames}` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(team);
                      }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                      style={{
                        color: 'var(--dome-text-muted)',
                        background: 'var(--dome-bg)',
                      }}
                      title="Eliminar equipo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[var(--z-modal)]"
          style={{ backgroundColor: 'var(--translucent)', backdropFilter: 'blur(8px)' }}
        >
          <div
            className="relative rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-fade-in"
            style={{ background: 'var(--bg, var(--dome-surface))', border: '1px solid var(--dome-border)' }}
          >
            <AgentTeamOnboarding
              onComplete={handleCreated}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen={!!deleteTarget}
          title="Eliminar equipo"
          message={`¿Eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
