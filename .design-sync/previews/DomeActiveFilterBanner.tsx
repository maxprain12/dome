import { DomeActiveFilterBanner } from 'dome';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 460 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <DomeActiveFilterBanner label={<span>Mostrando <strong>PDFs</strong> en <strong>Tesis de maestría</strong></span>} clearLabel="Limpiar filtros" onClear={() => {}} />
  </Wrap>
);

export const Search = () => (
  <Wrap>
    <DomeActiveFilterBanner label={<span>Resultados para «cálculo diferencial» — 24 recursos</span>} clearLabel="Borrar búsqueda" onClear={() => {}} />
  </Wrap>
);
