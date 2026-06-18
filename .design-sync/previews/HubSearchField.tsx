import { useState } from 'react';
import { HubSearchField } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 420 }}>{children}</div>
);

export const Default = () => {
  const [v, setV] = useState('');
  return (
    <Wrap>
      <HubSearchField value={v} onChange={setV} placeholder="Buscar agentes, flujos y feeders…" ariaLabel="Buscar" />
    </Wrap>
  );
};

export const WithValue = () => {
  const [v, setV] = useState('cálculo diferencial');
  return (
    <Wrap>
      <HubSearchField value={v} onChange={setV} placeholder="Buscar…" ariaLabel="Buscar" />
    </Wrap>
  );
};
