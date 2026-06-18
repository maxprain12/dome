import { ErrorState } from 'dome';

export const Default = () => (
  <div style={{ padding: 24, maxWidth: 440 }}>
    <ErrorState error="No se pudo cargar la biblioteca. Comprueba tu conexión." onRetry={() => {}} />
  </div>
);

export const NoRetry = () => (
  <div style={{ padding: 24, maxWidth: 440 }}>
    <ErrorState error="El archivo está dañado y no puede abrirse." />
  </div>
);
