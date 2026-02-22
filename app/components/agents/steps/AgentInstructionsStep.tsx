'use client';

import { useState, useEffect } from 'react';

interface AgentInstructionsStepProps {
  initialInstructions?: string;
  onChange: (instructions: string) => void;
}

const EXAMPLE =
  'Ejemplo: Eres un horticultor con experiencia en praderas naturales y plantas autóctonas. Ayudas a planificar jardines de bajo consumo de agua. Ten en cuenta la ubicación, el clima y las plantas disponibles en la zona.';

export default function AgentInstructionsStep({
  initialInstructions = '',
  onChange,
}: AgentInstructionsStepProps) {
  const [instructions, setInstructions] = useState(initialInstructions);

  // Sync when parent passes new initial values (e.g. edit mode)
  useEffect(() => {
    setInstructions(initialInstructions);
  }, [initialInstructions]);

  useEffect(() => {
    onChange(instructions);
  }, [instructions, onChange]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--primary-text)' }}>
        Instrucciones del sistema
      </label>
      <p className="text-xs mb-2" style={{ color: 'var(--secondary-text)' }}>
        Define el rol, comportamiento y restricciones del agente. El modelo seguirá estas instrucciones en cada conversación.
      </p>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder={EXAMPLE}
        rows={8}
        className="w-full px-3 py-2 rounded-lg text-sm border resize-none font-mono"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg)',
          color: 'var(--primary-text)',
        }}
      />
    </div>
  );
}
