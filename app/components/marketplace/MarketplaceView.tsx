'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Store } from 'lucide-react';
import type { MarketplaceAgent } from '@/types';
import {
  getMarketplaceAgents,
  getInstalledMarketplaceAgentIds,
  installMarketplaceAgent,
} from '@/lib/marketplace/api';
import { MARKETPLACE_TAGS, type MarketplaceTag } from '@/lib/marketplace/catalog';
import { showToast } from '@/lib/store/useToastStore';
import MarketplaceAgentCard from './MarketplaceAgentCard';
import MarketplaceAgentDetail from './MarketplaceAgentDetail';

const TAG_LABELS: Record<string, string> = {
  all: 'Todos',
  research: 'Investigación',
  writing: 'Escritura',
  coding: 'Código',
  data: 'Datos',
  education: 'Educación',
  productivity: 'Productividad',
  content: 'Contenido',
  language: 'Idiomas',
  marketing: 'Marketing',
};

export default function MarketplaceView() {
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [installedIds, setInstalledIds] = useState<string[]>([]);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<MarketplaceTag>('all');
  const [selectedAgent, setSelectedAgent] = useState<MarketplaceAgent | null>(null);

  useEffect(() => {
    getMarketplaceAgents().then(setAgents);
    getInstalledMarketplaceAgentIds().then(setInstalledIds);
  }, []);

  const filteredAgents = useMemo(() => {
    let result = agents;
    if (activeTag !== 'all') {
      result = result.filter((a) => a.tags.includes(activeTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [agents, activeTag, searchQuery]);

  const handleInstall = async (agent: MarketplaceAgent) => {
    if (installingId) return;
    setInstallingId(agent.id);
    try {
      const result = await installMarketplaceAgent(agent.id);
      if (result.success) {
        setInstalledIds((prev) => [...prev, agent.id]);
        showToast('success', `"${agent.name}" instalado correctamente`);
        setSelectedAgent(null);
      } else {
        showToast('error', result.error ?? 'Error al instalar el agente');
      }
    } finally {
      setInstallingId(null);
    }
  };

  const featuredAgents = useMemo(
    () => filteredAgents.filter((a) => a.featured),
    [filteredAgents]
  );
  const communityAgents = useMemo(
    () => filteredAgents.filter((a) => !a.featured),
    [filteredAgents]
  );

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <div
        className="shrink-0 px-6 py-5"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--dome-accent-bg)' }}
          >
            <Store className="w-5 h-5" style={{ color: 'var(--dome-accent, #6366f1)' }} />
          </div>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--dome-text)' }}>
              Agent Marketplace
            </h1>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {agents.length} agentes disponibles
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: 'var(--dome-text-muted)' }}
          />
          <input
            type="text"
            placeholder="Buscar agentes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
            style={{
              background: 'var(--dome-surface)',
              color: 'var(--dome-text)',
              border: '1px solid var(--dome-border)',
            }}
          />
        </div>

        {/* Tag filters */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {MARKETPLACE_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{
                background: activeTag === tag ? 'var(--dome-accent, #6366f1)' : 'var(--dome-surface)',
                color: activeTag === tag ? 'white' : 'var(--dome-text-muted)',
                border: `1px solid ${activeTag === tag ? 'transparent' : 'var(--dome-border)'}`,
              }}
            >
              {TAG_LABELS[tag] ?? tag}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
        {filteredAgents.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-20 gap-3"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <Store className="w-10 h-10 opacity-30" />
            <p className="text-sm">No se encontraron agentes</p>
          </div>
        ) : (
          <>
            {featuredAgents.length > 0 && (
              <section className="mb-8">
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  ⭐ Destacados por Dome Team
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {featuredAgents.map((agent) => (
                    <MarketplaceAgentCard
                      key={agent.id}
                      agent={agent}
                      isInstalled={installedIds.includes(agent.id)}
                      isInstalling={installingId === agent.id}
                      onInstall={handleInstall}
                      onViewDetail={setSelectedAgent}
                    />
                  ))}
                </div>
              </section>
            )}

            {communityAgents.length > 0 && (
              <section>
                <h2
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  Comunidad
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {communityAgents.map((agent) => (
                    <MarketplaceAgentCard
                      key={agent.id}
                      agent={agent}
                      isInstalled={installedIds.includes(agent.id)}
                      isInstalling={installingId === agent.id}
                      onInstall={handleInstall}
                      onViewDetail={setSelectedAgent}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {selectedAgent && (
        <MarketplaceAgentDetail
          agent={selectedAgent}
          isInstalled={installedIds.includes(selectedAgent.id)}
          isInstalling={installingId === selectedAgent.id}
          onInstall={handleInstall}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
