import { DomeDrawerLayout, DomeSubpageHeader, DomeButton, DomeListRow, DomeIconBox } from 'dome';
import { FileText } from 'lucide-react';

export const Default = () => (
  <div style={{ padding: 12, maxWidth: 460, height: 420 }}>
    <DomeDrawerLayout
      header={<DomeSubpageHeader title="Detalles del recurso" subtitle="Introducción al Cálculo" onBack={() => {}} backLabel="Cerrar" />}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <DomeButton variant="ghost" size="sm">Eliminar</DomeButton>
          <DomeButton variant="primary" size="sm">Abrir</DomeButton>
        </div>
      }
    >
      <DomeListRow icon={<DomeIconBox><FileText size={16} color="var(--accent)" /></DomeIconBox>} title="Capítulo 1 — Límites" subtitle="8 páginas" />
      <DomeListRow icon={<DomeIconBox><FileText size={16} color="var(--accent)" /></DomeIconBox>} title="Capítulo 2 — Derivadas" subtitle="12 páginas" />
      <DomeListRow icon={<DomeIconBox><FileText size={16} color="var(--accent)" /></DomeIconBox>} title="Capítulo 3 — Integrales" subtitle="10 páginas" />
    </DomeDrawerLayout>
  </div>
);
