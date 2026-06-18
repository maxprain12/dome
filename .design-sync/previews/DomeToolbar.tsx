import { DomeToolbar, DomeButton, DomeSegmentedControl } from 'dome';
import { Plus, Filter, LayoutGrid, List } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 560 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeToolbar
      leading={<span style={{ fontSize: 15, fontWeight: 600, color: 'var(--primary-text)' }}>Biblioteca</span>}
      trailing={
        <>
          <DomeButton variant="ghost" size="sm" leftIcon={<Filter size={14} />}>Filtrar</DomeButton>
          <DomeButton variant="primary" size="sm" leftIcon={<Plus size={14} />}>Nuevo</DomeButton>
        </>
      }
    />
  </Wrap>
);

export const Dense = () => (
  <Wrap>
    <DomeToolbar
      dense
      leading={<span style={{ fontSize: 13, color: 'var(--secondary-text)' }}>24 recursos</span>}
      trailing={
        <DomeSegmentedControl
          aria-label="Vista"
          size="sm"
          value="grid"
          onChange={() => {}}
          options={[{ value: 'grid', label: 'Grid', icon: <LayoutGrid size={13} /> }, { value: 'list', label: 'Lista', icon: <List size={13} /> }]}
        />
      }
    />
  </Wrap>
);
