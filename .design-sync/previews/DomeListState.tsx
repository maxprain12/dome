import { DomeListState } from 'dome';
import { FolderOpen } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 420 }}>{children}</div>
);

export const Loading = () => (
  <Wrap><DomeListState variant="loading" loadingLabel="Cargando recursos…" /></Wrap>
);

export const Empty = () => (
  <Wrap>
    <DomeListState
      variant="empty"
      icon={<FolderOpen size={28} color="var(--tertiary-text)" />}
      title="Aún no hay recursos"
      description="Arrastra archivos o crea una nota para empezar tu biblioteca."
    />
  </Wrap>
);

export const Error = () => (
  <Wrap>
    <DomeListState
      variant="error"
      title="No se pudo cargar"
      errorMessage="Comprueba tu conexión e inténtalo de nuevo."
      retryLabel="Reintentar"
      onRetry={() => {}}
    />
  </Wrap>
);
