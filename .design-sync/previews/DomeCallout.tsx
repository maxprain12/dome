import { DomeCallout } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16, maxWidth: 460 }}>{children}</div>
);

export const Tones = () => (
  <Wrap>
    <DomeCallout tone="info" title="Indexación en curso">
      Estamos generando los embeddings de este documento. La búsqueda semántica estará disponible en unos segundos.
    </DomeCallout>
    <DomeCallout tone="success" title="Recurso procesado">
      El PDF se importó y se extrajeron 18 secciones correctamente.
    </DomeCallout>
    <DomeCallout tone="warning" title="Texto parcial">
      Algunas páginas escaneadas no contienen texto seleccionable; se usó OCR como respaldo.
    </DomeCallout>
    <DomeCallout tone="error" title="No se pudo conectar">
      Verifica tu clave de API en Ajustes → IA para continuar con la transcripción.
    </DomeCallout>
  </Wrap>
);

export const Simple = () => (
  <Wrap>
    <DomeCallout tone="info">Consejo: arrastra archivos a la biblioteca para importarlos al instante.</DomeCallout>
  </Wrap>
);
