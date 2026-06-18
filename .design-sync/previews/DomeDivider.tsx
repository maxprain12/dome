import { DomeDivider } from 'dome';

export const Horizontal = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <p style={{ margin: 0, color: 'var(--secondary-text)', fontSize: 14 }}>Sección anterior</p>
    <DomeDivider />
    <p style={{ margin: 0, color: 'var(--secondary-text)', fontSize: 14 }}>Sección siguiente</p>
  </div>
);

export const Vertical = () => (
  <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: 16 }}>
    <span style={{ color: 'var(--secondary-text)', fontSize: 14 }}>Biblioteca</span>
    <DomeDivider orientation="vertical" spacingClass="mx-3" />
    <span style={{ color: 'var(--secondary-text)', fontSize: 14 }}>Proyectos</span>
    <DomeDivider orientation="vertical" spacingClass="mx-3" />
    <span style={{ color: 'var(--secondary-text)', fontSize: 14 }}>Agentes</span>
  </div>
);
