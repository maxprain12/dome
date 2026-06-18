import { useState } from 'react';
import { DomeCheckbox } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, maxWidth: 380 }}>{children}</div>
);

export const Default = () => {
  const [on, setOn] = useState(true);
  return (
    <Wrap>
      <DomeCheckbox label="Incluir en la búsqueda" checked={on} onChange={(e) => setOn(e.currentTarget.checked)} />
    </Wrap>
  );
};

export const WithDescription = () => {
  const [on, setOn] = useState(true);
  return (
    <Wrap>
      <DomeCheckbox
        label="Generar flashcards automáticamente"
        description="Tras procesar el recurso, Dome creará tarjetas de estudio a partir de los conceptos clave."
        checked={on}
        onChange={(e) => setOn(e.currentTarget.checked)}
      />
    </Wrap>
  );
};

export const WithError = () => (
  <Wrap>
    <DomeCheckbox label="Acepto los términos" error="Debes aceptar para continuar" />
  </Wrap>
);
