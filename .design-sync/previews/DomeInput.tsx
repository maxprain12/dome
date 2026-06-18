import { DomeInput } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, maxWidth: 360 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeInput label="Título del recurso" placeholder="Ej. Apuntes de Álgebra Lineal" defaultValue="" />
  </Wrap>
);

export const WithHint = () => (
  <Wrap>
    <DomeInput label="Etiqueta" placeholder="añade una etiqueta" hint="Usa comas para separar varias etiquetas" />
  </Wrap>
);

export const WithError = () => (
  <Wrap>
    <DomeInput label="Nombre del proyecto" defaultValue="" error="Este campo es obligatorio" />
  </Wrap>
);

export const Disabled = () => (
  <Wrap>
    <DomeInput label="Identificador" defaultValue="res_8f3a21" disabled />
  </Wrap>
);
