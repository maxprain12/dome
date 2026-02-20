'use client';

interface AgentIconStepProps {
  selectedIndex: number;
  onChange: (index: number) => void;
}

const ICON_COUNT = 18;

export default function AgentIconStep({ selectedIndex, onChange }: AgentIconStepProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
        Elige un icono para identificar a tu agente en el sidebar.
      </p>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: ICON_COUNT }, (_, i) => {
          const idx = i + 1;
          const isSelected = selectedIndex === idx;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onChange(idx)}
              className={`flex items-center justify-center w-12 h-12 rounded-xl border-2 transition-all ${isSelected ? 'ring-2 ring-[var(--accent)]' : ''
                }`}
              style={{
                borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--bg-secondary)',
              }}
            >
              <img
                src={`/agents/sprite_${idx}.png`}
                alt={`Icon ${idx}`}
                className="w-8 h-8 object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
