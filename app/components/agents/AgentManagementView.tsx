'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Pencil, Trash2, Plus, Loader2, Download, Upload, Zap, FolderOpen, Clock } from 'lucide-react';
import { getManyAgents, deleteManyAgent, exportAgentsConfig, importAgentsConfig } from '@/lib/agents/api';
import { uninstallMarketplaceAgent } from '@/lib/marketplace/api';
import type { ManyAgent } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import AgentOnboarding from './AgentOnboarding';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useTranslation } from 'react-i18next';

interface AgentManagementViewProps {
  onAgentSelect?: (agentId: string) => void;
  onShowAutomations?: (agentId: string, agentLabel: string) => void;
}

export default function AgentManagementView({ onAgentSelect, onShowAutomations }: AgentManagementViewProps) {
  const { t } = useTranslation();
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

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    const handler = () => void loadAgents();
    window.addEventListener('dome:agents-changed', handler);
    return () => window.removeEventListener('dome:agents-changed', handler);
  }, [loadAgents]);

  const notifyAgentsChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dome:agents-changed'));
  }, []);

  const handleEditComplete = useCallback((agent: ManyAgent) => {
    setEditingAgent(null);
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? agent : a)));
    showToast('success', t('toast.agent_updated'));
    notifyAgentsChanged();
  }, [notifyAgentsChanged]);

  const handleNewComplete = useCallback((agent: ManyAgent) => {
    setShowNewAgent(false);
    setAgents((prev) => [agent, ...prev]);
    showToast('success', t('toast.agent_created'));
    notifyAgentsChanged();
    onAgentSelect?.(agent.id);
  }, [onAgentSelect, notifyAgentsChanged]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const result = deleteTarget.marketplaceId
      ? await uninstallMarketplaceAgent(deleteTarget.marketplaceId)
      : await deleteManyAgent(deleteTarget.id);
    if (result.success) {
      setAgents((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('success', t('toast.agent_deleted'));
      notifyAgentsChanged();
    } else {
      showToast('error', result.error || t('toast.agent_delete_error'));
    }
  }, [deleteTarget, notifyAgentsChanged]);

  const handleExport = useCallback(() => {
    if (agents.length === 0) { showToast('error', t('toast.no_agents_to_export')); return; }
    const json = exportAgentsConfig(agents);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dome-agents-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', t('toast.agents_exported', { count: agents.length }));
  }, [agents, t]);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importAgentsConfig(text);
      if (result.success && result.data) {
        setAgents((prev) => [...prev, ...result.data!]);
        showToast('success', t('toast.agents_exported', { count: result.data.length }));
        notifyAgentsChanged();
      } else {
        showToast('error', result.error || t('toast.agent_import_error'));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('toast.agent_import_error'));
    } finally {
      setImporting(false);
    }
  }, [notifyAgentsChanged, t]);

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
    <>
      <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--dome-bg)' }}>
        {/* Header */}
        <div
          className="shrink-0 flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--dome-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--dome-accent-bg)' }}
            >
              <Bot className="w-5 h-5" style={{ color: 'var(--dome-accent)' }} />
            </div>
            <div>
              <h1 className="text-lg font-bold" style={{ color: 'var(--dome-text)' }}>
                {t('agents.agent_library')}
              </h1>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {agents.length === 1 ? t('agents.agents_configured_one', { count: agents.length }) : t('agents.agents_configured_other', { count: agents.length })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={agents.length === 0}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--dome-surface)]"
              title={t('agents.export_agents')}
            >
              <Download className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--dome-surface)]"
              title={t('agents.import_agents')}
            >
              {importing
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
                : <Upload className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
              }
            </button>
            <button
              onClick={() => setShowNewAgent(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{ background: 'var(--dome-accent)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              {t('ui.add')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-150 motion-reduce:animate-none">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="resource-card-skeleton rounded-xl min-h-[120px]" aria-hidden="true" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4" style={{ color: 'var(--dome-text-muted)' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dome-accent-bg)' }}>
                <FolderOpen className="w-8 h-8" style={{ color: 'var(--dome-accent)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('agents.no_agents_yet')}</p>
              <p className="text-xs max-w-sm text-center">
                {t('agents.no_agents_desc')}
              </p>
              <button
                onClick={() => setShowNewAgent(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'var(--dome-accent)', color: 'white' }}
              >
                <Plus className="w-4 h-4" />
                {t('agents.create_first_agent')}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-150 motion-reduce:animate-none">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onAgentSelect?.(agent.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAgentSelect?.(agent.id); }
                  }}
                  className="flex items-start gap-4 p-4 rounded-xl text-left transition-all hover:shadow-md group cursor-pointer"
                  style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ background: 'var(--dome-accent-bg)' }}
                  >
                    <img
                      src={`/agents/sprite_${agent.iconIndex}.png`}
                      alt={agent.name}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--dome-text)' }}>{agent.name}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                      {agent.description || `${agent.toolIds?.length ?? 0} herramienta${(agent.toolIds?.length ?? 0) !== 1 ? 's' : ''}`}
                    </p>
                    {agent.updatedAt && (
                      <p className="flex items-center gap-1 text-xs mt-2" style={{ color: 'var(--dome-text-muted)' }}>
                        <Clock className="w-3 h-3" />
                        {new Date(agent.updatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Hover actions */}
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    {onShowAutomations && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onShowAutomations(agent.id, agent.name); }}
                        className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)] transition-colors"
                        title={t('agents.automations')}
                      >
                        <Zap className="w-3.5 h-3.5" style={{ color: 'var(--dome-accent)' }} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingAgent(agent); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--dome-bg)] transition-colors"
                      title={t('ui.edit')}
                    >
                      <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(agent); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--error-bg)] transition-colors"
                      title={t('ui.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--error)' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('agents.delete_agent')}
        message={deleteTarget ? t('agents.delete_agent_confirm', { name: deleteTarget.name }) : ''}
        variant="danger"
        confirmLabel={t('ui.delete')}
        cancelLabel={t('ui.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
