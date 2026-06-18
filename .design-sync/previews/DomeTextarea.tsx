import { DomeTextarea } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, maxWidth: 380 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeTextarea label="Notas" placeholder="Escribe tus apuntes…" rows={4} />
  </Wrap>
);

export const WithHint = () => (
  <Wrap>
    <DomeTextarea label="Instrucciones para el agente" rows={4} hint="Describe la tarea con el mayor detalle posible." defaultValue="Resume el documento en 5 puntos clave y extrae las citas relevantes." />
  </Wrap>
);

export const WithError = () => (
  <Wrap>
    <DomeTextarea label="Descripción" rows={3} error="La descripción no puede estar vacía." defaultValue="" />
  </Wrap>
);
