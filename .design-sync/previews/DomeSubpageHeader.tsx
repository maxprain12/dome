import { DomeSubpageHeader, DomeButton } from 'dome';
import { Share2 } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 560 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeSubpageHeader
      title="Tesis de maestría"
      subtitle="12 recursos · actualizado hace 2 días"
      onBack={() => {}}
      backLabel="Biblioteca"
      trailing={<DomeButton variant="secondary" size="sm" leftIcon={<Share2 size={14} />}>Compartir</DomeButton>}
    />
  </Wrap>
);

export const TitleOnly = () => (
  <Wrap>
    <DomeSubpageHeader title="Ajustes de IA" onBack={() => {}} backLabel="Volver" />
  </Wrap>
);
