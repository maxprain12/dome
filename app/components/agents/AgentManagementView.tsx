'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Pencil, Trash2, Plus, Loader2, Download, Upload } from 'lucide-react';
import { getManyAgents, deleteManyAgent, exportAgentsConfig, importAgentsConfig } from '@/lib/agents/api';
import type { ManyAgent } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import AgentOnboarding from './AgentOnboarding';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--primary-text)' }}>
            Agentes
          </h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--secondary-text)' }}>
            {agents.length} agente{agents.length !== 1 ? 's' : ''} configurado{agents.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={agents.length === 0}
            className="btn btn-secondary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exportar
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
            className="btn btn-secondary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar
          </button>
          <button
            type="button"
            onClick={() => setShowNewAgent(true)}
            className="btn btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Nuevo agente
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ background: 'rgba(123, 118, 208, 0.08)' }}
            >
              <Bot className="w-10 h-10" style={{ color: 'var(--accent)' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--primary-text)' }}>
              No hay agentes todavía
            </h3>
            <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--secondary-text)' }}>
              Crea agentes especializados con instrucciones, herramientas y MCP personalizados.
            </p>
            <button
              type="button"
              onClick={() => setShowNewAgent(true)}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear primer agente
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="group flex items-center gap-4 p-4 rounded-xl transition-all border"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <img
                  src={`/agents/sprite_${agent.iconIndex}.png`}
                  alt=""
                  className="w-12 h-12 shrink-0 object-contain rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-sm font-semibold truncate"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    {agent.name}
                  </h3>
                  {agent.description && (
                    <p
                      className="text-xs truncate mt-0.5"
                      style={{ color: 'var(--secondary-text)' }}
                    >
                      {agent.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAgentSelect?.(agent.id)}
                    className="text-sm font-medium px-3 py-1.5 rounded-lg"
                    style={{
                      background: 'var(--accent-bg)',
                      color: 'var(--accent)',
                    }}
                  >
                    Chatear
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(agent)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ color: 'var(--secondary-text)' }}
                    title="Editar"
                    aria-label="Editar agente"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(agent)}
                    className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                    style={{ color: 'var(--error, #ef4444)' }}
                    title="Eliminar"
                    aria-label="Eliminar agente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
