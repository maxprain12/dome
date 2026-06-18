import { DomeContextMenu, DomeButton } from 'dome';
import { MoreHorizontal, Pencil, Copy, Share2, Trash2 } from 'lucide-react';

export const Default = () => (
  <div style={{ padding: 24, maxWidth: 360 }}>
    <DomeContextMenu
      trigger={<DomeButton variant="secondary" size="sm" iconOnly aria-label="Más acciones"><MoreHorizontal size={16} /></DomeButton>}
      items={[
        { label: 'Renombrar', icon: <Pencil size={14} />, onClick: () => {} },
        { label: 'Duplicar', icon: <Copy size={14} />, onClick: () => {} },
        { label: 'Compartir', icon: <Share2 size={14} />, onClick: () => {} },
        { label: 'Eliminar', icon: <Trash2 size={14} />, onClick: () => {}, variant: 'danger', separator: true },
      ]}
    />
  </div>
);
