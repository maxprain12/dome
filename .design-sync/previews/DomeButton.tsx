import { DomeButton } from 'dome';
import { Plus, Search, Trash2, ArrowRight } from 'lucide-react';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 16 }}>{children}</div>
);

export const Variants = () => (
  <Row>
    <DomeButton variant="primary">Crear recurso</DomeButton>
    <DomeButton variant="secondary">Cancelar</DomeButton>
    <DomeButton variant="ghost">Más tarde</DomeButton>
    <DomeButton variant="outline">Importar</DomeButton>
    <DomeButton variant="danger">Eliminar</DomeButton>
  </Row>
);

export const Sizes = () => (
  <Row>
    <DomeButton size="xs">Extra small</DomeButton>
    <DomeButton size="sm">Small</DomeButton>
    <DomeButton size="md">Medium</DomeButton>
    <DomeButton size="lg">Large</DomeButton>
  </Row>
);

export const WithIcons = () => (
  <Row>
    <DomeButton variant="primary" leftIcon={<Plus size={16} />}>Nuevo proyecto</DomeButton>
    <DomeButton variant="secondary" leftIcon={<Search size={16} />}>Buscar</DomeButton>
    <DomeButton variant="ghost" rightIcon={<ArrowRight size={16} />}>Continuar</DomeButton>
    <DomeButton variant="danger" iconOnly aria-label="Eliminar"><Trash2 size={16} /></DomeButton>
  </Row>
);

export const States = () => (
  <Row>
    <DomeButton variant="primary" loading>Guardando…</DomeButton>
    <DomeButton variant="primary" disabled>Deshabilitado</DomeButton>
    <DomeButton variant="secondary" disabled>No disponible</DomeButton>
  </Row>
);
