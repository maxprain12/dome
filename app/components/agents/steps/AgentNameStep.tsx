'use client';

import { useState, useEffect } from 'react';

export interface AgentNameData {
  name: string;
  description: string;
}

interface AgentNameStepProps {
  initialName?: string;
  initialDescription?: string;
  onChange: (data: AgentNameData) => void;
  onValidationChange: (valid: boolean) => void;
}

export default function AgentNameStep({
  initialName = '',
  initialDescription = '',
  onChange,
  onValidationChange,
}: AgentNameStepProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    onChange({ name, description });
    onValidationChange(name.trim().length > 0);
  }, [name, description, onChange, onValidationChange]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--primary-text)' }}>
          Nombre *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Investigador, Editor, Resumidor..."
          className="w-full px-3 py-2 rounded-lg text-sm border"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg)',
            color: 'var(--primary-text)',
          }}
          maxLength={80}
          autoFocus
        />
        {name.trim().length === 0 && (
          <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>
            El agente necesita un nombre para empezar.
          </p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--primary-text)' }}>
          Descripción
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe qué hace este agente y para qué sirve."
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm border resize-none"
          style={{
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg)',
            color: 'var(--primary-text)',
          }}
        />
      </div>
    </div>
  );
}
