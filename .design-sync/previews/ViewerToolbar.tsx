import { ViewerToolbar, DomeButton } from 'dome';
import { ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight } from 'lucide-react';

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 620 }}>{children}</div>
);

export const Default = () => (
  <Wrap>
    <ViewerToolbar
      left={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--primary-text)' }}>Introducción al Cálculo.pdf</span>}
      center={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DomeButton variant="ghost" size="sm" iconOnly aria-label="Anterior"><ChevronLeft size={16} /></DomeButton>
          <span style={{ fontSize: 12, color: 'var(--secondary-text)' }}>3 / 24</span>
          <DomeButton variant="ghost" size="sm" iconOnly aria-label="Siguiente"><ChevronRight size={16} /></DomeButton>
        </div>
      }
      right={
        <div style={{ display: 'flex', gap: 4 }}>
          <DomeButton variant="ghost" size="sm" iconOnly aria-label="Alejar"><ZoomOut size={16} /></DomeButton>
          <DomeButton variant="ghost" size="sm" iconOnly aria-label="Acercar"><ZoomIn size={16} /></DomeButton>
          <DomeButton variant="ghost" size="sm" iconOnly aria-label="Descargar"><Download size={16} /></DomeButton>
        </div>
      }
    />
  </Wrap>
);
