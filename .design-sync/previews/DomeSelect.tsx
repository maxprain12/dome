import { DomeSelect } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, maxWidth: 360 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeSelect label="Tipo de recurso" defaultValue="pdf">
      <option value="note">Nota</option>
      <option value="pdf">PDF</option>
      <option value="video">Vídeo</option>
      <option value="audio">Audio</option>
    </DomeSelect>
  </Wrap>
);

export const WithHint = () => (
  <Wrap>
    <DomeSelect label="Idioma" defaultValue="es" hint="Afecta la transcripción y el resumen">
      <option value="es">Español</option>
      <option value="en">English</option>
      <option value="fr">Français</option>
      <option value="pt">Português</option>
    </DomeSelect>
  </Wrap>
);

export const WithError = () => (
  <Wrap>
    <DomeSelect label="Proyecto" defaultValue="" error="Selecciona un proyecto">
      <option value="">—</option>
      <option value="a">Tesis de maestría</option>
      <option value="b">Curso de Física</option>
    </DomeSelect>
  </Wrap>
);
