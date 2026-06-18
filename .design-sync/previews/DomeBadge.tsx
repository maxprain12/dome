import { DomeBadge } from 'dome';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16 }}>{children}</div>
);

export const Variants = () => (
  <Row>
    <DomeBadge label="Filled" variant="filled" />
    <DomeBadge label="Soft" variant="soft" />
    <DomeBadge label="Outline" variant="outline" />
  </Row>
);

export const Colors = () => (
  <Row>
    <DomeBadge label="PDF" color="var(--accent)" variant="soft" />
    <DomeBadge label="Nota" color="#16a34a" variant="soft" />
    <DomeBadge label="Vídeo" color="#dc2626" variant="soft" />
    <DomeBadge label="Audio" color="#d97706" variant="soft" />
    <DomeBadge label="Web" color="#7c3aed" variant="soft" />
  </Row>
);

export const Sizes = () => (
  <Row>
    <DomeBadge label="Extra small" size="xs" />
    <DomeBadge label="Small" size="sm" />
    <DomeBadge label="Medium" size="md" />
  </Row>
);

export const WithDot = () => (
  <Row>
    <DomeBadge label="Activo" color="#16a34a" variant="soft" dot />
    <DomeBadge label="Indexando" color="var(--accent)" variant="soft" dot />
    <DomeBadge label="Error" color="#dc2626" variant="soft" dot />
  </Row>
);
