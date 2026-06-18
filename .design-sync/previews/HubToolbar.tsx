import { useState } from 'react';
import { HubToolbar, HubSearchField, DomeButton } from 'dome';
import { Plus } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 620 }}>{children}</div>
);

export const Default = () => {
  const [q, setQ] = useState('');
  return (
    <Wrap>
      <HubToolbar
        leading={<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--primary-text)' }}>Agentes</span>}
        center={<HubSearchField value={q} onChange={setQ} placeholder="Buscar agentes…" ariaLabel="Buscar" />}
        trailing={<DomeButton variant="primary" size="sm" leftIcon={<Plus size={14} />}>Crear</DomeButton>}
      />
    </Wrap>
  );
};
