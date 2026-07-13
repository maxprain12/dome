'use client';

import {
  TextFontIcon as TypeIcon,
  File02Icon as FileTextIcon,
  Image01Icon as ImageIcon,
  TerminalIcon as TerminalIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import type { CanvasNodeData, WorkflowNode } from '@/types/canvas';
import { CanvasPaletteSectionHeader, CanvasPaletteRow } from './CanvasPaletteParts';
import { createCanvasPaletteNode, handleCanvasPaletteDragStart } from './createCanvasPaletteNode';

const Type = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TypeIcon} {...props} />
);
const FileText = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={FileTextIcon} {...props} />
);
const Image = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={ImageIcon} {...props} />
);
const Terminal = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={TerminalIcon} {...props} />
);

const INPUT_NODE_CONFIG = [
  {
    type: 'text-input' as const,
    color: 'var(--primary)',
    icon: Type,
    labelKey: 'canvas.input_text_label',
    descKey: 'canvas.input_text_desc',
  },
  {
    type: 'document' as const,
    color: 'var(--success)',
    icon: FileText,
    labelKey: 'canvas.input_document_label',
    descKey: 'canvas.input_document_desc',
  },
  {
    type: 'image' as const,
    color: 'var(--warning)',
    icon: Image,
    labelKey: 'canvas.input_image_label',
    descKey: 'canvas.input_image_desc',
  },
];

export function CanvasInputsPalette({
  expanded,
  onToggle,
  onAddNode,
}: {
  expanded: boolean;
  onToggle: () => void;
  onAddNode: (node: WorkflowNode<CanvasNodeData>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="px-3 pt-2 pb-2">
      <CanvasPaletteSectionHeader
        expanded={expanded}
        onToggle={onToggle}
        label={t('canvas.palette_inputs')}
        count={INPUT_NODE_CONFIG.length}
      />
      {expanded && (
        <div className="flex flex-col gap-1.5">
          {INPUT_NODE_CONFIG.map((n) => (
            <CanvasPaletteRow
              key={n.type}
              icon={n.icon}
              label={t(n.labelKey)}
              description={t(n.descKey)}
              color={n.color}
              onAdd={() => onAddNode(createCanvasPaletteNode(t, n.type))}
              onDragStart={(e) => handleCanvasPaletteDragStart(e, n.type)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CanvasOutputsPalette({
  expanded,
  onToggle,
  onAddNode,
}: {
  expanded: boolean;
  onToggle: () => void;
  onAddNode: (node: WorkflowNode<CanvasNodeData>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="px-3 py-2">
      <CanvasPaletteSectionHeader
        expanded={expanded}
        onToggle={onToggle}
        label={t('canvas.palette_outputs')}
        count={1}
      />
      {expanded && (
        <CanvasPaletteRow
          icon={Terminal}
          label={t('canvas.output_result_label')}
          description={t('canvas.output_result_desc')}
          color="var(--info)"
          onAdd={() => onAddNode(createCanvasPaletteNode(t, 'output'))}
          onDragStart={(e) => handleCanvasPaletteDragStart(e, 'output')}
        />
      )}
    </div>
  );
}
