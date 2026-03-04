import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import { getAgentTeams, createAgentTeam, deleteAgentTeam } from '@/lib/agent-team/api';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import AgentTeamOnboarding from '@/components/agent-team/AgentTeamOnboarding';
import type { AgentTeam } from '@/types';

export default function WorkflowView() {
  const setSection = useAppStore((s) => s.setHomeSidebarSection);
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentTeam | null>(null);

  const loadTeams = useCallback(async () => {
    const list = await getAgentTeams();
    setTeams(list);
  }, []);

  useEffect(() => {
    loadTeams();
    const handler = () => loadTeams();
    window.addEventListener('dome:teams-changed', handler);
    return () => window.removeEventListener('dome:teams-changed', handler);
  }, [loadTeams]);

  const handleTeamCreated = useCallback(
    (team: AgentTeam) => {
      setShowCreate(false);
      setTeams((prev) => [team, ...prev]);
      setSection(`team:${team.id}`);
      window.dispatchEvent(new Event('dome:teams-changed'));
    },
    [setSection]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteAgentTeam(deleteTarget.id);
    setTeams((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    setDeleteTarget(null);
    window.dispatchEvent(new Event('dome:teams-changed'));
  }, [deleteTarget]);

  return (
    <div className="workflow-list">
      <div className="workflow-list__header">
        <div>
          <h1 className="workflow-list__title">Canvas Workflows</h1>
          <p className="workflow-list__subtitle">
            Orquesta agentes con flujos visuales de trabajo
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary flex items-center gap-2"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={16} />
          <span>Nuevo workflow</span>
        </button>
      </div>

      {teams.length === 0 && !showCreate ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <WorkflowIcon size={28} style={{ color: 'var(--dome-accent)' }} />
          </div>
          <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>
            No hay workflows todavía
          </h3>
          <p className="text-sm mb-4 max-w-sm" style={{ color: 'var(--dome-text-secondary)' }}>
            Crea tu primer workflow para conectar agentes, documentos y textos en un canvas visual.
          </p>
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={16} />
            <span>Crear workflow</span>
          </button>
        </div>
      ) : (
        <div className="workflow-list__grid">
          {teams.map((team) => (
            <div
              key={team.id}
              className="workflow-card group"
              onClick={() => setSection(`team:${team.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSection(`team:${team.id}`);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="workflow-card__icon">
                  {team.icon ? (
                    <img src={team.icon} alt={team.name} className="w-10 h-10 rounded-lg" />
                  ) : (
                    <WorkflowIcon size={28} style={{ color: 'var(--dome-accent)' }} />
                  )}
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(team);
                  }}
                  title="Eliminar"
                >
                  <Trash2 size={14} className="text-red-400" />
                </button>
              </div>
              <h3 className="workflow-card__name">{team.name}</h3>
              <p className="workflow-card__desc">
                {team.description || 'Sin descripción'}
              </p>
              <div className="workflow-card__meta">
                <span className="workflow-card__badge">
                  {(team.memberIds?.length || 0)} agentes
                </span>
                <span className="workflow-card__badge">Canvas</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] bg-black/50 backdrop-blur-sm">
          <div className="relative rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden bg-[var(--dome-bg)] border border-[var(--dome-border)]">
            <AgentTeamOnboarding
              onComplete={handleTeamCreated}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar workflow"
        message={`¿Estás seguro de que quieres eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
        variant="danger"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
