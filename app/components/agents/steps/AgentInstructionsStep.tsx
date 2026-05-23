'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface AgentInstructionsStepProps {
  initialInstructions?: string;
  onChange: (instructions: string) => void;
}

export default function AgentInstructionsStep({
  initialInstructions = '',
  onChange,
}: AgentInstructionsStepProps) {
  const { t } = useTranslation();
  const [instructions, setInstructions] = useState(initialInstructions);

  useEffect(() => {
    setInstructions(initialInstructions);
  }, [initialInstructions]);

  useEffect(() => {
    onChange(instructions);
  }, [instructions, onChange]);

  return (
    <div className="space-y-2">
      <label htmlFor="agent-instructions-textarea" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--primary-text)' }}>
        {t('onboarding.instructions_label')}
      </label>
      <p className="text-xs mb-2" style={{ color: 'var(--secondary-text)' }}>
        {t('onboarding.instructions_tools_hint')}
      </p>
      <textarea
        id="agent-instructions-textarea"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder={t('onboarding.instructions_placeholder')}
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
