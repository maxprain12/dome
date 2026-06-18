import { DomeListRow, DomeIconBox, DomeBadge } from 'dome';
import { FileText, Video, Music, ChevronRight } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 16, maxWidth: 460 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeListRow
      icon={<DomeIconBox><FileText size={16} color="var(--accent)" /></DomeIconBox>}
      title="Introducción al Cálculo"
      subtitle="PDF · 24 páginas"
      meta="hace 2 h"
      trailing={<ChevronRight size={16} color="var(--tertiary-text)" />}
    />
  </Wrap>
);

export const List = () => (
  <Wrap>
    <DomeListRow interactive icon={<DomeIconBox><FileText size={16} color="var(--accent)" /></DomeIconBox>} title="Apuntes de Álgebra" subtitle="Nota" meta="ayer" trailing={<DomeBadge label="12" variant="soft" size="xs" />} />
    <DomeListRow interactive icon={<DomeIconBox><Video size={16} color="#dc2626" /></DomeIconBox>} title="Clase grabada — Límites" subtitle="Vídeo · 48 min" meta="hace 3 d" trailing={<ChevronRight size={16} color="var(--tertiary-text)" />} />
    <DomeListRow interactive icon={<DomeIconBox><Music size={16} color="#d97706" /></DomeIconBox>} title="Memo de voz" subtitle="Audio · 4 min" meta="hace 1 sem" trailing={<ChevronRight size={16} color="var(--tertiary-text)" />} />
  </Wrap>
);
