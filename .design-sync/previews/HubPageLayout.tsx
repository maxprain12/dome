import { useState } from 'react';
import { HubPageLayout, HubToolbar, HubTitleBlock, HubSearchField, HubBentoCard, HubEntityIcon, DomeButton } from 'dome';
import { Bot, Plus } from 'lucide-react';

export const Default = () => {
  const [q, setQ] = useState('');
  return (
    <div style={{ padding: 12, maxWidth: 720 }}>
      <HubPageLayout
        header={
          <HubToolbar
            leading={<HubTitleBlock icon={Bot} title="Agentes" subtitle="Asistentes de IA configurables" />}
            center={<HubSearchField value={q} onChange={setQ} placeholder="Buscar agentes…" ariaLabel="Buscar" />}
            trailing={<DomeButton variant="primary" size="sm" leftIcon={<Plus size={14} />}>Crear</DomeButton>}
          />
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <HubBentoCard icon={<HubEntityIcon kind="agent" />} title="Tutor de Cálculo" subtitle="Responde dudas y genera ejercicios" />
          <HubBentoCard icon={<HubEntityIcon kind="agent" />} title="Corrector de estilo" subtitle="Revisa redacción académica" />
        </div>
      </HubPageLayout>
    </div>
  );
};
