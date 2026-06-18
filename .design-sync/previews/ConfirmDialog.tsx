import { ConfirmDialog } from 'dome';

export const Danger = () => (
  <ConfirmDialog
    isOpen
    title="¿Eliminar recurso?"
    message="Esta acción no se puede deshacer. El recurso y sus resúmenes se borrarán permanentemente."
    confirmLabel="Eliminar"
    cancelLabel="Cancelar"
    variant="danger"
    onConfirm={() => {}}
    onCancel={() => {}}
  />
);
