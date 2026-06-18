import { useState } from 'react';
import { DomeSlider } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16, maxWidth: 360 }}>{children}</div>
);

export const Default = () => {
  const [v, setV] = useState(40);
  return (
    <Wrap>
      <label style={{ color: 'var(--secondary-text)', fontSize: 13 }}>Temperatura del modelo: {(v / 100).toFixed(2)}</label>
      <DomeSlider min={0} max={100} value={v} onChange={(e) => setV(Number(e.currentTarget.value))} />
    </Wrap>
  );
};

export const Steps = () => {
  const [v, setV] = useState(3);
  return (
    <Wrap>
      <label style={{ color: 'var(--secondary-text)', fontSize: 13 }}>Resultados por página: {v}</label>
      <DomeSlider min={1} max={10} step={1} value={v} onChange={(e) => setV(Number(e.currentTarget.value))} />
    </Wrap>
  );
};
