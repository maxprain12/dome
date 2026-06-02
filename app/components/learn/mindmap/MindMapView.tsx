import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MindMap from '@/components/studio/MindMap';
import type { MindMapData, StudioOutput } from '@/types';

interface MindMapViewProps {
  output: StudioOutput;
  onBack: () => void;
}

export default function MindMapView({ output, onBack }: MindMapViewProps) {
  const { t } = useTranslation();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const data = useMemo(() => {
    if (!output.content) return { nodes: [], edges: [] } as MindMapData;
    try {
      return JSON.parse(output.content) as MindMapData;
    } catch {
      return { nodes: [], edges: [] } as MindMapData;
    }
  }, [output.content]);

  const selectedNode =
    (selectedNodeId ? data.nodes.find((n) => n.id === selectedNodeId) : null) ?? data.nodes[0];

  return (
    <div className="lr-mind">
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 2 }}>
        <button type="button" className="lr-deck-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
          {t('learn.back_to_library', 'Back to library')}
        </button>
      </div>
      <div className="lr-mind-canvas">
        <MindMap
          data={data}
          title={output.title}
          externalSelection
          onSelectedNodeChange={setSelectedNodeId}
        />
      </div>
      <aside className="lr-mind-side">
        <h4>{t('learn.mindmap_details', 'Details')}</h4>
        <p>{selectedNode?.label ?? output.title}</p>
        {selectedNode?.description ? <p>{selectedNode.description}</p> : null}
      </aside>
    </div>
  );
}
