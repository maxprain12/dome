import { DomeCard } from 'dome';

export const Default = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <DomeCard>
      <h3 style={{ margin: 0, color: 'var(--primary-text)', fontSize: 16, fontWeight: 600 }}>Cálculo Diferencial</h3>
      <p style={{ margin: '6px 0 0', color: 'var(--secondary-text)', fontSize: 14, lineHeight: 1.5 }}>
        12 recursos · actualizado hace 2 días
      </p>
    </DomeCard>
  </div>
);

export const Paddings = () => (
  <div style={{ display: 'flex', gap: 12, padding: 16, flexWrap: 'wrap' }}>
    <DomeCard padding="sm"><span style={{ color: 'var(--secondary-text)', fontSize: 13 }}>Padding sm</span></DomeCard>
    <DomeCard padding="md"><span style={{ color: 'var(--secondary-text)', fontSize: 13 }}>Padding md</span></DomeCard>
    <DomeCard padding="lg"><span style={{ color: 'var(--secondary-text)', fontSize: 13 }}>Padding lg</span></DomeCard>
  </div>
);

export const RichContent = () => (
  <div style={{ padding: 16, maxWidth: 380 }}>
    <DomeCard padding="lg">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--primary-text)', fontSize: 15, fontWeight: 600 }}>Resumen de tesis</h3>
        <span style={{ color: 'var(--tertiary-text)', fontSize: 12 }}>PDF</span>
      </div>
      <p style={{ margin: '8px 0 0', color: 'var(--secondary-text)', fontSize: 14, lineHeight: 1.5 }}>
        Notas de lectura, citas destacadas y preguntas abiertas extraídas automáticamente del documento.
      </p>
    </DomeCard>
  </div>
);
