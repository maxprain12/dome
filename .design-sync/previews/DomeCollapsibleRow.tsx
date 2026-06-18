import { useState } from 'react';
import { DomeCollapsibleRow } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 420 }}>{children}</div>
);

export const Expanded = () => {
  const [open, setOpen] = useState(true);
  return (
    <Wrap>
      <DomeCollapsibleRow
        expanded={open}
        onExpandedChange={setOpen}
        trigger={<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--primary-text)' }}>Opciones avanzadas</span>}
      >
        <p style={{ margin: '8px 0 0', color: 'var(--secondary-text)', fontSize: 14, lineHeight: 1.5 }}>
          Ajusta el modelo de embeddings, el tamaño de los chunks y la frecuencia de reindexación.
        </p>
      </DomeCollapsibleRow>
    </Wrap>
  );
};

export const Collapsed = () => {
  const [open, setOpen] = useState(false);
  return (
    <Wrap>
      <DomeCollapsibleRow
        expanded={open}
        onExpandedChange={setOpen}
        trigger={<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--primary-text)' }}>Metadatos del recurso</span>}
      >
        <p style={{ margin: '8px 0 0', color: 'var(--secondary-text)', fontSize: 14 }}>Autor, fecha y etiquetas.</p>
      </DomeCollapsibleRow>
    </Wrap>
  );
};
