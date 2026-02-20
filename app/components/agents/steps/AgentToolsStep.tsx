'use client';

import { useMemo } from 'react';
import { MANY_TOOL_CATALOG, getToolsByGroup, getGroupLabel } from '@/lib/agents/catalog';

interface AgentToolsStepProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function AgentToolsStep({ selectedIds, onChange }: AgentToolsStepProps) {
  const byGroup = useMemo(() => getToolsByGroup(), []);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleGroup = (group: string, select: boolean) => {
    const tools = byGroup.get(group as keyof typeof byGroup);
    if (!tools) return;
    if (select) {
      const next = new Set(selectedIds);
      tools.forEach((t) => next.add(t.id));
      onChange([...next]);
    } else {
      const remove = new Set(tools.map((t) => t.id));
      onChange(selectedIds.filter((id) => !remove.has(id)));
    }
  };

  const groups = Array.from(byGroup.keys()).sort();

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
        Elige las herramientas que este agente podrá usar. Las tools permiten buscar recursos, crear notas, flashcards, etc.
      </p>
      <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
        {groups.map((group) => {
          const tools = byGroup.get(group)!;
          const allSelected = tools.every((t) => selectedSet.has(t.id));

          return (
            <div
              key={group}
              className="rounded-lg border p-2"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--primary-text)' }}>
                  {getGroupLabel(group)}
                </span>
                <button
                  type="button"
                  onClick={() => toggleGroup(group, !allSelected)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-bg)' }}
                >
                  {allSelected ? 'Quitar todo' : 'Seleccionar todo'}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {tools.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex items-center gap-2 cursor-pointer py-1"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSet.has(tool.id)}
                      onChange={() => toggle(tool.id)}
                      className="rounded"
                    />
                    <span className="text-sm flex-1" style={{ color: 'var(--primary-text)' }}>
                      {tool.label}
                    </span>
                    <span
                      className="text-xs truncate max-w-[140px]"
                      style={{ color: 'var(--tertiary-text)' }}
                      title={tool.description}
                    >
                      {tool.description}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
