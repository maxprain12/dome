import { DomeModal, DomeButton, DomeInput } from 'dome';
import { FolderPlus } from 'lucide-react';

export const Default = () => (
  <DomeModal
    open
    onClose={() => {}}
    title="Nuevo proyecto"
    subtitle="Organiza tus recursos por tema o asignatura"
    headerIcon={<FolderPlus size={18} color="var(--accent)" />}
    footer={
      <>
        <DomeButton variant="ghost" size="sm">Cancelar</DomeButton>
        <DomeButton variant="primary" size="sm">Crear proyecto</DomeButton>
      </>
    }
  >
    <DomeInput label="Nombre" placeholder="Ej. Tesis de maestría" defaultValue="Cálculo Diferencial" />
  </DomeModal>
);
