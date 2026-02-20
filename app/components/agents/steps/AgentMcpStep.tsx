'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db/client';

interface MCPServerConfig {
  name: string;
  enabled?: boolean;
}

interface AgentMcpStepProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function AgentMcpStep({ selectedIds, onChange }: AgentMcpStepProps) {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadServers = useCallback(async () => {
    if (!db.isAvailable()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await db.getSetting('mcp_servers');
      if (result.success && result.data) {
        try {
          const parsed = JSON.parse(result.data) as unknown;
          const list = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === 'object' && parsed.mcpServers
              ? Object.keys(parsed.mcpServers as Record<string, unknown>).map((name) => ({ name, enabled: true }))
              : [];
          setServers(list.filter((s): s is MCPServerConfig => s && typeof s === 'object' && typeof (s as MCPServerConfig).name === 'string'));
        } catch {
          setServers([]);
        }
      } else {
        setServers([]);
      }
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const selectedSet = new Set(selectedIds);

  const toggle = (name: string) => {
    if (selectedSet.has(name)) {
      onChange(selectedIds.filter((x) => x !== name));
    } else {
      onChange([...selectedIds, name]);
    }
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
        Cargando servidores MCP...
      </p>
    );
  }

  if (servers.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
        No hay servidores MCP configurados. Añade MCPs en Ajustes → MCP para que estén disponibles aquí.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
        Elige los servidores MCP que este agente podrá usar. MCP amplía las capacidades con herramientas externas.
      </p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {servers.map((s) => (
          <label
            key={s.name}
            className="flex items-center gap-2 cursor-pointer py-2 px-2 rounded-lg hover:bg-[var(--bg-hover)]"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(s.name)}
              onChange={() => toggle(s.name)}
              className="rounded"
            />
            <span className="text-sm" style={{ color: 'var(--primary-text)' }}>
              {s.name}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
