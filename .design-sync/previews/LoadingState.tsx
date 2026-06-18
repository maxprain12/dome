import { LoadingState } from 'dome';

export const Default = () => (
  <div style={{ padding: 24, maxWidth: 440 }}>
    <LoadingState message="Cargando tu biblioteca…" />
  </div>
);

export const NoMessage = () => (
  <div style={{ padding: 24, maxWidth: 440 }}>
    <LoadingState />
  </div>
);
