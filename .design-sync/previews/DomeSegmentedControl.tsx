import { useState } from 'react';
import { DomeSegmentedControl } from 'dome';
import { LayoutGrid, List, Calendar } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16, maxWidth: 380, alignItems: 'flex-start' }}>{children}</div>
);

export const Default = () => {
  const [v, setV] = useState('grid');
  return (
    <Wrap>
      <DomeSegmentedControl
        aria-label="Vista"
        value={v}
        onChange={setV}
        options={[
          { value: 'grid', label: 'Cuadrícula' },
          { value: 'list', label: 'Lista' },
          { value: 'graph', label: 'Grafo' },
        ]}
      />
    </Wrap>
  );
};

export const WithIcons = () => {
  const [v, setV] = useState('list');
  return (
    <Wrap>
      <DomeSegmentedControl
        aria-label="Disposición"
        size="md"
        value={v}
        onChange={setV}
        options={[
          { value: 'grid', label: 'Cuadrícula', icon: <LayoutGrid size={14} /> },
          { value: 'list', label: 'Lista', icon: <List size={14} /> },
          { value: 'cal', label: 'Agenda', icon: <Calendar size={14} /> },
        ]}
      />
    </Wrap>
  );
};
