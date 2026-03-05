'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Pencil, Trash2, Plus, Loader2, Download, Upload } from 'lucide-react';
import { getManyAgents, deleteManyAgent, exportAgentsConfig, importAgentsConfig } from '@/lib/agents/api';
import { uninstallMarketplaceAgent } from '@/lib/marketplace/api';
import type { ManyAgent } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import AgentOnboarding from './AgentOnboarding';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import TabLayout from '@/components/home/TabLayout';

interface AgentManagementViewProps {
  onAgentSelect?: (agentId: string) => void;
}

export default function AgentManagementView({ onAgentSelect }: AgentManagementViewProps) {
  const [agents, setAgents] = useState<ManyAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAgent, setEditingAgent] = useState<ManyAgent | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManyAgent | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    const list = await getManyAgents();
    setAgents(list);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleEdit = useCallback((agent: ManyAgent) => {
    setEditingAgent(agent);
  }, []);

  const handleDelete = useCallback((agent: ManyAgent) => {
    setDeleteTarget(agent);
  }, []);

  const notifyAgentsChanged = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dome:agents-changed'));
    }
  }, []);

  const handleEditComplete = useCallback(
    (agent: ManyAgent) => {
      setEditingAgent(null);
      setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
      showToast('success', 'Agente actualizado');
      notifyAgentsChanged();
    },
    [notifyAgentsChanged]
  );

  const handleNewComplete = useCallback(
    (agent: ManyAgent) => {
      setShowNewAgent(false);
      setAgents((prev) => [agent, ...prev]);
      showToast('success', 'Agente creado');
      notifyAgentsChanged();
      onAgentSelect?.(agent.id);
    },
    [onAgentSelect, notifyAgentsChanged]
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    if (deleteTarget.marketplaceId) {
      await uninstallMarketplaceAgent(deleteTarget.marketplaceId);
    }
    const result = await deleteManyAgent(deleteTarget.id);
    if (result.success) {
      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('success', 'Agente eliminado');
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || 'Error al eliminar');
    }
  }, [deleteTarget, notifyAgentsChanged]);

  const handleExport = useCallback(() => {
    if (agents.length === 0) {
      showToast('error', 'No hay agentes para exportar');
      return;
    }
    const json = exportAgentsConfig(agents);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dome-agents-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', `${agents.length} agente${agents.length !== 1 ? 's' : ''} exportado${agents.length !== 1 ? 's' : ''}`);
  }, [agents]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setImporting(true);
      try {
        const text = await file.text();
        const result = await importAgentsConfig(text);
        if (result.success && result.data) {
          setAgents((prev) => [...prev, ...result.data!]);
          showToast('success', `${result.data.length} agente${result.data.length !== 1 ? 's' : ''} importado${result.data.length !== 1 ? 's' : ''}`);
          notifyAgentsChanged();
        } else {
          showToast('error', result.error || 'Error al importar');
        }
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : 'Error al importar');
      } finally {
        setImporting(false);
      }
    },
    [notifyAgentsChanged]
  );

  if (editingAgent) {
    return (
      <div className="h-full flex flex-col">
        <AgentOnboarding
          initialAgent={editingAgent}
          onComplete={handleEditComplete}
          onCancel={() => setEditingAgent(null)}
        />
      </div>
    );
  }

  if (showNewAgent) {
    return (
      <div className="h-full flex flex-col">
        <AgentOnboarding
          onComplete={handleNewComplete}
          onCancel={() => setShowNewAgent(false)}
        />
      </div>
    );
  }

  const actionsEl = (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={handleExport}
        disabled={agents.length === 0}
        className="flex items-center justify-center w-9 h-9 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--dome-surface)]"
        title="Exportar"
      >
        <Download className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFile}
      />
      <button
        type="button"
        onClick={handleImportClick}
        disabled={importing}
        className="flex items-center justify-center w-9 h-9 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--dome-surface)]"
        title="Importar"
      >
        {importing ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--dome-text-muted)' }} /> : <Upload className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />}
      </button>
      <button
        type="button"
        onClick={() => setShowNewAgent(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all"
        style={{
          background: 'var(--dome-accent, #6366f1)',
          color: 'white',
        }}
      >
        <Plus className="w-4 h-4" />
        Nuevo agente
      </button>
    </div>
  );

  const skeletonEl = (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="resource-card-list-skeleton rounded-xl h-[80px]"
          aria-hidden="true"
        />
      ))}
    </div>
  );

  return (
    <>
      <TabLayout
        icon={<Bot className="w-5 h-5" />}
        title="Agent Hub"
        description={`${agents.length} agente${agents.length !== 1 ? 's' : ''} configurado${agents.length !== 1 ? 's' : ''}`}
        actions={actionsEl}
        loading={isLoading}
        skeleton={skeletonEl}
      >
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20 gap-5 text-center">
            <div
              className="w-16 h-16 flex items-center justify-center rounded-2xl"
              style={{ background: 'var(--dome-surface)' }}
            >
              <Bot className="w-8 h-8" style={{ color: 'var(--dome-text-muted)' }} />
            </div>
            <div>
              <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>
                No hay agentes todavía
              </h2>
              <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--dome-text-muted)' }}>
                Crea agentes especializados con instrucciones, herramientas y conexiones personalizadas.
              </p>
            </div>
            <button
              onClick={() => setShowNewAgent(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all mt-2"
              style={{ background: 'var(--dome-accent, #6366f1)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              Crear mi primer agente
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 animate-in fade-in duration-150 motion-reduce:animate-none">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="group flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl transition-all cursor-pointer"
                onClick={() => onAgentSelect?.(agent.id)}
                style={{
                  background: 'var(--dome-surface)',
                  border: '1px solid var(--dome-border)',
                }}
              >
                {/* Icon */}
                <div
                  className="w-12 h-12 shrink-0 rounded-xl overflow-hidden"
                  style={{ background: 'var(--dome-accent-bg)' }}
                >
                  <img
                    src={`/agents/sprite_${agent.iconIndex}.png`}
                    alt={agent.name}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3
                    className="text-sm font-semibold truncate"
                    style={{ color: 'var(--dome-text)' }}
                  >
                    {agent.name}
                  </h3>
                  {agent.description && (
                    <p
                      className="text-xs truncate mt-0.5"
                      style={{ color: 'var(--dome-text-muted)' }}
                    >
                      {agent.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAgentSelect?.(agent.id);
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      background: 'var(--dome-accent-bg)',
                      color: 'var(--dome-accent)',
                    }}
                  >
                    Chatear
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(agent);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                    style={{
                      color: 'var(--dome-text-muted)',
                      background: 'var(--dome-bg)',
                    }}
                    title="Editar"
                    aria-label="Editar agente"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(agent);
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                    style={{
                      color: 'var(--dome-text-muted)',
                      background: 'var(--dome-bg)',
                    }}
                    title="Eliminar"
                    aria-label="Eliminar agente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabLayout>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar agente"
        message={
          deleteTarget
            ? `¿Eliminar "${deleteTarget.name}"? Esta acción no se puede deshacer.`
            : ''
        }
        variant="danger"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
