import { useState } from 'react';
import { DomeToggle } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 16, maxWidth: 380 }}>{children}</div>
);

export const Default = () => {
  const [on, setOn] = useState(true);
  return (
    <Wrap>
      <DomeToggle checked={on} onChange={setOn} label="Indexación semántica" />
    </Wrap>
  );
};

export const WithDescription = () => {
  const [on, setOn] = useState(true);
  return (
    <Wrap>
      <DomeToggle
        checked={on}
        onChange={setOn}
        label="Sincronización en la nube"
        description="Mantén tus recursos respaldados y disponibles en todos tus dispositivos."
      />
    </Wrap>
  );
};

export const Sizes = () => {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <Wrap>
      <DomeToggle checked={a} onChange={setA} label="Pequeño" size="sm" />
      <DomeToggle checked={b} onChange={setB} label="Mediano" size="md" />
    </Wrap>
  );
};
