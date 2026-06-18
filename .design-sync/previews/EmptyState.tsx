import { EmptyState } from 'dome';
import { Inbox } from 'lucide-react';

export const Default = () => (
  <div style={{ padding: 24, maxWidth: 440 }}>
    <EmptyState
      icon={Inbox}
      title="Nada por aquí todavía"
      description="Cuando importes o crees recursos, aparecerán en esta sección."
    />
  </div>
);
