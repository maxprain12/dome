'use client';

import { useState, useEffect } from 'react';
import { Github, Plus, Trash2, RefreshCw, ExternalLink, FolderCog, Check } from 'lucide-react';
import { useMarketplaceStore, type MarketplaceConfig } from '@/lib/store/useMarketplaceStore';
import { showToast } from '@/lib/store/useToastStore';

interface SourceConfig {
  id: string;
  type: 'github' | 'skills_sh' | 'local';
  owner?: string;
  repo?: string;
  path?: string;
  ref?: string;
  category?: string;
  enabled: boolean;
}

export default function MarketplaceSettings() {
  const { config, fetchConfig, loading } = useMarketplaceStore();
  const [sources, setSources] = useState<Record<string, SourceConfig[]>>({
    agents: [],
    workflows: [],
    mcp: [],
    skills: []
  });
  const [newSource, setNewSource] = useState<{ category: string; owner: string; repo: string; path: string }>({
    category: 'agents',
    owner: '',
    repo: '',
    path: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      setSources({
        agents: config.agents?.sources || [],
        workflows: config.workflows?.sources || [],
        mcp: config.mcp?.sources || [],
        skills: config.skills?.sources || []
      });
    }
  }, [config]);

  const handleAddSource = async () => {
    if (!newSource.owner || !newSource.repo) {
      showToast({ title: 'Por favor completa owner y repo', type: 'error' });
      return;
    }

    const source: SourceConfig = {
      id: `${newSource.owner}-${newSource.repo}-${Date.now()}`,
      type: 'github',
      owner: newSource.owner,
      repo: newSource.repo,
      path: newSource.path || '.',
      ref: 'main',
      enabled: true
    };

    setSources(prev => ({
      ...prev,
      [newSource.category]: [...(prev[newSource.category] || []), source]
    }));

    setNewSource({ category: 'agents', owner: '', repo: '', path: '' });
    setIsAdding(false);
    
    showToast({ title: 'Fuente añadida. Guarda los cambios para aplicar.', type: 'success' });
  };

  const handleRemoveSource = (category: string, sourceId: string) => {
    setSources(prev => ({
      ...prev,
      [category]: prev[category].filter(s => s.id !== sourceId)
    }));
  };

  const handleToggleSource = (category: string, sourceId: string) => {
    setSources(prev => ({
      ...prev,
      [category]: prev[category].map(s => 
        s.id === sourceId ? { ...s, enabled: !s.enabled } : s
      )
    }));
  };

  const handleTestConnection = async (owner: string, repo: string) => {
    setTestingConnection(`${owner}/${repo}`);
    
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (response.ok) {
        showToast({ title: 'Conexión exitosa', type: 'success' });
      } else {
        showToast({ title: 'Repositorio no encontrado', type: 'error' });
      }
    } catch (err) {
      showToast({ title: 'Error de conexión', type: 'error' });
    } finally {
      setTestingConnection(null);
    }
  };

  const handleSave = async () => {
    try {
      const userConfig = {
        agents: { sources: sources.agents },
        workflows: { sources: sources.workflows },
        mcp: { sources: sources.mcp },
        skills: { sources: sources.skills }
      };
      
      await window.electron.invoke('marketplace:update-config', userConfig);
      showToast({ title: 'Configuración guardada', type: 'success' });
    } catch (err) {
      showToast({ title: 'Error al guardar', type: 'error' });
    }
  };

  const categories = [
    { id: 'agents', label: 'Agentes', icon: '🤖' },
    { id: 'workflows', label: 'Workflows', icon: '🔄' },
    { id: 'mcp', label: 'MCP Servers', icon: '🔌' },
    { id: 'skills', label: 'Skills', icon: '✨' }
  ] as const;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--dome-text)' }}>
          Configuración del Marketplace
        </h1>
        <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
          Configura las fuentes de donde se cargan los agentes, workflows, MCPs y skills.
        </p>
      </div>

      {/* Fuentes por categoría */}
      {categories.map(cat => (
        <div 
          key={cat.id} 
          className="mb-8 p-4 rounded-xl"
          style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{cat.icon}</span>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
              {cat.label}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--dome-accent)', color: 'white' }}>
              {sources[cat.id]?.filter(s => s.enabled).length || 0} activas
            </span>
          </div>

          <div className="space-y-3">
            {sources[cat.id]?.map(source => (
              <div 
                key={source.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
              >
                <div className="flex items-center gap-3">
                  {source.type === 'github' ? (
                    <Github className="w-4 h-4" style={{ color: 'var(--dome-text-muted)' }} />
                  ) : source.type === 'skills_sh' ? (
                    <FolderCog className="w-4 h-4" style={{ color: 'var(--dome-accent)' }} />
                  ) : null}
                  
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                      {source.owner && source.repo ? `${source.owner}/${source.repo}` : source.category || source.id}
                    </p>
                    {source.path && source.path !== '.' && (
                      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                        Path: {source.path}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {source.type === 'github' && source.owner && source.repo && (
                    <>
                      <button
                        onClick={() => handleTestConnection(source.owner!, source.repo!)}
                        disabled={testingConnection === `${source.owner}/${source.repo}`}
                        className="p-2 rounded-lg hover:opacity-80 transition-opacity"
                        style={{ background: 'var(--dome-surface)', color: 'var(--dome-text-muted)' }}
                        title="Probar conexión"
                      >
                        <RefreshCw className={`w-4 h-4 ${testingConnection === `${source.owner}/${source.repo}` ? 'animate-spin' : ''}`} />
                      </button>
                      <a
                        href={`https://github.com/${source.owner}/${source.repo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:opacity-80 transition-opacity"
                        style={{ background: 'var(--dome-surface)', color: 'var(--dome-text-muted)' }}
                        title="Ver repositorio"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </>
                  )}
                  
                  <button
                    onClick={() => handleToggleSource(cat.id, source.id)}
                    className={`p-2 rounded-lg transition-opacity ${source.enabled ? 'opacity-100' : 'opacity-40'}`}
                    style={{ background: source.enabled ? 'var(--dome-accent)' : 'var(--dome-surface)', color: 'white' }}
                    title={source.enabled ? 'Desactivar' : 'Activar'}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={() => handleRemoveSource(cat.id, source.id)}
                    className="p-2 rounded-lg hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--dome-surface)', color: 'var(--dome-text-muted)' }}
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {sources[cat.id]?.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--dome-text-muted)' }}>
                No hay fuentes configuradas para {cat.label}
              </p>
            )}
          </div>

          {/* Añadir fuente */}
          {isAdding && newSource.category === cat.id && (
            <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--dome-text-muted)' }}>Owner</label>
                  <input
                    type="text"
                    value={newSource.owner}
                    onChange={e => setNewSource(prev => ({ ...prev, owner: e.target.value }))}
                    placeholder="e.g., vercel-labs"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
                  />
                </div>
                <div>
                  <label className="text-xs block mb-1" style={{ color: 'var(--dome-text-muted)' }}>Repo</label>
                  <input
                    type="text"
                    value={newSource.repo}
                    onChange={e => setNewSource(prev => ({ ...prev, repo: e.target.value }))}
                    placeholder="e.g., skills"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: 'var(--dome-text-muted)' }}>Path (opcional)</label>
                <input
                  type="text"
                  value={newSource.path}
                  onChange={e => setNewSource(prev => ({ ...prev, path: e.target.value }))}
                  placeholder="e.g., agents, workflows, ."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddSource}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'var(--dome-accent)', color: 'white' }}
                >
                  Añadir
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-lg text-sm"
                  style={{ background: 'var(--dome-surface)', color: 'var(--dome-text-muted)' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {!isAdding && (
            <button
              onClick={() => {
                setNewSource(prev => ({ ...prev, category: cat.id }));
                setIsAdding(true);
              }}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--dome-accent)', color: 'white' }}
            >
              <Plus className="w-4 h-4" />
              Añadir fuente
            </button>
          )}
        </div>
      ))}

      {/* Botón de guardar */}
      <div className="flex justify-end gap-3">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-6 py-3 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: 'var(--dome-accent)', color: 'white' }}
        >
          {loading ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>

      {/* Información adicional */}
      <div className="mt-8 p-4 rounded-xl" style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
        <h3 className="font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
          Acerca de las fuentes del marketplace
        </h3>
        <ul className="text-sm space-y-2" style={{ color: 'var(--dome-text-muted)' }}>
          <li>• <strong>GitHub:</strong> Los repositorios deben contener archivos JSON con la definición de agentes, workflows, etc.</li>
          <li>• <strong>skills.sh:</strong> Skills disponibles públicamente en skills.sh (se añade automáticamente)</li>
          <li>• <strong>Local:</strong> Plugins instalados localmente en la carpeta de plugins</li>
          <li>• Los catálogos de Dome Team se cargan por defecto y no se pueden eliminar</li>
        </ul>
      </div>
    </div>
  );
}
