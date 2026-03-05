'use client';

import { useState } from 'react';
import { Download, CheckCircle2, Star, Wrench } from 'lucide-react';
import type { MarketplaceAgent } from '@/types';

interface MarketplaceAgentCardProps {
  agent: MarketplaceAgent;
  isInstalled: boolean;
  hasUpdate?: boolean;
  onInstall: (agent: MarketplaceAgent) => void;
  onViewDetail: (agent: MarketplaceAgent) => void;
  isInstalling?: boolean;
}

const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  research: { bg: 'var(--info-bg)', text: 'var(--info)' },
  writing: { bg: 'var(--success-bg)', text: 'var(--success)' },
  coding: { bg: 'var(--dome-accent-bg)', text: 'var(--dome-accent)' },
  data: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  education: { bg: 'var(--success-bg)', text: 'var(--success)' },
  productivity: { bg: 'var(--dome-accent-bg)', text: 'var(--dome-accent)' },
  content: { bg: 'var(--info-bg)', text: 'var(--info)' },
  language: { bg: 'var(--success-bg)', text: 'var(--success)' },
  marketing: { bg: 'var(--warning-bg)', text: 'var(--warning)' },
  academic: { bg: 'var(--dome-accent-bg)', text: 'var(--dome-accent)' },
  web: { bg: 'var(--dome-bg)', text: 'var(--dome-text-muted)' },
};

export default function MarketplaceAgentCard({
  agent,
  isInstalled,
  hasUpdate = false,
  onInstall,
  onViewDetail,
  isInstalling = false,
}: MarketplaceAgentCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative flex flex-col rounded-xl cursor-pointer transition-all duration-200"
      style={{
        background: hovered ? 'var(--dome-bg)' : 'var(--dome-surface)',
        border: `1px solid ${hovered ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onViewDetail(agent)}
    >
      {agent.featured && (
        <div
          className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
        >
          <Star className="w-3 h-3" />
          Dome Team
        </div>
      )}

      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-11 h-11 rounded-xl overflow-hidden"
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
              className="font-semibold text-sm leading-tight truncate"
              style={{ color: 'var(--dome-text)' }}
            >
              {agent.name}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
              por {agent.author}
            </p>
          </div>
        </div>

        {/* Description */}
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'var(--dome-text-secondary, var(--dome-text-muted))' }}
        >
          {agent.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {agent.tags.slice(0, 3).map((tag) => {
            const style = TAG_COLORS[tag] ?? { bg: 'var(--dome-bg)', text: 'var(--dome-text-muted)' };
            return (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs"
                style={{ background: style.bg, color: style.text }}
              >
                {tag}
              </span>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
            <div className="flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              <span>{agent.toolIds.length} tools</span>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if ((!isInstalled || hasUpdate) && !isInstalling) onInstall(agent);
            }}
            disabled={(isInstalled && !hasUpdate) || isInstalling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200"
            style={{
              background: isInstalled
                ? 'var(--dome-accent-bg)'
                : isInstalling
                  ? 'var(--dome-border)'
                  : 'var(--dome-accent)',
              color: isInstalled
                ? 'var(--dome-accent)'
                : isInstalling
                  ? 'var(--dome-text-muted)'
                  : 'white',
              cursor: (isInstalled && !hasUpdate) || isInstalling ? 'default' : 'pointer',
            }}
          >
            {isInstalling ? (
              <>
                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Instalando...
              </>
            ) : isInstalled ? (
              <>
                {hasUpdate ? (
                  <>
                    <Download className="w-3 h-3" />
                    Actualizar
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    Instalado
                  </>
                )}
              </>
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
