'use client';

import { X, Download, ArrowRight, Bot, Type, FileText, Image, Terminal, Play, Clock, Zap, Lightbulb, Sparkles } from 'lucide-react';
import type { WorkflowTemplate } from '@/types/canvas';

interface WorkflowDetailProps {
  workflow: WorkflowTemplate;
  isInstalled: boolean;
  hasUpdate?: boolean;
  isInstalling: boolean;
  onInstall: (workflow: WorkflowTemplate) => void;
  onClose: () => void;
}

const FALLBACK_META = { label: 'Nodo', color: 'var(--dome-accent)', Icon: Bot };

const NODE_TYPE_META: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  'text-input': { label: 'Texto', color: 'var(--dome-accent)', Icon: Type },
  document: { label: 'Documento', color: 'var(--success)', Icon: FileText },
  image: { label: 'Imagen', color: 'var(--warning)', Icon: Image },
  agent: { label: 'Agente', color: 'var(--dome-accent)', Icon: Bot },
  output: { label: 'Resultado', color: 'var(--dome-accent)', Icon: Terminal },
};

const DIFFICULTY_STYLES = {
  beginner: { bg: '#f0fdf4', text: '#15803d', label: 'Básico', icon: '🟢' },
  intermediate: { bg: '#fffbeb', text: '#92400e', label: 'Medio', icon: '🟡' },
  advanced: { bg: '#fef2f2', text: '#991b1b', label: 'Avanzado', icon: '🔴' },
};

export default function WorkflowDetail({
  workflow,
  isInstalled,
  hasUpdate = false,
  isInstalling,
  onInstall,
  onClose,
}: WorkflowDetailProps) {
  const agentNodes = workflow.nodes.filter((n) => n.data.type === 'agent');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start gap-3 px-5 py-4"
          style={{
            borderBottom: '1px solid var(--dome-border)',
            background: 'var(--dome-accent-bg)',
          }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-bold" style={{ color: 'var(--dome-accent)' }}>
                {workflow.name}
              </h2>
              {workflow.featured && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                  style={{ background: 'var(--dome-bg)', color: 'var(--dome-accent)', border: '1px solid var(--dome-border)' }}
                >
                  <Sparkles className="w-3 h-3" /> Dome Team
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
              {workflow.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/50"
          >
            <X className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 200px)' }}>
          {/* Pipeline visual */}
          <div className="px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--dome-text-muted)' }}>
              Pipeline
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {workflow.nodes.map((node, i) => {
                const nodeMeta = NODE_TYPE_META[node.data.type] ?? FALLBACK_META;
                const NodeIcon = nodeMeta.Icon;
                return (
                  <div key={node.id} className="flex items-center gap-2">
                    {i > 0 && (
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                    )}
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                      style={{ background: 'var(--dome-accent-bg)', border: '1px solid var(--dome-border)' }}
                    >
                      <NodeIcon className="w-3 h-3" style={{ color: nodeMeta.color }} />
                      <span className="text-xs font-medium" style={{ color: nodeMeta.color }}>
                        {node.data.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Long description */}
          {workflow.longDescription && (
            <div className="px-5 pb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                Descripción
              </h3>
              <p className="text-sm" style={{ color: 'var(--dome-text-secondary)', lineHeight: 1.7 }}>
                {workflow.longDescription}
              </p>
            </div>
          )}

          {/* Agents used */}
          {agentNodes.length > 0 && (
            <div className="px-5 pb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--dome-text-muted)' }}>
                Agentes en el workflow
              </h3>
              <div className="space-y-2">
                {agentNodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{
                      background: 'var(--dome-bg)',
                      border: '1px solid var(--dome-border)',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: 'var(--dome-accent)' }}
                    >
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                        {node.data.label}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                        {(node.data as { agentName?: string }).agentName ?? 'Agente personalizable'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Difficulty + time + stats */}
          <div className="px-5 pb-4">
            <div className="flex items-center flex-wrap gap-2 mb-3">
              {workflow.difficulty && (
                <span
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    background: DIFFICULTY_STYLES[workflow.difficulty].bg,
                    color: DIFFICULTY_STYLES[workflow.difficulty].text,
                  }}
                >
                  <span>{DIFFICULTY_STYLES[workflow.difficulty].icon}</span>
                  {DIFFICULTY_STYLES[workflow.difficulty].label}
                </span>
              )}
              {workflow.estimatedTime && (
                <span
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: '#e0f2fe', color: '#0369a1' }}
                >
                  <Clock className="w-3 h-3" />
                  {workflow.estimatedTime}
                </span>
              )}
              <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {workflow.nodes.length} nodos
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {workflow.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full capitalize font-medium"
                  style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Use cases */}
          {workflow.useCases && workflow.useCases.length > 0 && (
            <div className="px-5 pb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--dome-text-muted)' }}>
                <Lightbulb className="w-3 h-3 inline mr-1 -mt-0.5" />
                Casos de uso
              </h3>
              <ul className="space-y-1.5">
                {workflow.useCases.map((useCase, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--dome-text-secondary)' }}>
                    <ArrowRight size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--dome-accent)' }} />
                    {useCase}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid var(--dome-border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            by {workflow.author}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm transition-colors hover:opacity-80"
              style={{
                background: 'var(--dome-bg)',
                color: 'var(--dome-text-secondary)',
                border: '1px solid var(--dome-border)',
              }}
            >
              Cerrar
            </button>
            <button
              onClick={() => onInstall(workflow)}
              disabled={isInstalling}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
              style={{
                background: isInstalled ? 'var(--success-bg)' : 'var(--dome-accent)',
                color: isInstalled ? 'var(--success)' : 'white',
                boxShadow: isInstalled ? 'none' : '0 2px 8px rgba(89, 96, 55, 0.3)',
              }}
            >
              {isInstalling ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Instalando...
                </span>
              ) : isInstalled && !hasUpdate ? (
                <>
                  <Play className="w-4 h-4" />
                  Abrir en Canvas
                </>
              ) : hasUpdate ? (
                <>
                  <Download className="w-4 h-4" />
                  Actualizar
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Instalar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
