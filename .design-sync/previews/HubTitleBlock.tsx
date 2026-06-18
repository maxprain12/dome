import { HubTitleBlock } from 'dome';
import { Bot, Workflow, Rss } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 16, maxWidth: 460 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <HubTitleBlock icon={Bot} title="Agentes" subtitle="Asistentes de IA configurables para tareas repetitivas." />
  </Wrap>
);

export const Variants = () => (
  <Wrap>
    <HubTitleBlock icon={Workflow} title="Flujos de trabajo" subtitle="Encadena agentes en procesos de varios pasos." />
    <HubTitleBlock icon={Rss} title="Feeders" subtitle="Importa contenido de la web automáticamente." />
  </Wrap>
);
