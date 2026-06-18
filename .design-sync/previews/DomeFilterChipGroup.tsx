import { useState } from 'react';
import { DomeFilterChipGroup } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 460 }}>{children}</div>
);

export const Default = () => {
  const [v, setV] = useState('all');
  return (
    <Wrap>
      <DomeFilterChipGroup
        value={v}
        onChange={setV}
        options={[
          { value: 'all', label: 'Todos' },
          { value: 'pdf', label: 'PDFs' },
          { value: 'note', label: 'Notas' },
          { value: 'video', label: 'Vídeos' },
          { value: 'audio', label: 'Audio' },
        ]}
      />
    </Wrap>
  );
};

export const Dense = () => {
  const [v, setV] = useState('recent');
  return (
    <Wrap>
      <DomeFilterChipGroup
        dense
        value={v}
        onChange={setV}
        options={[
          { value: 'recent', label: 'Recientes' },
          { value: 'favorites', label: 'Favoritos' },
          { value: 'shared', label: 'Compartidos' },
        ]}
      />
    </Wrap>
  );
};
