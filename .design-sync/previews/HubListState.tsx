import { HubListState } from 'dome';
import { Bot } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 440 }}>{children}</div>
);

export const Empty = () => (
  <Wrap>
    <HubListState
      variant="empty"
      icon={<Bot size={28} color="var(--tertiary-text)" />}
      title="Sin agentes todavía"
      description="Crea tu primer agente para automatizar tareas de investigación."
    />
  </Wrap>
);

export const Loading = () => (
  <Wrap><HubListState variant="loading" loadingLabel="Cargando agentes…" /></Wrap>
);
