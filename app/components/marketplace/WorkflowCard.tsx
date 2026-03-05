'use client';

import { Download, Play, ArrowRight, Bot, Clock, Zap, Type, FileText, Image, Terminal, Sparkles } from 'lucide-react';
import type { WorkflowTemplate } from '@/types/canvas';

interface WorkflowCardProps {
  workflow: WorkflowTemplate;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: (workflow: WorkflowTemplate) => void;
  onViewDetail: (workflow: WorkflowTemplate) => void;
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  research: { bg: 'var(--info-bg)', text: 'var(--info)' },
  writing: { bg: 'var(--success-bg)', text: 'var(--success)' },
  education: { bg: 'var(--success-bg)', text: 'var(--success)' },
  content: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  data: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  productivity: { bg: 'var(--success-bg)', text: 'var(--success)' },
  marketing: { bg: 'var(--info-bg)', text: 'var(--info)' },
  analytics: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  learning: { bg: 'var(--success-bg)', text: 'var(--success)' },
};

const DIFFICULTY_STYLES = {
  beginner: { bg: '#f0fdf4', text: '#15803d', label: 'Básico' },
  intermediate: { bg: '#fffbeb', text: '#92400e', label: 'Medio' },
  advanced: { bg: '#fef2f2', text: '#991b1b', label: 'Avanzado' },
};

const NODE_ICONS: Record<string, React.ElementType> = {
  'text-input': Type,
  document: FileText,
  image: Image,
  agent: Bot,
  output: Terminal,
};

function getTagStyle(tag: string) {
  return TAG_COLORS[tag] ?? { bg: 'var(--dome-bg)', text: 'var(--dome-text-muted)' };
}

export default function WorkflowCard({
  workflow,
  isInstalled,
  isInstalling,
  onInstall,
  onViewDetail,
}: WorkflowCardProps) {
  const agentCount = workflow.nodes.filter((n) => n.data.type === 'agent').length;
  const nodeCount = workflow.nodes.length;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all hover:shadow-md cursor-pointer group"
      style={{
        background: 'var(--dome-surface)',
        border: '1px solid var(--dome-border)',
      }}
      onClick={() => onViewDetail(workflow)}
    >
      {/* Header visual — workflow pipeline preview */}
      <div
        className="px-4 py-3 flex items-center gap-1.5 overflow-hidden"
        style={{
          background: 'var(--dome-bg)',
          borderBottom: '1px solid var(--dome-border)',
        }}
      >
        {workflow.nodes.slice(0, 5).map((node, i) => {
          const colors: Record<string, string> = {
            'text-input': 'var(--dome-accent)',
            document: 'var(--success)',
            image: 'var(--warning)',
            agent: 'var(--dome-accent)',
            output: 'var(--dome-accent)',
          };
          const color = colors[node.data.type] ?? 'var(--dome-accent)';
          const Icon = NODE_ICONS[node.data.type] || Bot;
          return (
            <div key={node.id} className="flex items-center gap-1">
              {i > 0 && (
                <ArrowRight className="w-2.5 h-2.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
              )}
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white"
                style={{ background: color }}
                title={node.data.label}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>
          );
        })}
        {workflow.nodes.length > 5 && (
          <span className="text-xs font-medium ml-0.5" style={{ color: 'var(--dome-accent)' }}>
            +{workflow.nodes.length - 5}
          </span>
        )}
        <div className="flex-1" />
        {/* Difficulty + time badges */}
        {workflow.difficulty && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
            style={{
              background: DIFFICULTY_STYLES[workflow.difficulty].bg,
              color: DIFFICULTY_STYLES[workflow.difficulty].text,
            }}
          >
            {DIFFICULTY_STYLES[workflow.difficulty].label}
          </span>
        )}
        {workflow.estimatedTime && (
          <span
            className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
            style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
          >
            <Clock className="w-2.5 h-2.5" />
            {workflow.estimatedTime}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold leading-snug" style={{ color: 'var(--dome-text)' }}>
            {workflow.name}
          </h3>
          {workflow.featured && (
            <span
              className="px-1.5 py-0.5 rounded-full shrink-0 flex items-center justify-center"
              style={{ background: 'var(--dome-bg)', color: 'var(--dome-text-muted)', border: '1px solid var(--dome-border)' }}
            >
              <Sparkles className="w-3 h-3" />
            </span>
          )}
        </div>
        <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--dome-text-secondary)' }}>
          {workflow.description}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 mb-3 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          <span>{nodeCount} nodos</span>
          <span>·</span>
          <span>{agentCount} agentes</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {workflow.tags.slice(0, 3).map((tag) => {
            const style = getTagStyle(tag);
            return (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                style={{ background: style.bg, color: style.text }}
              >
                {tag}
              </span>
            );
          })}
        </div>

        {/* Author + action */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
            by {workflow.author}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInstall(workflow);
            }}
            disabled={isInstalling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{
              background: isInstalled ? 'var(--success-bg)' : 'var(--dome-accent)',
              color: isInstalled ? 'var(--success)' : 'white',
            }}
          >
            {isInstalled ? (
              <>
                <Play className="w-3 h-3" />
                Abrir en Canvas
              </>
            ) : isInstalling ? (
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full border border-white border-t-transparent animate-spin" />
                Instalando...
              </span>
            ) : (
              <>
                <Download className="w-3 h-3" />
                Instalar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
