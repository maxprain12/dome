import { DomeProgressBar } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16, maxWidth: 420 }}>{children}</div>
);

export const Variants = () => (
  <Wrap>
    <DomeProgressBar value={62} label="Indexando recursos" />
    <DomeProgressBar value={100} variant="success" label="Importación completa" />
    <DomeProgressBar value={35} variant="error" label="Subida interrumpida" />
  </Wrap>
);

export const Sizes = () => (
  <Wrap>
    <DomeProgressBar value={45} size="sm" label="Pequeño" />
    <DomeProgressBar value={45} size="md" label="Mediano" />
  </Wrap>
);

export const Indeterminate = () => (
  <Wrap>
    <DomeProgressBar indeterminate label="Transcribiendo audio…" aria-label="Transcribiendo audio" />
  </Wrap>
);
