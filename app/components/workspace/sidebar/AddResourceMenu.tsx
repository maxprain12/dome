/** Sidebar "add resource" menu + relative-time helper (03/T02 — from UnifiedSidebar.tsx). */

import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { CloudIcon, File02Icon, Layers01Icon, Link01Icon, NoteEditIcon, Upload04Icon } from '@hugeicons/core-free-icons';

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export interface AddResourceMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCreateNote: () => void;
  onCreateNotebook: () => void;
  onAddUrl: () => void;
  onImportFile: () => void;
  onImportFromCloud: () => void;
  onCreateArtifact: () => void;
}

export default function AddResourceMenu({ x, y, onClose, onCreateNote, onCreateNotebook, onAddUrl, onImportFile, onImportFromCloud, onCreateArtifact }: AddResourceMenuProps) {
  const { t } = useTranslation();
  const ITEMS = [
    { icon: File02Icon, label: t('toolbar.note'), action: onCreateNote },
    { icon: NoteEditIcon, label: 'Notebook', action: onCreateNotebook },
    { icon: Layers01Icon, label: t('artifacts.new_artifact'), action: onCreateArtifact },
    { icon: Link01Icon, label: 'URL / Artículo', action: onAddUrl },
    { icon: Upload04Icon, label: 'Importar fichero', action: onImportFile },
    { icon: CloudIcon, label: 'Importar desde Cloud', action: onImportFromCloud },
  ];

  return (
    <DropdownMenu open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DropdownMenuTrigger render={<span className="fixed size-px" style={{ left: x, top: y }} aria-hidden />} />
      <DropdownMenuContent align="start" side="bottom" sideOffset={0} className="min-w-[170px]">
      <DropdownMenuGroup>
      {ITEMS.map((item) => (
        <DropdownMenuItem
          key={item.label}
          onClick={() => { item.action(); onClose(); }}
        >
          <HugeiconsIcon icon={item.icon as IconSvgElement} className="text-muted-foreground" />
          <span>{item.label}</span>
        </DropdownMenuItem>
      ))}
      </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// UnifiedSidebar
// ---------------------------------------------------------------------------
