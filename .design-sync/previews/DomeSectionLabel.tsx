import { DomeSectionLabel } from 'dome';

export const Default = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <DomeSectionLabel>Recursos recientes</DomeSectionLabel>
    <p style={{ margin: '6px 0 0', color: 'var(--secondary-text)', fontSize: 14 }}>
      Lo último que has añadido a tu biblioteca.
    </p>
  </div>
);

export const Compact = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <DomeSectionLabel compact>Metadatos</DomeSectionLabel>
    <p style={{ margin: '6px 0 0', color: 'var(--secondary-text)', fontSize: 14 }}>
      Autor, fecha y etiquetas del recurso.
    </p>
  </div>
);
