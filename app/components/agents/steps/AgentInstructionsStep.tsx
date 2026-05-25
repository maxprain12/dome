'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DomeTextarea } from '@/components/ui/DomeInput';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';

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
      <DomeSectionLabel>{t('onboarding.instructions_label')}</DomeSectionLabel>
      <p className="text-xs mb-2" style={{ color: 'var(--dome-text-muted)' }}>
        {t('onboarding.instructions_tools_hint')}
      </p>
      <DomeTextarea
        id="agent-instructions-textarea"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder={t('onboarding.instructions_placeholder')}
        rows={8}
        textareaClassName="font-mono"
      />
    </div>
  );
}
